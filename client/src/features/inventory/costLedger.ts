import Dexie from "dexie";
import { nanoid } from "nanoid";
import type { TallybookDB } from "@/db/TallybookDB";
import type { Product } from "./inventory";
import { assertPartialCostRestoration, planPartialCostRestoration } from "./partialCostRestoration.mjs";

export interface InventoryCostAllocation {
  receiptId: string;
  quantity: number;
  unitCostMinor?: number;
}
export interface InventoryCostEvent {
  id: string;
  businessProfileId: string;
  productId: string;
  sequence: number;
  createdAt: string;
  kind: "opening" | "legacy-opening" | "receipt" | "issue" | "reversal";
  sourceId: string;
  quantityDelta: number;
  unitCostMinor?: number;
  allocations: InventoryCostAllocation[];
  reversesEventId?: string;
  saleId?: string;
  saleLineId?: string;
  purchaseId?: string;
  batchId?: string;
}
interface Layer { receiptId: string; quantity: number; unitCostMinor?: number; purchaseId?: string; }
export interface InventoryCostState {
  quantity: number;
  layers: Layer[];
  knownValueMinor: number;
  unknownCostUnits: number;
  sequence: number;
  historyStartsAt?: string;
  historyAvailable: boolean;
}
const whole = (value: number) => Number.isSafeInteger(value) && value >= 0;
function sum(a: number, b: number) {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("Inventory cost arithmetic exceeds safe limits.");
  return result;
}
function cost(quantity: number, unitCostMinor: number) {
  const value = quantity * unitCostMinor;
  if (!whole(value)) throw new Error("Inventory cost arithmetic exceeds safe limits.");
  return value;
}
function timestamp(value: string) {
  const parsed = Date.parse(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(parsed)) throw new Error("Invalid inventory event timestamp.");
  return parsed;
}

