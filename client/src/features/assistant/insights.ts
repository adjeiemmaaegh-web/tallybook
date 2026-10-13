import type { TallybookDB } from "@/db/TallybookDB";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { getInventorySnapshot, type Product } from "@/features/inventory/inventory";
import { loadPeriodSales } from "./salesAnalytics";
import type { PeriodSales } from "./salesAnalytics";
import type { SalesPeriodRequest } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const REORDER_DAYS = 14;
const LOW_DAYS = 7;
const SALES_WINDOW_DAYS = 30;

export interface InsightFact { label: string; value: string }
export interface InsightResult { title: string; facts: InsightFact[]; text: string }

export interface SalesComparison {
  currentMinor: number;
  previousMinor: number;
  changeMinor: number;
  percentage?: number;
  direction: "increase" | "decrease" | "unchanged" | "no-comparison";
}

export type ReorderStatus = "reorder" | "out-of-stock" | "no-sales" | "limited-history" | "sufficient-stock";
export interface ReorderSuggestion {
  productId: string;
  productName: string;
  stock: number;
  unitsSold: number;
  velocityPerDay: number;
  daysLeft?: number;
  suggestedQuantity?: number;
  historyDays: number;
  status: ReorderStatus;
}

export interface SlowMover { productId: string; productName: string; stock: number }

export interface InsightData {
  salesComparison: SalesComparison;
  reorderSuggestions: ReorderSuggestion[];
  slowMovers: SlowMover[];
}

function sumSales(period: PeriodSales): number {
  return period.sales.reduce((sum, sale) => sum + sale.totalMinor, 0);
}

/** Calculates a month-over-month comparison without using floating point for money. */
export function calculateSalesComparison(currentMinor: number, previousMinor: number): SalesComparison {
  if (![currentMinor, previousMinor].every((value) => Number.isSafeInteger(value) && value >= 0)) throw new Error("Sales comparison requires valid non-negative minor-unit totals.");
  const changeMinor = currentMinor - previousMinor;
  if (!Number.isSafeInteger(changeMinor)) throw new Error("Sales comparison exceeds safe numeric precision.");
  if (previousMinor === 0) return { currentMinor, previousMinor, changeMinor, direction: "no-comparison" };
  if (changeMinor === 0) return { currentMinor, previousMinor, changeMinor, percentage: 0, direction: "unchanged" };
  const percentage = Math.round((Math.abs(changeMinor) / previousMinor) * 100);
  return { currentMinor, previousMinor, changeMinor, percentage, direction: changeMinor > 0 ? "increase" : "decrease" };
}

export function calculateReorderSuggestion(product: Product, unitsSold: number, historyDays: number): ReorderSuggestion {
  if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 || !Number.isSafeInteger(unitsSold) || unitsSold < 0 || !Number.isFinite(historyDays)) {
    throw new Error("Reorder suggestion requires valid non-negative stock, sales, and history.");
  }
  const safeHistoryDays = Math.max(0, Math.min(SALES_WINDOW_DAYS, Math.floor(historyDays)));
  if (product.stockQuantity === 0) return { productId: product.id, productName: product.name, stock: 0, unitsSold, velocityPerDay: 0, historyDays: safeHistoryDays, status: "out-of-stock" };
  if (unitsSold === 0) return { productId: product.id, productName: product.name, stock: product.stockQuantity, unitsSold, velocityPerDay: 0, historyDays: safeHistoryDays, status: "no-sales" };
  // A newly created item may have only a few observed days. Do not dilute
  // its sales over 30 days, or claim confidence from an incomplete history.
  if (safeHistoryDays === 0) return { productId: product.id, productName: product.name, stock: product.stockQuantity, unitsSold, velocityPerDay: 0, historyDays: 0, status: "limited-history" };
  const velocityPerDay = unitsSold / safeHistoryDays;
  const daysLeft = product.stockQuantity / velocityPerDay;
  const suggestedQuantity = Math.max(0, Math.ceil(velocityPerDay * REORDER_DAYS - product.stockQuantity));
  const status: ReorderStatus = safeHistoryDays < LOW_DAYS ? "limited-history" : daysLeft < LOW_DAYS ? "reorder" : "sufficient-stock";
  return { productId: product.id, productName: product.name, stock: product.stockQuantity, unitsSold, velocityPerDay, daysLeft, suggestedQuantity: suggestedQuantity > 0 ? suggestedQuantity : undefined, historyDays: safeHistoryDays, status };
}

function productHistoryDays(product: Product, start: Date, now: Date): number {
  const created = new Date(product.createdAt);
  if (!Number.isFinite(created.getTime()) || created > now) return 0;
  const meaningfulStart = created > start ? created : start;
  return Math.max(0, Math.floor((now.getTime() - meaningfulStart.getTime()) / DAY_MS) + 1);
}

