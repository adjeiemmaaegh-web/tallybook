/** Stage 8 regression: expense history is local, immutable, validated, and idempotent without changing any other business record. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { createExpense, listExpenses, localExpenseDate } from "@/features/expenses/expenses";

const names = new Set<string>(); const databases: Dexie[] = []; let sequence = 0;
function database() { const result = new TallybookDB(`tallybook-expenses-${Date.now()}-${++sequence}`); names.add(result.name); databases.push(result); return result; }
afterEach(async () => { databases.splice(0).forEach((entry) => entry.close()); await Promise.all([...names].map((name) => new Dexie(name).delete())); names.clear(); });

describe("Stage 8 local expenses", () => {
  it("saves one positive expense once for a repeated submission key and keeps the history read-only", async () => {
    const localDatabase = database(); await initializeDatabase(localDatabase);
    const saved = await createExpense({ category: "transport", amount: "12.50", expenseDate: localExpenseDate(), note: "Market delivery", currency: "GHS", submissionKey: "expense-repeat-key" }, localDatabase);
    const repeated = await createExpense({ category: "transport", amount: "12.50", expenseDate: localExpenseDate(), note: "Market delivery", currency: "GHS", submissionKey: "expense-repeat-key" }, localDatabase);
    await expect(createExpense({ category: "rent", amount: "99.00", expenseDate: localExpenseDate(), currency: "GHS", submissionKey: "expense-repeat-key" }, localDatabase)).rejects.toThrow("different expense");

    expect(saved.currency).toBe("GHS");
    await expect(createExpense({ category: "transport", amount: "12.50", expenseDate: localExpenseDate(), note: "Market delivery", currency: "USD", submissionKey: "expense-repeat-key" }, localDatabase)).rejects.toThrow("different expense");
    expect(repeated).toEqual(saved);
    expect(await listExpenses(localDatabase)).toEqual([saved]);
    expect(await localDatabase.sales.count()).toBe(0);
    expect(await localDatabase.inventoryMovements.count()).toBe(0);
  });

  it("rejects zero, invalid, and future expense dates without saving a partial record", async () => {
    const localDatabase = database(); await initializeDatabase(localDatabase);
    await expect(createExpense({ category: "utilities", amount: "0", expenseDate: localExpenseDate(), currency: "GHS" }, localDatabase)).rejects.toThrow("greater than zero");
    await expect(createExpense({ category: "repairs", amount: "1.00", expenseDate: "2026-02-30", currency: "GHS" }, localDatabase)).rejects.toThrow("valid expense date");
    await expect(createExpense({ category: "other", amount: "1.00", expenseDate: "2999-01-01", currency: "GHS" }, localDatabase)).rejects.toThrow("today or an earlier");
    expect(await localDatabase.expenses.count()).toBe(0);
  });
});