/** Replay immutable quantity and cost evidence; never use today's balance as a historic receipt. */
export function reconstructInventoryCost(events: readonly InventoryCostEvent[], company: string, productId: string, asOf?: string): InventoryCostState {
  const cutoff = asOf === undefined ? Infinity : timestamp(asOf);
  const ordered = [...events].sort((a,b) => a.sequence - b.sequence);
  const layers = new Map<string, Layer>();
  const sources = new Set<string>();
  const ids = new Set<string>();
  const batchReceipts = new Set<string>();
  const restored = new Map<string, InventoryCostEvent[]>();
  const issued = new Map<string, InventoryCostEvent>();
  let sequence = 0, quantity = 0, previousTime = -Infinity;
  const historyStartsAt = ordered[0]?.createdAt;
  for (const event of ordered) {
    const time = timestamp(event.createdAt);
    if (!event.id || ids.has(event.id) || !event.sourceId || sources.has(event.sourceId) || event.businessProfileId !== company || event.productId !== productId || event.sequence !== sequence + 1 || time < previousTime || !Number.isSafeInteger(event.quantityDelta)) throw new Error("Inventory history is incomplete, duplicated or belongs to another company.");
    if (time > cutoff) break;
    if (!Array.isArray(event.allocations) || (event.unitCostMinor !== undefined && !whole(event.unitCostMinor))) throw new Error("Invalid inventory cost evidence.");
    if (event.batchId !== undefined) {
      if (!event.batchId.trim() || event.kind !== "receipt" || !event.purchaseId || batchReceipts.has(event.batchId)) throw new Error("Invalid or duplicated batch receipt cost evidence.");
      batchReceipts.add(event.batchId);
    }
    if (sequence === 0 && !["opening", "legacy-opening"].includes(event.kind)) throw new Error("Inventory history is missing its opening evidence.");
    if (sequence > 0 && ["opening", "legacy-opening"].includes(event.kind)) throw new Error("Inventory history contains a second opening.");
    if (["opening", "legacy-opening", "receipt"].includes(event.kind)) {
      if (event.quantityDelta < 0 || event.allocations.length || (event.kind === "legacy-opening" && event.unitCostMinor !== undefined)) throw new Error("Invalid inventory receipt evidence.");
      layers.set(event.id, { receiptId: event.id, quantity: event.quantityDelta, unitCostMinor: event.unitCostMinor, purchaseId: event.purchaseId });
    } else if (event.kind === "issue" || event.kind === "reversal") {
      const isReversal = event.kind === "reversal";
      if (isReversal ? event.quantityDelta <= 0 : event.quantityDelta >= 0) throw new Error("Invalid inventory allocation quantity.");
      const original = isReversal && event.reversesEventId ? issued.get(event.reversesEventId) : undefined;
      if (isReversal && !original) throw new Error("Inventory reversal has no original issue.");
      if (isReversal && original) assertPartialCostRestoration(original, restored.get(original.id) ?? [], event);
      let allocated = 0;
      const seen = new Set<string>();
      for (const allocation of event.allocations) {
        const layer = layers.get(allocation.receiptId);
        if (!layer || seen.has(allocation.receiptId) || !whole(allocation.quantity) || allocation.quantity === 0 || allocation.unitCostMinor !== layer.unitCostMinor) throw new Error("Invalid or cross-receipt cost allocation.");
        if (!isReversal) {
          const oldest = [...layers.values()].find(candidate => candidate.quantity > 0);
          if (oldest?.receiptId !== allocation.receiptId || allocation.quantity !== Math.min(layer.quantity, -event.quantityDelta - allocated)) throw new Error("Inventory issue does not follow FIFO receipt order.");
        }
        seen.add(allocation.receiptId);
        allocated = sum(allocated, allocation.quantity);
        layer.quantity = sum(layer.quantity, isReversal ? allocation.quantity : -allocation.quantity);
        if (layer.quantity < 0) throw new Error("Inventory allocation exceeds received stock.");
      }
      if (allocated !== Math.abs(event.quantityDelta)) throw new Error("Inventory quantity and cost allocations do not reconcile.");
      if (original) restored.set(original.id, [...(restored.get(original.id) ?? []), event]);
      if (!isReversal) issued.set(event.id, event);
    } else throw new Error("Unknown inventory event kind.");
    quantity = sum(quantity, event.quantityDelta);
    if (quantity < 0) throw new Error("Inventory history has negative stock.");
    sequence = event.sequence;
    previousTime = time;
    ids.add(event.id);
    sources.add(event.sourceId);
  }
  let knownValueMinor = 0, unknownCostUnits = 0;
  for (const layer of layers.values()) {
    if (layer.unitCostMinor === undefined) unknownCostUnits = sum(unknownCostUnits, layer.quantity);
    else knownValueMinor = sum(knownValueMinor, cost(layer.quantity, layer.unitCostMinor));
  }
  return { quantity, layers: [...layers.values()], knownValueMinor, unknownCostUnits, sequence, historyStartsAt, historyAvailable: sequence > 0 };
}

function requireLedgerTransaction(database: TallybookDB) {
  const transaction = Dexie.currentTransaction;
  if (!transaction || transaction.db !== database || transaction.mode !== "readwrite" || !transaction.storeNames.includes("inventoryCostEvents") || !transaction.storeNames.includes("products")) throw new Error("Inventory costs must be posted inside the stock transaction.");
}
async function history(database: TallybookDB, product: Product) {
  return database.inventoryCostEvents.where("[businessProfileId+productId]").equals([product.businessProfileId, product.id]).toArray();
}
type Context = Pick<InventoryCostEvent, "sourceId" | "createdAt"> & Partial<Pick<InventoryCostEvent, "saleId" | "saleLineId" | "purchaseId" | "batchId">>;

