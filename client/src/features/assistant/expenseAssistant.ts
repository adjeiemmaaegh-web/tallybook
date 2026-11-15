/**
 * Confirmation-gated expenses for Clementia. The authoritative expense
 * service, not the parser, enforces write permissions and data integrity.
 */
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { businessDayKey, shiftBusinessDay } from "@/features/business/businessCalendar.mjs";
import { createExpense, expenseCategoryLabels, expenseCategories, expenseFormSchema, type ExpenseCategory } from "@/features/expenses/expenses";
import { recordAudit } from "./audit";
import { failure, info, question } from "./replies";
import { sanitizeInput } from "./text";
import type { AssistantReply, ReplyDetail } from "./types";

type Draft = {
  companyId: string; request: string; submissionKey: string;
  category?: ExpenseCategory; amount?: string; date?: string;
  note?: string; token?: string; rows?: ReplyDetail[];
};
const CATEGORIES = expenseCategories.join(", ");
const START = /^(?:(?:please|kindly)\s+)?(?:record|log|enter|add|save|create)\s+(?:(?:a|an|the|my|business|shop)\s+)*(?:(?:transport|rent|utilities|supplies|repairs|other)\s+)?(?:expense|spending)\b/i;
const CANCEL = /^(?:cancel|stop|nevermind|never mind|discard|forget it|no)$/i;
const CURRENCY = /\b(GHS|USD|NGN|KES|AED|EUR|GBP|cedis?|naira|dollars?)\b|₵|\$/ig;
const CATEGORY = /\b(transport|rent|utilities|supplies|repairs|other)\b/ig;
const DATE = /\b(today|yesterday|\d{4}-\d{2}-\d{2})\b/ig;
const DECIMAL = /\b\d+(?:[.,]\d+)?\b/g;

export function isExpenseRecordingRequest(text: string): boolean {
  return START.test(sanitizeInput(text));
}
function validCalendarDate(input: string): boolean {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if(!m)return false;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===input;
}
function currencyError(text: string, companyCurrency: string): string | null {
  const codes=Array.from(text.matchAll(CURRENCY),match=>{
    const value=match[0].toLowerCase();
    return value==="cedi"||value==="cedis"||value==="₵" ? "GHS"
      : value==="naira" ? "NGN" : value==="dollar"||value==="dollars"||value==="$" ? "USD" : value.toUpperCase();
  });
  return codes.some(code=>code!==companyCurrency)
    ? "I cannot convert expenses between currencies. Use the company's currency, "+companyCurrency+"."
    : null;
}
function collect(text: string, draft: Draft, today: Date, country: string | undefined, currency: string): string | null {
  const categories=[...new Set(Array.from(text.matchAll(CATEGORY),m=>m[1].toLowerCase()))];
  if(categories.length>1)return "I found more than one expense category. Please supply exactly one.";
  if(categories.length===1)draft.category=categories[0] as ExpenseCategory;
  const dateParts=Array.from(text.matchAll(DATE),m=>m[1].toLowerCase());
  if(new Set(dateParts).size>1)return "I found more than one date. Please supply just one expense date.";
  if(dateParts.length) {
    const given=dateParts[0];
    draft.date=given==="today"?businessDayKey(today,country)
      :given==="yesterday"?businessDayKey(shiftBusinessDay(today,-1,country),country):given;
  }
  // No guessing when multiple monetary numbers or malformed precision appear.
  const withoutDates=text.replace(DATE," ").replace(CATEGORY," ");
  const amounts=[...withoutDates.matchAll(DECIMAL)].map(m=>m[0]);
  if(amounts.length>1)return "I found multiple numbers. Please give just the expense amount.";
  if(amounts.length===1){
    const amount=amounts[0].replace(",",".");
    if(!/^\d+(?:\.\d{1,2})?$/.test(amount)||Number(amount)<=0)
      return "Enter a positive amount with at most two decimal places.";
    draft.amount=amount;
  }
  const mismatch=currencyError(text,currency);
  if(mismatch)return mismatch;
  const noteMatch=/(?:\bnote\s*[:=-]\s*|\bfor\s+)(.+)$/i.exec(text);
  if(noteMatch){
    const note=noteMatch[1].replace(DATE,"").trim();
    if(note.length>240)return "The expense note must be 240 characters or fewer.";
    if(note && !/^\d+(?:[.,]\d+)?(?:\s*(?:cedis?|ghs))?$/i.test(note))draft.note=note;
  }
  if(draft.date && (!validCalendarDate(draft.date)||draft.date>businessDayKey(today,country)))
    return "Please supply a real expense date that is not in the future.";
  return null;
}

