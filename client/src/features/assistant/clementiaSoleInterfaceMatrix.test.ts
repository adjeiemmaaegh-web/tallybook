/**
 * Sole-interface Clementia QA: 100 first-time-user goals × 20 natural phrasings.
 * This integration test invokes the REAL assistant engine and real feature
 * services with synthetic IndexedDB data, not a mocked LLM or a canned router.
 * It NEVER confirms previews or talks to production Supabase.
 */
import Dexie from "dexie";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { createCustomer } from "@/features/customers/customers";
import { createProduct } from "@/features/inventory/inventory";
import { createSupplier } from "@/features/purchases/purchases";
import { completeSale } from "@/features/sales/sales";
import { createStaff, unlockStaff, openShift, lockStaff } from "@/features/staff/staff";
import { updateCompanyReturnPolicy } from "@/features/business/returnPolicySettings";
import { createAssistant } from "./assistant";
import { CLEMENTIA_CASES, clementiaVariants } from "../../../../qa/clementia-sole-interface-cases.mjs";

type QaRow = {
  id: string; family: string; goal: string; variant: number; prompt: string;
  replyKind: string; disposition: string; assistantIntent: string;
  replyText: string; route: string; expectedRoute: string;
  actions: string; needsManualNavigation: boolean; exception: string;
};

const rows: QaRow[]=[];
let database: TallybookDB;
const savedCounts=async()=>({
  sales:await database.sales.count(),payments:await database.payments.count(),
  saleLines:await database.saleLines.count(),repayments:await database.repayments.count(),
  purchases:await database.purchases.count(),inventoryMovements:await database.inventoryMovements.count(),
  products:await database.products.count(),customers:await database.customers.count(),
  suppliers:await database.suppliers.count(),
});
let before: Awaited<ReturnType<typeof savedCounts>>;

const csv=(value:unknown)=>'"'+String(value??"").replaceAll('"','""').replace(/\r?\n/g,' ')+'"';
function disposition(reply: {kind:string;text:string;link?:{href:string};actions?:Array<{type:string}>}, targetRoute:string, family:string){
  // Classify the primary response, not just the presence of a supplementary link.
  // Earlier categorization incorrectly called balance/sales answers mere navigation.
  if(reply.kind==="success")return "unexpected-unconfirmed-success";
  if(reply.kind==="preview")return "awaiting-explicit-confirmation";
  if(reply.text.includes("couldn't identify a supported TallyBook action"))return "not-recognized";
  if(reply.kind==="unsupported")return "explicitly-unsupported";
  if(reply.kind==="error")return "data-or-validation-error";
  if(reply.kind==="question")return "asks-for-details-or-selection";
  if(family==="NAV"){
    if(reply.link?.href===targetRoute&&targetRoute)return "guided-to-correct-screen";
    if(reply.link?.href||reply.actions?.some(a=>a.type==="navigate"))return "guided-to-other-screen";
  }
  if(reply.kind==="answer"&&family==="READ")return "answered-read-query";
  if(reply.kind==="answer"&&family==="FAQ")return reply.link?.href?"explained-feature-with-link":"generic-help-answer";
  if(reply.kind==="answer"&&family==="ACTION")return reply.link?.href?"guided-to-app-screen":"read-only-action-result";
  if(reply.kind==="answer"&&family==="BOUNDARY")return reply.link?.href?"guided-to-app-screen":"informational-response";
  if(reply.link?.href||reply.actions?.some(a=>a.type==="navigate"))return "guided-to-app-screen";
  return "informational-response";
}
beforeAll(async()=>{
  setActiveBusinessProfileId("primary");
  database=new TallybookDB("clementia-sole-interface-"+Date.now());
  await initializeDatabase(database);
  await saveBusinessProfile({name:"First-Time QA Shop",country:"Ghana",currency:"GHS",
    businessType:"Retail shop",phone:"",email:"",address:""},database);
  const owner=await createStaff("QA owner","owner","123456",database);
  await unlockStaff(owner.id,"123456",database);
  await openShift(0,database);
  await updateCompanyReturnPolicy({enabled:true,allowFullReversal:true,
    allowCashPartial:true,maxAgeDays:30},"QA refund setup",database);
  const rice=await createProduct({name:"Rice",sku:"",categoryId:"uncategorized",
    sellingPrice:"150.00",costPrice:"100.00",initialStock:"20",lowStockThreshold:"5"},"GHS",database);
  await createProduct({name:"Eggs",sku:"",categoryId:"uncategorized",
    sellingPrice:"60.00",costPrice:"45.00",initialStock:"37",lowStockThreshold:"5"},"GHS",database);
  await createProduct({name:"Laundry soap",sku:"",categoryId:"uncategorized",
    sellingPrice:"12.50",costPrice:"8.00",initialStock:"1",lowStockThreshold:"5"},"GHS",database);
  const adwoa=await createCustomer({name:"Adwoa Mensah",phone:"0244000001",
    email:"",address:"",notes:"",status:"active"},database);
  await createCustomer({name:"Kwame Boateng",phone:"0244000002",
    email:"",address:"",notes:"",status:"active"},database);
  await createSupplier({name:"Kofi Traders",phone:"",email:"",address:"",notes:""},database);
  await createSupplier({name:"ABC Suppliers",phone:"",email:"",address:"",notes:""},database);
  await completeSale({lines:[{productId:rice.id,quantity:3}],customerId:adwoa.id,
    discount:"0",paymentMethod:"credit",amountPaid:"0",currency:"GHS"},database);
  before=await savedCounts();
},120000);