/** Caller commits the matching product/movement in this same transaction. */
export async function appendInventoryCostChange(database: TallybookDB, product: Product, quantityDelta: number, context: Context, options: { opening?: boolean; unitCostMinor?: number } = {}) {
  requireLedgerTransaction(database);
  if (!Number.isSafeInteger(quantityDelta) || !whole(product.stockQuantity)) throw new Error("Invalid stock quantity for cost posting.");
  if (context.batchId !== undefined && (!context.batchId.trim() || !context.purchaseId || quantityDelta <= 0 || options.opening)) throw new Error("A batch cost link must belong to a positive supplier receipt.");
  const events = await history(database, product);
  if (options.opening && events.length) throw new Error("Opening cost evidence already exists.");
  if (!events.length && !options.opening) {
    // A legacy balance is known now; its historic cost and earlier receipt date are not.
    const baseline: InventoryCostEvent = { id: nanoid(18), businessProfileId: product.businessProfileId, productId: product.id, sequence: 1, createdAt: context.createdAt, kind: "legacy-opening", sourceId: `legacy-opening:${product.id}`, quantityDelta: product.stockQuantity, allocations: [] };
    await database.inventoryCostEvents.add(baseline);
    events.push(baseline);
  }
  const state = reconstructInventoryCost(events, product.businessProfileId, product.id);
  if (state.quantity !== (options.opening ? 0 : product.stockQuantity)) throw new Error("Stock and historical cost quantities do not reconcile.");
  const event: InventoryCostEvent = { ...context, id: nanoid(18), businessProfileId: product.businessProfileId, productId: product.id, sequence: state.sequence + 1, kind: options.opening ? "opening" : quantityDelta >= 0 ? "receipt" : "issue", quantityDelta, allocations: [] };
  if (quantityDelta >= 0 && options.unitCostMinor !== undefined) event.unitCostMinor = options.unitCostMinor;
  if (quantityDelta < 0) {
    let remaining = -quantityDelta;
    for (const layer of state.layers) {
      const taken = Math.min(remaining, layer.quantity);
      if (taken) event.allocations.push({ receiptId: layer.receiptId, quantity: taken, ...(layer.unitCostMinor === undefined ? {} : { unitCostMinor: layer.unitCostMinor }) });
      remaining -= taken;
      if (!remaining) break;
    }
    if (remaining) throw new Error("Insufficient historical stock for cost allocation.");
  }
  reconstructInventoryCost([...events, event], product.businessProfileId, product.id);
  await database.inventoryCostEvents.add(event);
  return event;
}

export function allocationCost(event: InventoryCostEvent): number | undefined {
  let result = 0;
  for (const allocation of event.allocations) {
    if (allocation.unitCostMinor === undefined) return undefined;
    result = sum(result, cost(allocation.quantity, allocation.unitCostMinor));
  }
  return result;
}

export async function restoreInventoryCost(database: TallybookDB, product: Product, originalEventId: string, context: Context) {
  return restorePartialInventoryCost(database, product, originalEventId, context, undefined);
}

/** Cost-only transaction helper; caller must atomically write matching stock/movement,
 * verified batch disposition and financial return. No standalone refund is issued. */
export async function restorePartialInventoryCost(database: TallybookDB, product: Product, originalEventId: string, context: Context, quantity?: number) {
  requireLedgerTransaction(database);
  const events = await history(database, product);
  const original = events.find(event => event.id === originalEventId && event.kind === "issue");
  if (!original || !original.saleId || original.saleId !== context.saleId || original.businessProfileId !== product.businessProfileId) throw new Error("Original sale cost allocation is unavailable.");
  const state = reconstructInventoryCost(events, product.businessProfileId, product.id);
  if (state.quantity !== product.stockQuantity) throw new Error("Stock and historical cost quantities do not reconcile.");
  const prior = events.filter(event => event.kind === 'reversal' && event.reversesEventId === original.id);
  // A full-sale reversal must not run after a partial restoration; without the
  // matching partial-return finance ledger, that would refund the whole sale twice.
  if (quantity === undefined && prior.length) throw new Error('This sale has prior partial stock restorations; full reversal is unsafe.');
  const plan = planPartialCostRestoration(original, prior, quantity ?? -original.quantityDelta);
  const event: InventoryCostEvent = { ...context, id: nanoid(18), businessProfileId: product.businessProfileId, productId: product.id, sequence: state.sequence + 1, kind: "reversal", quantityDelta: plan.quantityDelta, allocations: plan.allocations, reversesEventId: original.id };
  reconstructInventoryCost([...events, event], product.businessProfileId, product.id);
  await database.inventoryCostEvents.add(event);
  return event;
}
