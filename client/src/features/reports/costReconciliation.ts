import { allocationCost, reconstructInventoryCost, type InventoryCostEvent } from "@/features/inventory/costLedger";
import type { Product, InventoryMovement } from "@/features/inventory/inventory";
import type { Sale, SaleLine } from "@/features/sales/sales";
import type { SaleReversal } from "@/features/assistant/reversals";
import type { CashPartialSaleReturn } from "@/features/sales/cashPartialReturnPosting";

function add(a: number, b: number) {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || !Number.isSafeInteger(a + b)) throw new Error("Cost reconciliation exceeds safe integer limits.");
  return a + b;
}

/** Independently replay receipts and allocations, then compare saved checkout totals. */
export function reconcileSaleCosts(company: string, input: {
  products: Product[]; events: InventoryCostEvent[]; movements: InventoryMovement[];
  sales: Sale[]; lines: SaleLine[]; reversals: SaleReversal[]; cashReturns?: CashPartialSaleReturn[];
}, range: { start: Date; end: Date }): { cogsMinor?: number; unavailableSales: number } {
  for (const rows of [input.products, input.events, input.movements, input.sales, input.lines, input.reversals, input.cashReturns ?? []]) {
    if (rows.some(row => row.businessProfileId !== company) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error("Cost reconciliation contains duplicate or foreign records.");
  }
  const events = new Map(input.events.map(event => [event.id, event]));
  const movements = new Map(input.movements.map(movement => [movement.id, movement]));
  const productIds = new Set(input.products.map(product => product.id));
  for (const event of input.events) {
    if (!productIds.has(event.productId)) throw new Error("Cost event refers to a missing product.");
    // Zero opening quantities from CSV need no physical movement.
    if (event.kind === "legacy-opening" || (event.kind === "opening" && event.quantityDelta === 0 && event.sourceId === `opening:${event.productId}`)) continue;
    const movement = movements.get(event.sourceId);
    if (!movement || movement.productId !== event.productId || movement.quantityDelta !== event.quantityDelta || movement.createdAt !== event.createdAt || movement.resultingQuantity - movement.previousQuantity !== event.quantityDelta) throw new Error("Inventory cost evidence does not match its stock movement.");
    if (event.kind === "issue" && event.saleId) {
      const line = input.lines.find(line => line.id === event.saleLineId);
      if (!line || line.costEventId !== event.id || line.saleId !== event.saleId) throw new Error("Cost allocation refers to a missing sale line.");
    }
    if (event.kind === "reversal") {
      const full = input.reversals.some(reversal => reversal.originalSaleId === event.saleId && reversal.createdAt === event.createdAt);
      const partial = (input.cashReturns ?? []).some(ret => ret.originalSaleId === event.saleId && ret.createdAt === event.createdAt &&
        ret.lines.some(line => line.costEventId === event.id && line.productId === event.productId &&
          line.movementId === event.sourceId && line.quantity === event.quantityDelta));
      if ((full ? 1 : 0) + (partial ? 1 : 0) !== 1) throw new Error("Cost reversal has no uniquely matched full or partial return evidence.");
    }
  }
  for (const product of input.products) {
    const history = input.events.filter(event => event.productId === product.id);
    if (!history.length) continue;
    if (reconstructInventoryCost(history, company, product.id).quantity !== product.stockQuantity) throw new Error("Current stock does not reconcile with cost history.");
  }
  const saleCosts = new Map<string, number | undefined>();
  for (const sale of input.sales) {
    const lines = input.lines.filter(line => line.saleId === sale.id);
    let total = 0, known = lines.length > 0;
    for (const line of lines) {
      if (line.stockTracked === false && line.costStatus === "verified" && line.cogsMinor === 0 && !line.costEventId) continue;
      if (!line.costEventId) { known = false; continue; }
      const event = events.get(line.costEventId);
      if (!event || event.kind !== "issue" || event.saleId !== sale.id || event.saleLineId !== line.id || event.productId !== line.productId || event.quantityDelta !== -line.quantity) throw new Error("Sale quantity and cost allocation do not reconcile.");
      const derived = allocationCost(event);
      if (derived !== line.cogsMinor || line.costStatus !== (derived === undefined ? "unavailable" : "verified")) throw new Error("Saved sale-line cost differs from receipt evidence.");
      if (derived === undefined) known = false;
      else total = add(total, derived);
    }
    const derived = known ? total : undefined;
    if (sale.costStatus !== undefined && (sale.cogsMinor !== derived || sale.costStatus !== (known ? "verified" : "unavailable"))) throw new Error("Saved sale cost differs from receipt evidence.");
    saleCosts.set(sale.id, derived);
  }
  const within = (date: string) => new Date(date) >= range.start && new Date(date) < range.end;
  const postings = [...input.sales.filter(sale => within(sale.createdAt)).map(sale => ({ saleId: sale.id, sign: 1 })), ...input.reversals.filter(reversal => within(reversal.createdAt)).map(reversal => ({ saleId: reversal.originalSaleId, sign: -1 }))];
  let cogsMinor = 0, unavailableSales = 0;
  const cashReturnCostPostings = input.cashReturns ?? [];
  for (const ret of cashReturnCostPostings) {
    for (const line of ret.lines) {
      const costEvent = events.get(line.costEventId);
      if (!costEvent || costEvent.kind !== "reversal" || costEvent.sourceId !== line.movementId ||
          costEvent.saleId !== ret.originalSaleId || costEvent.saleLineId !== line.saleLineId ||
          costEvent.quantityDelta !== line.quantity || costEvent.productId !== line.productId ||
          costEvent.createdAt !== ret.createdAt) throw new Error("Saved partial-return cost restoration does not reconcile.");
      const derived = allocationCost(costEvent);
      if (within(ret.createdAt)) {
        if (derived === undefined) unavailableSales++;
        else cogsMinor = add(cogsMinor, -derived);
      }
    }
  }
  for (const posting of postings) {
    const value = saleCosts.get(posting.saleId);
    if (value === undefined) unavailableSales++;
    else cogsMinor = add(cogsMinor, value * posting.sign);
  }
  return { cogsMinor: unavailableSales ? undefined : cogsMinor, unavailableSales };
}