afterAll(async()=>{
  const outputDir=resolve(import.meta.dirname,"../../../../artifacts/release-v19");
  mkdirSync(outputDir,{recursive:true});
  const counts:Record<string,Record<string,number>>={};
  for(const row of rows){
    const x=counts[row.family]??(counts[row.family]={});
    x[row.disposition]=(x[row.disposition]??0)+1;
  }
  const goals=CLEMENTIA_CASES.map((goal:any)=>{
    const match=rows.filter(row=>row.id===goal.id);
    const summary=Object.fromEntries([...new Set(match.map(row=>row.disposition))].sort()
      .map(key=>[key,match.filter(row=>row.disposition===key).length]));
    return {id:goal.id,title:goal.title,family:goal.family,
      recognized:match.filter(r=>r.disposition!=="not-recognized"&&!r.exception).length,
      navigations:match.filter(r=>r.disposition==="guided-to-correct-screen"||r.disposition==="guided-to-app-screen"||r.disposition==="explained-feature-with-link").length,
      previews:match.filter(r=>r.disposition==="awaiting-explicit-confirmation").length,
      questions:match.filter(r=>r.disposition==="asks-for-details-or-selection").length,
      directAnswers:match.filter(r=>r.disposition==="answered-read-query"||r.disposition==="read-only-action-result").length,
      failures:match.filter(r=>r.exception).length,summary};
  });
  const after=await savedCounts();
  const manifest={scenario:"New user insists on Clementia only",
    limitation:"Assistant engine tested with a seeded company; separate UI tests cover empty-device conversational onboarding. This matrix does not test cloud sign-in or real accounts.",
    createdAt:new Date().toISOString(),goals:CLEMENTIA_CASES.length,utterances:rows.length,
    distribution:counts,sourceBaseline:process.env.GITHUB_SHA??"CI not supplied",
    noAutomaticFinancialChanges:JSON.stringify(after)===JSON.stringify(before),
    before,after,goalSummaries:goals};
  writeFileSync(resolve(outputDir,"clementia-2000-summary.json"),JSON.stringify(manifest,null,2)+"\n");
  writeFileSync(resolve(outputDir,"clementia-2000-responses.json"),JSON.stringify(rows,null,2)+"\n");
  const headers=["id","family","goal","variant","prompt","replyKind","disposition","assistantIntent",
    "replyText","route","expectedRoute","actions","needsManualNavigation","exception"];
  writeFileSync(resolve(outputDir,"clementia-2000-responses.csv"),
    headers.join(",")+"\n"+rows.map(row=>headers.map(k=>csv(row[k as keyof QaRow])).join(",")).join("\n")+"\n");
  const report=[
    "# Clementia sole-interface 100 × 20 actual-response report",
    "","This is the real assistant engine with SYNTHETIC stored sample records.",
    "First-business conversational onboarding is tested separately on a standalone empty device. This matrix starts with a seeded business and does not verify mandatory-cloud sign-in.",
    "","Total goals: "+CLEMENTIA_CASES.length,"Total utterances tested: "+rows.length,
    "No automatic financial mutations: "+manifest.noAutomaticFinancialChanges,
    "","## Goal outcomes",
    "| ID | Goal | Family | Recognized /20 | Direct replies | Asked for details | Preview | Navigation | Errors |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|",
    ...goals.map(g=>`| ${g.id} | ${g.title} | ${g.family} | ${g.recognized} | ${g.directAnswers} | ${g.questions} | ${g.previews} | ${g.navigations} | ${g.failures} |`),
    "","## Limitations",
    "- Reply types describe what Clementia actually returned. They do not establish the correctness of every answer or action.",
    "- The test never presses Confirm and never authorizes destructive or paid operations.",
    "- Requests may require manual navigation, even when the FAQ is answered.",
    "- Do not describe a navigation link as successful task execution.",
    "- Full 2,000 prompts, exact replies and expected routes are in the companion CSV/JSON."
  ].join("\n")+"\n";
  writeFileSync(resolve(outputDir,"clementia-2000-report.md"),report);
  console.log("CLEMENTIA_2000_MATRIX_SUMMARY "+JSON.stringify({
    count:rows.length,goals:CLEMENTIA_CASES.length,noAutomaticFinancialChanges:manifest.noAutomaticFinancialChanges,
    distribution:counts,lowestRecognition:goals.slice().sort((a,b)=>a.recognized-b.recognized).slice(0,20),
    artifactDir:"artifacts/release-v19"}));
  lockStaff("primary");
  database.close();
  await new Dexie(database.name).delete();
  setActiveBusinessProfileId("primary");
  expect(rows.length).toBe(2000);
  expect(manifest.noAutomaticFinancialChanges).toBe(true);
  expect(rows.filter(r=>r.exception)).toEqual([]);
  expect(rows.filter(r=>r.disposition==="unexpected-unconfirmed-success")).toEqual([]);
  // Quality floors are intentionally below the last measured baseline
  // (NAV 235, FAQ 202, READ 397, ACTION 283, BOUNDARY 468); expense C076 now moves from BOUNDARY to ACTION.
  // A return to non-recognition cannot pass solely because no exception fired.
  // These are reply-classification floors, NOT verified end-to-end completion.
  expect(counts.NAV?.["guided-to-correct-screen"]??0).toBeGreaterThanOrEqual(230);
  expect(counts.FAQ?.["explained-feature-with-link"]??0).toBeGreaterThanOrEqual(190);
  expect(counts.READ?.["answered-read-query"]??0).toBeGreaterThanOrEqual(380);
  expect(counts.ACTION?.["awaiting-explicit-confirmation"]??0).toBeGreaterThanOrEqual(260);
  expect(counts.BOUNDARY?.["explicitly-unsupported"]??0).toBeGreaterThanOrEqual(425);

},120000);

