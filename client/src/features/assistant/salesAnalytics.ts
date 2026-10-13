/**
 * Tallybook Assistant — read-only sales data for any period, including calendar ranges (this month, last month, this year…).
 *
 * The reports service only offers today / last 7 days / all. For the other ranges this module reads the same saved sales and sale lines,
 * scoped to the active business and using the same local-day boundaries (start inclusive, end exclusive). It never writes anything.
 */
import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import type { Sale, SaleLine } from "@/features/sales/sales";
import { calendarDayToDate, describeDay, resolveRange } from "./dates";
import type { SalesPeriodRequest } from "./types";

export interface PeriodWindow { start?: Date; end: Date; label: string }

/** The concrete window for a period. "unspecified" and "unsupported" are the caller's job to handle before asking. */
export function periodWindow(period: SalesPeriodRequest, now: Date): PeriodWindow {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  switch (period.kind) {
    case "day": { const day = calendarDayToDate(period); return { start: day, end: new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1), label: describeDay(period) }; }
    case "last7": { const start = new Date(startOfToday); start.setDate(start.getDate() - 6); return { start, end: endOfToday, label: "The last 7 days" }; }
    case "range": { const range = resolveRange(period, now); return { start: range.start, end: range.end, label: range.label }; }
    case "all": case "unspecified": return { end: endOfToday, label: "All saved records" };
    default: return { start: startOfToday, end: endOfToday, label: "Today" };
  }
}

export interface PeriodSales { window: PeriodWindow; sales: Sale[]; lines: SaleLine[] }

export async function loadPeriodSales(period: SalesPeriodRequest, database: TallybookDB, now: Date): Promise<PeriodSales> {
  const window = periodWindow(period, now);
  const activeId = getActiveBusinessProfileId();
  const [allSales, allLines] = await Promise.all([database.sales.toArray(), database.saleLines.toArray()]);
  const sales = allSales.filter((sale) => {
    if (sale.businessProfileId !== activeId) return false;
    const createdAt = new Date(sale.createdAt);
    return createdAt >= (window.start ?? new Date(0)) && createdAt < window.end;
  });
  const ids = new Set(sales.map((sale) => sale.id));
  return { window, sales, lines: allLines.filter((line) => ids.has(line.saleId)) };
}
