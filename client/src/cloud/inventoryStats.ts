/**
 * Numbers for the owner's stock console, worked out from what the screen
 * already has (products and the selected store's stock). Pure, so it is easy to
 * test and cannot disagree with the list it summarises.
 *
 * Only active, stock-counting products have stock to report. A product is
 * "low" when it is in stock but at or below its own low-stock level, and
 * "out" when none is left; those two never overlap.
 */
import { tracksStock } from "./productTracking";

export interface StatProduct { id: string; active: boolean; trackStock?: boolean; lowStockThreshold?: number | null; costMinor?: number | null }
export type StockStatus = "untracked" | "out" | "low" | "in";
export type StockFilter = "all" | "out" | "low" | "in" | "untracked";

export const STOCK_FILTERS: ReadonlyArray<{ id: StockFilter; label: string }> = [
  { id: "all", label: "All" }, { id: "out", label: "Out of stock" }, { id: "low", label: "Low stock" },
  { id: "in", label: "In stock" }, { id: "untracked", label: "Not counted" },
];

export function stockStatus(product: StatProduct, quantity: number): StockStatus {
  if (!tracksStock(product)) return "untracked";
  if (quantity <= 0) return "out";
  const level = product.lowStockThreshold;
  return level != null && quantity <= level ? "low" : "in";
}

export interface StockStats {
  /** Active products of any kind. */
  products: number;
  /** Active products whose stock is counted. */
  counted: number;
  units: number;
  out: number;
  low: number;
  /** Units on hand times cost, for counted products that have a cost. null when too large to show exactly. */
  valueMinor: number | null;
  /** Counted products with stock on hand but no cost recorded, so they are not in the value. */
  withoutCost: number;
}

export function computeStockStats(products: readonly StatProduct[], quantityOf: (productId: string) => number): StockStats {
  const stats: StockStats = { products: 0, counted: 0, units: 0, out: 0, low: 0, valueMinor: 0, withoutCost: 0 };
  let value = 0n;
  for (const product of products) {
    if (!product.active) continue;
    stats.products++;
    if (!tracksStock(product)) continue;
    stats.counted++;
    const quantity = Math.max(0, quantityOf(product.id));
    stats.units += quantity;
    const status = stockStatus(product, quantity);
    if (status === "out") stats.out++;
    else if (status === "low") stats.low++;
    if (quantity > 0) {
      if (product.costMinor == null) stats.withoutCost++;
      else value += BigInt(quantity) * BigInt(product.costMinor);
    }
  }
  stats.valueMinor = value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
  return stats;
}

/** Hidden (inactive) products only appear under "All" so the other filters describe what is for sale. */
export function matchesFilter(product: StatProduct, quantity: number, filter: StockFilter): boolean {
  if (filter === "all") return true;
  if (!product.active) return false;
  const status = stockStatus(product, quantity);
  return filter === "low" ? status === "low" : status === filter;
}
