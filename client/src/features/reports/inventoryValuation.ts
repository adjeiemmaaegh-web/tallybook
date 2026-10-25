import { reconstructInventoryCost, type InventoryCostEvent } from "@/features/inventory/costLedger";
import type { Product } from "@/features/inventory/inventory";
import type { Purchase, PurchaseLine } from "@/features/purchases/purchases";

export interface InventoryValuationCurrencyRow {
  currency: string;
  amountMinor: number;
  productCount: number;
}

export interface InventoryValuationProductRow {
  productId: string;
  productName: string;
  baseUnit: string;
  onHandQuantity: number;
  unknownCostQuantity: number;
  byCurrency: { currency: string; quantity: number; amountMinor: number }[];
  status: "valued" | "partial" | "unknown";
}

export interface InventoryValuation {
  asOf: string;
  currencyTotals: InventoryValuationCurrencyRow[];
  products: InventoryValuationProductRow[];
  unknownCostProducts: number;
  complete: boolean;
}

const safeQuantity = (value: number) => Number.isSafeInteger(value) && value >= 0;
const safeCost = (value: number) => Number.isSafeInteger(value) && value >= 0;
const validCurrency = (value: unknown): value is string => typeof value === "string" && /^[A-Z]{3}$/.test(value);

function checkedAmount(quantity: number, unitCostMinor: number) {
  const amount = BigInt(quantity) * BigInt(unitCostMinor);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Inventory valuation exceeds safe monetary precision.");
  return Number(amount);
}

/**
 * Current stock valuation from remaining FIFO layers. A layer is priced only
 * when its immutable supplier receipt, purchase line, and saved currency agree.
 * Unlinked opening/legacy costs remain unknown; currencies are never combined.
 */
