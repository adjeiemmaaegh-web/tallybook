import { activeStaffShift, requirePermission } from "@/features/staff/staff";
import {withCoordinatedRetailWrite} from '@/features/backup/coordinatedRetailWrite';
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
/** Tallybook Africa Stage 8 design reminder: expenses are small, immutable local facts; they never alter stock, purchases, sales, collections, debt, or product prices. */
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, type TallybookDB } from "@/db/TallybookDB";
import { currencyMinorDivisor } from "@/features/inventory/inventory";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";

export const expenseCategories = ["transport", "rent", "utilities", "supplies", "repairs", "other"] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  transport: "Transport",
  rent: "Rent",
  utilities: "Utilities",
  supplies: "Supplies",
  repairs: "Repairs",
  other: "Other",
};

export interface Expense {
  id: string;
  businessProfileId: string;
  category: ExpenseCategory;
  amountMinor: number;
  /** Currency captured when recorded; absent on unverified legacy expenses. */
  currency?: string;
  expenseDate: string;
  note?: string;
  submissionKey: string;
  createdAt: string;
  staffId?: string;
  shiftId?: string;
}

export interface ExpenseFormValues { category: ExpenseCategory; amount: string; expenseDate: string; note?: string; }
export interface CreateExpenseInput extends ExpenseFormValues { currency: string; submissionKey?: string; }

export const expenseFormSchema = z.object({
  category: z.enum(expenseCategories),
  amount: z.string().trim().regex(/^\d+(?:[.,]\d{1,2})?$/, "Enter an expense amount greater than zero."),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date you spent this money."),
  note: z.string().trim().max(240, "Keep the expense note under 240 characters.").optional(),
});

export function localExpenseDate(now = new Date()) {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function validateExpenseDate(expenseDate: string, now = new Date()) {
  const [year, month, day] = expenseDate.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  if (localDate.getFullYear() !== year || localDate.getMonth() !== month - 1 || localDate.getDate() !== day) throw new Error("Choose a valid expense date.");
  if (expenseDate > localExpenseDate(now)) throw new Error("Choose today or an earlier expense date.");
}

function parseExpenseAmount(amount: string, currency: string) {
  const value = Number(amount.trim().replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) throw new Error("Enter an expense amount greater than zero.");
  const amountMinor = Math.round(value * currencyMinorDivisor(currency));
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("Enter a valid expense amount.");
  return amountMinor;
}

export async function createExpense(values: CreateExpenseInput, database: TallybookDB = db) {
  const company=getActiveBusinessProfileId();
  const input = expenseFormSchema.parse(values);
  validateExpenseDate(input.expenseDate);
  if (!/^[A-Z]{3}$/.test(values.currency)) throw new Error("Use a valid three-letter expense currency.");
  const amountMinor = parseExpenseAmount(input.amount, values.currency);
  const now = new Date().toISOString();
  const submissionKey = values.submissionKey ?? nanoid(18);
  return withCoordinatedRetailWrite(()=>database.transaction("rw",
    [database.expenses,database.staffAudits,database.appMeta,database.staffMembers,database.staffShifts,database.businessProfiles], async () => {
    await assertRun7RetailWriteReady(database.appMeta);
    const activeId = company;
    const staff=await requirePermission("inventory",database,company);
    const shift=await activeStaffShift(staff,database);
    if(getActiveBusinessProfileId()!==company)
      throw Error('Company changed before expense authorization.');
    const profile=await database.businessProfiles.get(company);
    if(profile && profile.currency!==values.currency)
      throw Error('Expense currency does not match the active company.');
    const existing = await database.expenses.where("submissionKey").equals(submissionKey).and((expense) => expense.businessProfileId === activeId).first();
    if (existing) {
      if (existing.category !== input.category || existing.amountMinor !== amountMinor || existing.currency !== values.currency ||
          existing.expenseDate !== input.expenseDate || (existing.note ?? "") !== (input.note?.trim() ?? ""))
        throw new Error("This submission key was already used for a different expense. Review the saved record before retrying.");
      return existing;
    }
    const expense: Expense = {
      id: nanoid(14), businessProfileId: getActiveBusinessProfileId(), category: input.category, amountMinor, currency: values.currency, expenseDate: input.expenseDate,
      note: input.note?.trim() || undefined, submissionKey, createdAt: now,
      ...(staff ? { staffId: staff.id } : {}), ...(shift ? { shiftId: shift.id } : {}),
    };
    if(getActiveBusinessProfileId()!==company)
      throw Error('Company changed before recording the expense.');
    await requirePermission("inventory",database,company);
    await database.expenses.add(expense);
    if(staff)await database.staffAudits.add({id:nanoid(14),businessProfileId:activeId,staffId:staff.id,action:'expense.recorded',createdAt:now,details:expense.id});
    return expense;
  }));
}

export async function listExpenses(database: TallybookDB = db) {
  const company=getActiveBusinessProfileId();
  const records=await database.transaction("r",[database.expenses,database.staffMembers],async()=>{
    await requirePermission("reports",database,company);
    return database.expenses.where("businessProfileId").equals(company).toArray();
  });
  if(company!==getActiveBusinessProfileId())throw Error("Company changed during expense review.");
  await requirePermission("reports",database,company);
  return records.sort((left, right) => right.expenseDate.localeCompare(left.expenseDate) || right.createdAt.localeCompare(left.createdAt));
}
