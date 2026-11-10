/**
 * Client side of the shared shop's daily / end-of-day report. The server does
 * the arithmetic; this only reads its text amounts into safe numbers and writes
 * the plain-text summary an owner can share. Nothing here recalculates money.
 */
import { formatMinorAmount } from "@/features/inventory/inventory";

export interface MethodTotals { cash: number; mobile: number; card: number }
export interface DailyReport {
  role: "owner" | "attendant";
  from: string; to: string; storeId: string | null;
  sales: { count: number; grossMinor: number; discountMinor: number };
  byMethod: MethodTotals & { credit: number };
  refunds: MethodTotals & { count: number; totalMinor: number; creditReducedMinor: number };
  repayments: MethodTotals & { count: number; totalMinor: number };
  supplierPayments: MethodTotals & { bank: number };
  topProducts: Array<{ name: string; quantity: number; revenueMinor: number }>;
  byCashier: Array<{ cashierId: string; count: number; grossMinor: number }>;
  cashTakenMinor: number; cashPaidOutMinor: number; cashExpectedMinor: number;
  customerCreditOutstandingMinor: number | null;
  /** Net sales: what was charged less refunds recorded in the period. */
  netSalesMinor: number;
}

/** Money arrives as text so big totals stay exact; anything not a safe integer is refused rather than rounded. */
function minor(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`The report has an amount that cannot be shown exactly (${label}).`);
  return n;
}
const rec = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`The report is incomplete (${label}).`);
  return value as Record<string, unknown>;
};

export function parseDailyReport(raw: unknown): DailyReport {
  const r = rec(raw, "report");
  const sales = rec(r.sales, "sales"), by = rec(r.byMethod, "byMethod"), rf = rec(r.refunds, "refunds");
  const rp = rec(r.repayments, "repayments"), sp = rec(r.supplierPayments, "supplierPayments");
  const gross = minor(sales.grossMinor, "gross"), refunded = minor(rf.totalMinor, "refunds");
  return {
    role: r.role === "owner" ? "owner" : "attendant",
    from: String(r.from), to: String(r.to), storeId: typeof r.storeId === "string" ? r.storeId : null,
    sales: { count: minor(sales.count, "count"), grossMinor: gross, discountMinor: minor(sales.discountMinor, "discount") },
    byMethod: { cash: minor(by.cash, "cash"), mobile: minor(by.mobile, "mobile"), card: minor(by.card, "card"), credit: minor(by.credit, "credit") },
    refunds: { count: minor(rf.count, "refund count"), totalMinor: refunded, cash: minor(rf.cash, "refund cash"), mobile: minor(rf.mobile, "refund mobile"),
      card: minor(rf.card, "refund card"), creditReducedMinor: minor(rf.creditReducedMinor, "refund credit") },
    repayments: { count: minor(rp.count, "repayment count"), totalMinor: minor(rp.totalMinor, "repayments"), cash: minor(rp.cash, "repayment cash"),
      mobile: minor(rp.mobile, "repayment mobile"), card: minor(rp.card, "repayment card") },
    supplierPayments: { cash: minor(sp.cash, "supplier cash"), mobile: minor(sp.mobile, "supplier mobile"), card: minor(sp.card, "supplier card"), bank: minor(sp.bank, "supplier bank") },
    topProducts: (Array.isArray(r.topProducts) ? r.topProducts : []).map(p => { const q = rec(p, "product"); return { name: String(q.name), quantity: minor(q.quantity, "quantity"), revenueMinor: minor(q.revenueMinor, "revenue") }; }),
    byCashier: (Array.isArray(r.byCashier) ? r.byCashier : []).map(c => { const q = rec(c, "cashier"); return { cashierId: String(q.cashierId), count: minor(q.count, "count"), grossMinor: minor(q.grossMinor, "gross") }; }),
    cashTakenMinor: minor(r.cashTakenMinor, "cash taken"), cashPaidOutMinor: minor(r.cashPaidOutMinor, "cash paid out"), cashExpectedMinor: minor(r.cashExpectedMinor, "cash expected"),
    customerCreditOutstandingMinor: r.customerCreditOutstandingMinor == null ? null : minor(r.customerCreditOutstandingMinor, "credit owed"),
    netSalesMinor: gross - refunded,
  };
}

export interface ReportTextOptions { shopName: string; storeName: string | null; periodLabel: string; currency: string; cashierName?: (id: string) => string }

/** The end-of-day message: figures only, ready for WhatsApp or the share sheet. */
export function formatReportText(report: DailyReport, o: ReportTextOptions): string {
  const m = (v: number) => formatMinorAmount(v, o.currency);
  const lines = [
    `${o.shopName}${o.storeName ? ` · ${o.storeName}` : ""}`,
    `${report.role === "owner" ? "Sales report" : "My sales"} · ${o.periodLabel}`,
    "",
    `Sales: ${report.sales.count} · ${m(report.sales.grossMinor)}`,
  ];
  if (report.sales.discountMinor > 0) lines.push(`Discounts given: ${m(report.sales.discountMinor)}`);
  if (report.refunds.count > 0) lines.push(`Refunds: ${report.refunds.count} · −${m(report.refunds.totalMinor)}`);
  lines.push(`Net sales: ${m(report.netSalesMinor)}`, "", "Taken at the till:");
  for (const [label, value] of [["Cash", report.byMethod.cash], ["Mobile money", report.byMethod.mobile], ["Card", report.byMethod.card], ["On credit", report.byMethod.credit]] as const) {
    if (value > 0) lines.push(`  ${label}: ${m(value)}`);
  }
  if (report.repayments.count > 0) lines.push(`Customer repayments: ${m(report.repayments.totalMinor)}`);
  lines.push("", `Cash expected in the till: ${m(report.cashExpectedMinor)}`,
    `  taken ${m(report.cashTakenMinor)}, paid out ${m(report.cashPaidOutMinor)}`);
  if (report.topProducts.length) {
    lines.push("", "Best sellers:");
    report.topProducts.forEach((p, i) => lines.push(`  ${i + 1}. ${p.name} × ${p.quantity} · ${m(p.revenueMinor)}`));
  }
  if (report.byCashier.length > 1 && o.cashierName) {
    lines.push("", "By cashier:");
    for (const c of report.byCashier) lines.push(`  ${o.cashierName(c.cashierId)}: ${c.count} · ${m(c.grossMinor)}`);
  }
  if (report.customerCreditOutstandingMinor != null && report.customerCreditOutstandingMinor > 0) lines.push("", `Customers still owe: ${m(report.customerCreditOutstandingMinor)}`);
  return lines.join("\n");
}
