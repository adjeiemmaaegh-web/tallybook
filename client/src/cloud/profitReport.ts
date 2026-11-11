/**
 * Client side of the shared shop's profit report (owner only). The server does
 * the arithmetic; this reads its text amounts into safe numbers and writes the
 * spreadsheet export. Nothing here recalculates money.
 */
import { formatMinorAmount } from "@/features/inventory/inventory";
import { escapeCsvSpreadsheetFormula } from "@/features/inventory/catalogCsv";

export interface ProfitReport {
  from: string; to: string; storeId: string | null;
  netRevenueMinor: number; coveredRevenueMinor: number; uncoveredRevenueMinor: number;
  costOfGoodsMinor: number; grossProfitMinor: number;
  /** Margin in basis points on the part of sales whose cost is known; null when there is none. */
  marginBps: number | null;
  expenses: { count: number; totalMinor: number };
  netProfitMinor: number;
  saleLines: { total: number; withCost: number };
  topByProfit: Array<{ name: string; quantity: number; revenueMinor: number; profitMinor: number }>;
}

function minor(value: unknown, label: string): number {
  const n = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n)) throw new Error(`The profit report has an amount that cannot be shown exactly (${label}).`);
  return n;
}
const rec = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`The profit report is incomplete (${label}).`);
  return value as Record<string, unknown>;
};

export function parseProfitReport(raw: unknown): ProfitReport {
  const r = rec(raw, "report"), ex = rec(r.expenses, "expenses"), lines = rec(r.saleLines, "saleLines");
  return {
    from: String(r.from), to: String(r.to), storeId: typeof r.storeId === "string" ? r.storeId : null,
    netRevenueMinor: minor(r.netRevenueMinor, "net revenue"), coveredRevenueMinor: minor(r.coveredRevenueMinor, "covered revenue"),
    uncoveredRevenueMinor: minor(r.uncoveredRevenueMinor, "uncovered revenue"), costOfGoodsMinor: minor(r.costOfGoodsMinor, "cost of goods"),
    grossProfitMinor: minor(r.grossProfitMinor, "gross profit"),
    marginBps: r.marginBps == null ? null : minor(r.marginBps, "margin"),
    expenses: { count: minor(ex.count, "expense count"), totalMinor: minor(ex.totalMinor, "expenses") },
    netProfitMinor: minor(r.netProfitMinor, "net profit"),
    saleLines: { total: minor(lines.total, "lines"), withCost: minor(lines.withCost, "lines with cost") },
    topByProfit: (Array.isArray(r.topByProfit) ? r.topByProfit : []).map(p => { const q = rec(p, "product");
      return { name: String(q.name), quantity: minor(q.quantity, "quantity"), revenueMinor: minor(q.revenueMinor, "revenue"), profitMinor: minor(q.profitMinor, "profit") }; }),
  };
}

/** "30.8%" from basis points; "—" when there is no covered revenue. */
export const formatMargin = (bps: number | null) => bps == null ? "—" : `${(bps / 100).toFixed(1)}%`;

/** True when some sales have no cost recorded, so the figures describe only part of them. */
export const hasPartialCost = (r: ProfitReport) => r.uncoveredRevenueMinor !== 0 || r.saleLines.withCost < r.saleLines.total;

export interface ProfitTextOptions { shopName: string; storeName: string | null; periodLabel: string; currency: string }

/** Profit & loss as a spreadsheet: every row restates a figure the server worked out. */
export function profitReportCsv(r: ProfitReport, o: ProfitTextOptions): string {
  const m = (v: number) => formatMinorAmount(v, o.currency).replace(/[^\d.,-]/g, "").trim();
  const field = (v: string | number) => `"${escapeCsvSpreadsheetFormula(String(v)).replaceAll('"', '""')}"`;
  const row = (...cells: Array<string | number>) => cells.map(field).join(",");
  const lines = [
    row("Profit and loss", o.shopName),
    row("Period", o.periodLabel), row("Store", o.storeName ?? "All stores"), row("Currency", o.currency), "",
    row("Line", "Amount"),
    row("Net sales (after refunds)", m(r.netRevenueMinor)),
    row("  of which cost known", m(r.coveredRevenueMinor)),
    row("  of which no cost recorded", m(r.uncoveredRevenueMinor)),
    row("Cost of goods sold", m(r.costOfGoodsMinor)),
    row("Gross profit (cost-known sales)", m(r.grossProfitMinor)),
    row("Gross margin", formatMargin(r.marginBps)),
    row(`Expenses (${r.expenses.count})`, m(r.expenses.totalMinor)),
    row("Net profit", m(r.netProfitMinor)), "",
  ];
  if (r.topByProfit.length) {
    lines.push(row("Best earners (before refunds)", "Quantity", "Sales", "Profit"));
    for (const p of r.topByProfit) lines.push(row(p.name, p.quantity, m(p.revenueMinor), m(p.profitMinor)));
  }
  if (hasPartialCost(r)) lines.push("", row("Note", "Some sales have no cost recorded; profit and margin cover only the sales whose cost is known."));
  return lines.join("\r\n");
}

/** Plain text for sharing. */
export function formatProfitText(r: ProfitReport, o: ProfitTextOptions): string {
  const m = (v: number) => formatMinorAmount(v, o.currency);
  const out = [`${o.shopName}${o.storeName ? ` · ${o.storeName}` : ""}`, `Profit · ${o.periodLabel}`, "",
    `Net sales: ${m(r.netRevenueMinor)}`, `Cost of goods: ${m(r.costOfGoodsMinor)}`,
    `Gross profit: ${m(r.grossProfitMinor)} (${formatMargin(r.marginBps)})`];
  if (r.expenses.count > 0) out.push(`Expenses: ${m(r.expenses.totalMinor)}`);
  out.push(`Net profit: ${m(r.netProfitMinor)}`);
  if (hasPartialCost(r)) out.push("", `Note: ${m(r.uncoveredRevenueMinor)} of sales have no cost recorded and are not in the profit.`);
  return out.join("\n");
}
