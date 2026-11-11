import type { ShopReceipt } from "./shopClient";

export type DatePreset = "all" | "today" | "yesterday" | "week" | "month";
export type PaymentFilter = "all" | "paid" | "partial" | "credit" | "refunded";

export const DATE_PRESETS: ReadonlyArray<{ id: DatePreset; label: string }> = [
  { id: "all", label: "All" }, { id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "Last 7 days" }, { id: "month", label: "This month" },
];

/**
 * How a sale was paid at the till (not what is still owed today: balances are
 * per customer, so repayments are not matched to individual sales).
 */
export const PAYMENT_FILTERS: ReadonlyArray<{ id: PaymentFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "paid", label: "Paid in full" }, { id: "partial", label: "Part on credit" },
  { id: "credit", label: "All on credit" }, { id: "refunded", label: "Refunded" },
];

/** [from, to) in the device's local days, as ISO strings the server understands. */
export function dayRange(preset: DatePreset, now: Date = new Date()): { from?: string; to?: string } {
  if (preset === "all") return {};
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);
  if (preset === "today") return { from: today.toISOString(), to: tomorrow.toISOString() };
  if (preset === "yesterday") return { from: addDays(today, -1).toISOString(), to: today.toISOString() };
  if (preset === "week") return { from: addDays(today, -6).toISOString(), to: tomorrow.toISOString() };
  return { from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString(), to: tomorrow.toISOString() };
}

export function paymentKind(receipt: ShopReceipt): Exclude<PaymentFilter, "all" | "refunded"> {
  const credit = (receipt.tenders ?? []).filter(t => t.method === "credit").reduce((n, t) => n + t.amountMinor, 0);
  if (credit === 0) return "paid";
  return credit >= receipt.totalMinor ? "credit" : "partial";
}

export interface LocalSalesQuery {
  storeId?: string; from?: string; to?: string; payment?: PaymentFilter; q?: string;
}

/**
 * Same rules as the server's searchSales, applied to a list already in memory.
 * Used only when the server predates searchSales, so the screen still works
 * (over the latest sales it can see) until the database is upgraded.
 */
export function filterSalesLocally(sales: ShopReceipt[], query: LocalSalesQuery, cashierEmail?: (id: string) => string | null | undefined): ShopReceipt[] {
  const q = (query.q ?? "").trim().toLowerCase();
  const byNumber = /^#?\d{1,12}$/.test(q) ? Number(q.replace("#", "")) : null;
  const from = query.from ? Date.parse(query.from) : null;
  const to = query.to ? Date.parse(query.to) : null;
  return sales.filter(sale => {
    if (query.storeId && sale.storeId !== query.storeId) return false;
    const at = Date.parse(sale.recordedAt);
    if (from !== null && at < from) return false;
    if (to !== null && at >= to) return false;
    if (query.payment && query.payment !== "all") {
      if (query.payment === "refunded") { if (!(sale.refunds ?? []).length) return false; }
      else if (paymentKind(sale) !== query.payment) return false;
    }
    if (byNumber !== null) return sale.receiptNumber === byNumber;
    if (q) {
      const customer = sale.customer?.name.toLowerCase() ?? "";
      const email = (cashierEmail?.(sale.cashierId) ?? "").toLowerCase();
      if (!customer.includes(q) && !email.includes(q)) return false;
    }
    return true;
  });
}
