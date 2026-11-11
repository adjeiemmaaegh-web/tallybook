import { callShop } from "./shopClient";

export const EXPENSE_CATEGORIES = ["transport", "rent", "utilities", "supplies", "repairs", "salaries", "other"] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  transport: "Transport", rent: "Rent", utilities: "Utilities", supplies: "Supplies", repairs: "Repairs", salaries: "Salaries", other: "Other",
};
export type ExpenseMethod = "cash" | "mobile" | "card" | "bank";
export interface ShopExpense {
  expenseId: string; storeId: string | null; category: ExpenseCategory; amountMinor: string; method: ExpenseMethod;
  expenseDate: string; note: string | null; recordedBy: string; recordedAt: string; voided: boolean; voidReason: string | null;
}
export interface RecordExpenseInput {
  expenseId: string; category: ExpenseCategory; amountMinor: number; method: ExpenseMethod; expenseDate: string; storeId?: string | null; note?: string;
}
export const recordShopExpense = (companyId: string, input: RecordExpenseInput) =>
  callShop<{ expenseId: string; replayed: boolean }>("recordExpense", { companyId, ...input }, "tallybook_shop_ops");
export const voidShopExpense = (companyId: string, expenseId: string, reason: string) =>
  callShop<{ expenseId: string; voided: boolean }>("voidExpense", { companyId, expenseId, reason }, "tallybook_shop_ops");
export const listShopExpenses = (companyId: string) =>
  callShop<{ expenses: ShopExpense[] }>("listExpenses", { companyId }, "tallybook_shop_ops");