export async function calculateInsights(database: TallybookDB, now: Date): Promise<InsightData> {
  const currentPeriod = await loadPeriodSales({ kind: "range", id: "thisMonth" }, database, now);
  const previousPeriod = await loadPeriodSales({ kind: "range", id: "lastMonth" }, database, now);
  const last30Period = await loadPeriodSales({ kind: "range", id: "lastDays", days: SALES_WINDOW_DAYS }, database, now);
  const snapshot = await getInventorySnapshot(database);
  const linesByProduct = new Map<string, number>();
  for (const line of last30Period.lines) {
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 0) throw new Error("Invalid sale-line quantity in local insight records.");
    const total = (linesByProduct.get(line.productId) ?? 0) + line.quantity;
    if (!Number.isSafeInteger(total)) throw new Error("Sale quantity exceeds safe numeric precision.");
    linesByProduct.set(line.productId, total);
  }
  const reorderSuggestions = snapshot.products.map((product) => calculateReorderSuggestion(product, linesByProduct.get(product.id) ?? 0, productHistoryDays(product, last30Period.window.start ?? new Date(now.getTime() - SALES_WINDOW_DAYS * DAY_MS), now)));
  const slowMovers = snapshot.products.filter((product) => product.stockQuantity > 0 && (linesByProduct.get(product.id) ?? 0) === 0).map((product) => ({ productId: product.id, productName: product.name, stock: product.stockQuantity }));
  return { salesComparison: calculateSalesComparison(sumSales(currentPeriod), sumSales(previousPeriod)), reorderSuggestions, slowMovers };
}

export function renderSalesComparison(comparison: SalesComparison): string {
  if (comparison.direction === "no-comparison") return "There were no sales last month to compare.";
  if (comparison.direction === "unchanged") return "Sales are unchanged compared with last month.";
  return `Sales are ${comparison.direction === "increase" ? "up" : "down"} ${comparison.percentage}% compared with last month.`;
}

export function renderDays(days: number): string { return `${days} ${days === 1 ? "day" : "days"}`; }

export function renderReorderSuggestion(suggestion: ReorderSuggestion): string {
  if (suggestion.status === "out-of-stock") return `${suggestion.productName} is out of stock. Reorder estimate unavailable.`;
  if (suggestion.status === "no-sales") return `${suggestion.productName} has no sales history in the last 30 days; there is not enough data for a reorder estimate.`;
  if (suggestion.status === "limited-history") return `${suggestion.productName} has limited sales history (${renderDays(suggestion.historyDays)}); no reliable reorder quantity is recommended until at least ${LOW_DAYS} days of history are available.`;
  if (suggestion.status === "sufficient-stock") return `${suggestion.productName} has about ${renderDays(Math.floor(suggestion.daysLeft!))} of stock remaining; no reorder is suggested.`;
  return `${suggestion.productName} has about ${renderDays(Math.floor(suggestion.daysLeft!))} of stock remaining. Estimated reorder: ${suggestion.suggestedQuantity ?? 0} units from the last 30 days of sales.`;
}

export function renderSlowMovers(slowMovers: SlowMover[]): string {
  if (!slowMovers.length) return "No slow-moving products found: every stocked product had sales in the last 30 days.";
  return `Slow-moving products with stock and no sales in the last 30 days: ${slowMovers.map((item) => `${item.productName} (${item.stock} in stock)`).join(", ")}.`;
}

export async function periodSalesComparison(database: TallybookDB, now: Date): Promise<InsightResult> {
  const comparison = (await calculateInsights(database, now)).salesComparison;
  return { title: "Sales comparison", facts: [{ label: "This month", value: String(comparison.currentMinor) }, { label: "Last month", value: String(comparison.previousMinor) }], text: renderSalesComparison(comparison) };
}

export async function reorderInsight(database: TallybookDB, now: Date): Promise<InsightResult> {
  const suggestions = (await calculateInsights(database, now)).reorderSuggestions.filter((item) => item.status === "reorder" || item.status === "out-of-stock" || item.status === "limited-history");
  return { title: "Reorder suggestions", facts: suggestions.map((item) => ({ label: item.productName, value: item.status })), text: suggestions.length ? suggestions.map(renderReorderSuggestion).join(" ") : "No reorder suggestions based on recent sales." };
}

export async function slowMoversInsight(database: TallybookDB, now: Date): Promise<InsightResult> {
  const movers = (await calculateInsights(database, now)).slowMovers;
  return { title: "Slow movers", facts: movers.map((item) => ({ label: item.productName, value: String(item.stock) })), text: renderSlowMovers(movers) };
}

export const insightPeriods = {
  current: { kind: "range", id: "thisMonth" } satisfies SalesPeriodRequest,
  previous: { kind: "range", id: "lastMonth" } satisfies SalesPeriodRequest,
  recent: { kind: "range", id: "lastDays", days: SALES_WINDOW_DAYS } satisfies SalesPeriodRequest,
};

export { REORDER_DAYS, SALES_WINDOW_DAYS, LOW_DAYS, getActiveBusinessProfileId };
