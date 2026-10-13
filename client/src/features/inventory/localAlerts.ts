import type { Product } from "./inventory";

export interface StockAlert {
  productId: string;
  productName: string;
  remaining: number;
  threshold: number;
  severity: "out" | "low";
}

/** Pure, offline-only computation. Does not send notifications or mutate the ledger. */
export function calculateStockAlerts(products: readonly Product[]): StockAlert[] {
  const seen = new Set<string>();
  const result: StockAlert[] = [];
  for (const product of products) {
    if (product.archivedAt || product.itemKind === "service") continue;
    if (seen.has(product.id)) throw new Error("Duplicate product ID in stock alert source.");
    seen.add(product.id);
    if (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 ||
        !Number.isSafeInteger(product.lowStockThreshold) || product.lowStockThreshold < 0) {
      throw new Error(`Invalid stock records for ${product.name}.`);
    }
    if (product.stockQuantity <= product.lowStockThreshold) {
      result.push({ productId: product.id, productName: product.name, remaining: product.stockQuantity,
        threshold: product.lowStockThreshold, severity: product.stockQuantity === 0 ? "out" : "low" });
    }
  }
  return result.sort((a, b) => (a.severity === "out" ? 0 : 1) - (b.severity === "out" ? 0 : 1) ||
    a.remaining - b.remaining || a.productName.localeCompare(b.productName));
}
