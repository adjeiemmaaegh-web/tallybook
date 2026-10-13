import { describe, expect, it } from "vitest";
import { parseCommand } from "@/features/assistant/intentParser";
const now = new Date(2026, 9, 2, 12);
describe("chip texts and headline phrases parse to the right intent", () => {
  it.each([
    ["Receive stock of Eggs", "RECEIVE_STOCK"], ["Recount Eggs", "ADJUST_INVENTORY"], ["Add customer Kama", "CREATE_CUSTOMER"], ["Add product Eggs", "CREATE_PRODUCT"], ["Add supplier ABC", "CREATE_SUPPLIER"],
    ["I counted 25 but we have 37", "ADJUST_INVENTORY"], ["I counted 25 eggs but we have 37", "ADJUST_INVENTORY"], ["Best-sellers THIS MONTH", "BEST_SELLING"], ["best selling products last month", "BEST_SELLING"],
    ["Top debtors this month", "TOP_DEBTORS"], ["Which customers owe us the most?", "TOP_DEBTORS"], ["Which customers bought this month", "CUSTOMERS_WHO_BOUGHT"], ["Top customers this year", "CUSTOMERS_WHO_BOUGHT"],
    ["Show sales for this month", "SALES_QUERY"], ["Sell 2 eggs to Kwame, cash", "RECORD_SALE"], ["How much does Kwame owe?", "CUSTOMER_BALANCE"], ["What's running low?", "LOW_STOCK"], ["Kwame paid 50 cedis", "RECORD_CUSTOMER_PAYMENT"],
    ["Add category Drinks", "CREATE_CATEGORY"], ["set eggs stock to 25", "ADJUST_INVENTORY"], ["How many eggs are left?", "INVENTORY_QUERY"],
  ])("%s → %s", (text, intent) => { const parsed = parseCommand(text, { now }); expect(parsed.intent).toBe(intent); expect(parsed.confidence).toBeGreaterThanOrEqual(0.75); });
  it("periods", () => {
    expect(parseCommand("Best-sellers THIS MONTH", { now }).period).toEqual({ kind: "range", id: "thisMonth" });
    expect(parseCommand("Top debtors last month", { now }).period).toEqual({ kind: "range", id: "lastMonth" });
    expect(parseCommand("best selling in the last 30 days", { now }).period).toEqual({ kind: "range", id: "lastDays", days: 30 });
    expect(parseCommand("Best-selling product TODAY", { now }).period).toEqual({ kind: "today" });
  });
});
