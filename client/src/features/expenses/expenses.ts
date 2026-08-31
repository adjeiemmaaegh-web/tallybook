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
  expenseDate: string;
  note?: string;
  submissionKey: string;
  createdAt: string;
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
  const input = expenseFormSchema.parse(values);
  validateExpenseDate(input.expenseDate);
  const amountMinor = parseExpenseAmount(input.amount, values.currency);
  const now = new Date().toISOString();
  const submissionKey = values.submissionKey ?? nanoid(18);
  return database.transaction("rw", database.expenses, async () => {
    const activeId = getActiveBusinessProfileId();
    const existing = await database.expenses.where("submissionKey").equals(submissionKey).and((expense) => expense.businessProfileId === activeId).first();
    if (existing) return existing;
    const expense: Expense = {
      id: nanoid(14), businessProfileId: getActiveBusinessProfileId(), category: input.category, amountMinor, expenseDate: input.expenseDate,
      note: input.note?.trim() || undefined, submissionKey, createdAt: now,
    };
    await database.expenses.add(expense);
    return expense;
  });
}

export async function listExpenses(database: TallybookDB = db) {
  const records = await database.expenses.where("businessProfileId").equals(getActiveBusinessProfileId()).toArray();
  return records.sort((left, right) => right.expenseDate.localeCompare(left.expenseDate) || right.createdAt.localeCompare(left.createdAt));
}