export function reconcileInventoryValuation(
  company: string,
  products: readonly Product[],
  events: readonly InventoryCostEvent[],
  purchases: readonly Purchase[],
  purchaseLines: readonly PurchaseLine[],
  asOf: string,
): InventoryValuation {
  if (!company || !/^\d{4}-\d{2}-\d{2}T/.test(asOf) || !Number.isFinite(Date.parse(asOf))) {
    throw new Error("Inventory valuation requires a company and valid as-of timestamp.");
  }
  const unique = <T extends { id: string }>(rows: readonly T[], kind: string) => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || !row.id || ids.has(row.id)) throw new Error(`Inventory valuation contains duplicate or invalid ${kind} records.`);
      ids.add(row.id);
    }
  };
  unique(products, "product"); unique(events, "cost event"); unique(purchases, "purchase"); unique(purchaseLines, "purchase line");
  if (products.some(row => row.businessProfileId !== company) || events.some(row => row.businessProfileId !== company) || purchases.some(row => row.businessProfileId !== company) || purchaseLines.some(row => row.businessProfileId !== undefined && row.businessProfileId !== company)) {
    throw new Error("Inventory valuation contains foreign-company records.");
  }

  const eventById = new Map(events.map(event => [event.id, event]));
  const purchaseById = new Map(purchases.map(purchase => [purchase.id, purchase]));
  const linesByPurchaseProduct = new Map<string, PurchaseLine[]>();
  const purchaseLineTotals = new Map<string, bigint>();
  for (const line of purchaseLines) {
    if (!safeQuantity(line.quantity) || line.quantity === 0 || !safeCost(line.unitCostMinor) || !safeCost(line.lineTotalMinor)) throw new Error("Inventory valuation found an invalid purchase line amount.");
    const lineAmount = BigInt(line.quantity) * BigInt(line.unitCostMinor);
    if (lineAmount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Inventory valuation exceeds safe monetary precision.");
    if (Number(lineAmount) !== line.lineTotalMinor) throw new Error("Inventory valuation purchase line total does not reconcile.");
    if (purchaseById.has(line.purchaseId)) {
      const total = (purchaseLineTotals.get(line.purchaseId) ?? 0n) + lineAmount;
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Inventory valuation exceeds safe monetary precision.");
      purchaseLineTotals.set(line.purchaseId, total);
    }
    const key = `${line.purchaseId}\u0000${line.productId}`;
    linesByPurchaseProduct.set(key, [...(linesByPurchaseProduct.get(key) ?? []), line]);
  }
  for (const [purchaseId, total] of purchaseLineTotals) {
    if (Number(total) !== purchaseById.get(purchaseId)!.totalCostMinor) throw new Error("Inventory valuation purchase total does not reconcile with its lines.");
  }

  const currencyAmounts = new Map<string, bigint>();
  const currencyProducts = new Map<string, Set<string>>();
  const rows: InventoryValuationProductRow[] = [];

  for (const product of products) {
    if (product.itemKind === "service" || product.stockQuantity === 0) continue;
    if (!safeQuantity(product.stockQuantity)) throw new Error("Inventory valuation found an invalid on-hand quantity.");
    const history = events.filter(event => event.productId === product.id);
    if (!history.length) {
      rows.push({ productId: product.id, productName: product.name, baseUnit: product.baseUnit || "units", onHandQuantity: product.stockQuantity, unknownCostQuantity: product.stockQuantity, byCurrency: [], status: "unknown" });
      continue;
    }
    const state = reconstructInventoryCost(history, company, product.id);
    if (state.quantity !== product.stockQuantity) throw new Error("Inventory valuation quantity does not reconcile with saved stock.");
    const valuedByCurrency = new Map<string, { quantity: number; amountMinor: bigint }>();
    let unknownCostQuantity = 0;

    for (const layer of state.layers) {
      if (!safeQuantity(layer.quantity) || (layer.unitCostMinor !== undefined && !safeCost(layer.unitCostMinor))) throw new Error("Inventory valuation found an invalid cost layer.");
      if (layer.quantity === 0) continue;
      const receipt = eventById.get(layer.receiptId);
      const purchase = layer.purchaseId ? purchaseById.get(layer.purchaseId) : undefined;
      let currency: string | undefined;
      if (layer.purchaseId) {
        if (!receipt || receipt.kind !== "receipt" || receipt.purchaseId !== layer.purchaseId || !purchase) throw new Error("Inventory valuation receipt refers to a missing purchase record.");
        const matches = linesByPurchaseProduct.get(`${purchase.id}\u0000${product.id}`) ?? [];
        if (matches.length !== 1) throw new Error("Inventory valuation receipt does not have one matching purchase line.");
        const line = matches[0];
        // The receipt quantity is immutable; the remaining layer may be lower after sales.
        if (line.quantity !== receipt.quantityDelta || line.unitCostMinor !== receipt.unitCostMinor || line.batchId !== receipt.batchId) throw new Error("Inventory valuation purchase line differs from its cost receipt.");
        if (purchase.currency !== undefined) {
          if (!validCurrency(purchase.currency)) throw new Error("Inventory valuation purchase has an invalid saved currency.");
          currency = purchase.currency;
        }
      }
      if (layer.unitCostMinor === undefined || !currency) {
        unknownCostQuantity += layer.quantity;
        if (!safeQuantity(unknownCostQuantity)) throw new Error("Inventory valuation quantity exceeds safe limits.");
        continue;
      }
      const amountMinor = BigInt(checkedAmount(layer.quantity, layer.unitCostMinor));
      const current = valuedByCurrency.get(currency) ?? { quantity: 0, amountMinor: 0n };
      current.quantity += layer.quantity;
      if (!safeQuantity(current.quantity)) throw new Error("Inventory valuation quantity exceeds safe limits.");
      current.amountMinor += amountMinor;
      if (current.amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Inventory valuation exceeds safe monetary precision.");
      valuedByCurrency.set(currency, current);
    }

    const byCurrency = [...valuedByCurrency].map(([currency, value]) => ({ currency, quantity: value.quantity, amountMinor: Number(value.amountMinor) })).sort((a, b) => a.currency.localeCompare(b.currency));
    for (const value of byCurrency) {
      currencyAmounts.set(value.currency, (currencyAmounts.get(value.currency) ?? 0n) + BigInt(value.amountMinor));
      if (currencyAmounts.get(value.currency)! > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Inventory valuation exceeds safe monetary precision.");
      const productsForCurrency = currencyProducts.get(value.currency) ?? new Set<string>();
      productsForCurrency.add(product.id); currencyProducts.set(value.currency, productsForCurrency);
    }
    rows.push({ productId: product.id, productName: product.name, baseUnit: product.baseUnit || "units", onHandQuantity: product.stockQuantity, unknownCostQuantity, byCurrency, status: unknownCostQuantity === product.stockQuantity ? "unknown" : unknownCostQuantity > 0 ? "partial" : "valued" });
  }

  const currencyTotals = [...currencyAmounts].map(([currency, amount]) => ({ currency, amountMinor: Number(amount), productCount: currencyProducts.get(currency)?.size ?? 0 })).sort((a, b) => a.currency.localeCompare(b.currency));
  const unknownCostProducts = rows.filter(row => row.unknownCostQuantity > 0).length;
  return { asOf, currencyTotals, products: rows.sort((a, b) => a.productName.localeCompare(b.productName) || a.productId.localeCompare(b.productId)), unknownCostProducts, complete: unknownCostProducts === 0 };
}