describe("Clementia real-engine sole-interface acceptance: 100 goals × 20 phrasings",()=>{
  it("contains unique, complete fixture definitions",()=>{
    expect(CLEMENTIA_CASES).toHaveLength(100);
    expect(new Set(CLEMENTIA_CASES.map((g:any)=>g.title)).size).toBe(100);
    for(const goal of CLEMENTIA_CASES)expect(clementiaVariants(goal)).toHaveLength(20);
  });
  it.each(CLEMENTIA_CASES)("$id · $title",async(goal:any)=>{
    for(const [i,prompt] of clementiaVariants(goal).entries()){
      const assistant=createAssistant({currency:"GHS",database});
      try{
        const reply=await assistant.send(prompt);
        const mode=disposition(reply,goal.route??"",goal.family);
        rows.push({id:goal.id,family:goal.family,goal:goal.title,
          variant:i+1,prompt,replyKind:reply.kind,disposition:mode,
          assistantIntent:reply.intent??"",replyText:reply.text.slice(0,500),
          route:reply.link?.href??"",expectedRoute:goal.route??"",
          actions:(reply.actions??[]).map(action=>action.type+":"+action.label).join(" | ").slice(0,300),
          needsManualNavigation:Boolean(reply.link?.href||reply.actions?.some(a=>a.type==="navigate")),
          exception:""});
      }catch(error){
        rows.push({id:goal.id,family:goal.family,goal:goal.title,
          variant:i+1,prompt,replyKind:"exception",disposition:"exception",
          assistantIntent:"",replyText:"",route:"",expectedRoute:goal.route??"",
          actions:"",needsManualNavigation:false,
          exception:String(error instanceof Error?error.message:error).slice(0,350)});
      }finally{assistant.clearContext();}
    }
  },120000);
});