export function createExpenseAssistantSession(database: TallybookDB, currency: string, now: () => Date = () => new Date()) {
  let draft: Draft | null = null;
  const clear=()=>{draft=null;};
  const hasDraft=()=>draft!==null;
  const token=()=>draft?.token??null;

  async function handle(raw: string): Promise<AssistantReply | null> {
    const text=sanitizeInput(raw);
    if(!draft && !isExpenseRecordingRequest(text))return null;
    if(draft && CANCEL.test(text)){clear();return info("Expense recording cancelled. Nothing was saved.");}
    if(draft?.token)return info("Use Confirm or Cancel on the expense preview. Nothing has been saved.");
    // A fresh full expense request replaces, rather than silently merges with,
    // any unfinished prior entry. Never reuse its amount, category or date.
    if(draft && isExpenseRecordingRequest(text))clear();
    const active=getActiveBusinessProfileId();
    if(!draft)draft={companyId:active,request:text,submissionKey:nanoid(18)};
    if(draft.companyId!==active){clear();return failure("The business changed. Expense preparation was cancelled.");}
    const profile=await database.businessProfiles.get(active);
    if(!profile){clear();return failure("Choose an authorized business before recording expenses.");}
    if(profile.currency!==currency){clear();return failure("The company currency changed. Start this expense again.");}
    const issue=collect(text,draft,now(),profile.country,currency);
    if(issue)return question(issue,[{type:"cancel",label:"Cancel"}]);
    if(!draft.category)return question("Which expense category: "+CATEGORIES+"?",[{type:"cancel",label:"Cancel"}]);
    if(!draft.amount)return question("What amount was spent, in "+currency+"?",[{type:"cancel",label:"Cancel"}]);
    if(!draft.date)return question("When was the expense paid? Say today, yesterday, or YYYY-MM-DD.",[{type:"cancel",label:"Cancel"}]);
    const parsed=expenseFormSchema.safeParse({category:draft.category,amount:draft.amount,expenseDate:draft.date,note:draft.note});
    if(!parsed.success)return question("Those expense details are invalid. Correct them or cancel.",[{type:"cancel",label:"Cancel"}]);
    const rows:ReplyDetail[]=[
      {label:"Category",value:expenseCategoryLabels[draft.category]},
      {label:"Amount",value:currency+" "+draft.amount},
      {label:"Expense date",value:draft.date},
      ...(draft.note?[{label:"Note",value:draft.note}]:[]),
      {label:"Business",value:profile.name}
    ];
    draft.token="expense-"+nanoid(16);
    draft.rows=rows;
    return {kind:"preview",text:"Review this expense. No record has been saved yet.",
      preview:{token:draft.token,kind:"expense",title:"Record business expense",rows,
        notes:["The entry is immutable and belongs to the active company. It does not change sales, stock or customer payments."],
        confirmLabel:"Confirm expense"},
      actions:[{type:"confirm",label:"Confirm expense",token:draft.token},{type:"cancel",label:"Cancel"}]};
  }

  async function confirm(confirmation:string):Promise<AssistantReply> {
    if(!draft?.token||draft.token!==confirmation)return failure("The expense preview is not active. Nothing was recorded.");
    const current=draft;
    clear(); // Single-use confirmation, including failed writes.
    if(getActiveBusinessProfileId()!==current.companyId)
      return failure("The business changed after the preview. Nothing was recorded.");
    try{
      const saved=await createExpense({category:current.category!,amount:current.amount!,expenseDate:current.date!,
        note:current.note,currency,submissionKey:current.submissionKey},database);
      const summary="Expense recorded: "+currency+" "+current.amount+" ("+expenseCategoryLabels[current.category!]+").";
      await recordAudit(database,{businessProfileId:current.companyId,action:"expense",outcome:"saved",
        summary,request:current.request,details:current.rows??[],recordId:saved.id},now());
      return {kind:"success",text:summary,details:current.rows,recordId:saved.id,
        link:{label:"Review Expenses",href:"/expenses"}};
    }catch(error){
      const message=error instanceof Error?error.message:"Expense recording could not be completed.";
      await recordAudit(database,{businessProfileId:current.companyId,action:"expense",outcome:"failed",
        summary:message,request:current.request,details:current.rows??[]},now());
      return failure(message+" Check Expenses before retrying, because a delayed save might have succeeded.");
    }
  }

  return {handle,confirm,hasDraft,token,clear};
}
