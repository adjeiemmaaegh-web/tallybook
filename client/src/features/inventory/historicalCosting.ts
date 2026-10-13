/** Stage 2/3 costing preparation: deterministic, read-only FIFO preview.
 * This module does NOT post COGS or allocate inventory. Persisted sale-line
 * allocations require an atomic database transaction and reversal handling.
 * All monetary values are integer minor units; quantity is integer base units.
 */
export interface CostLayer { id: string; productId: string; companyId: string; receivedAt: string; remainingUnits: number; unitCostMinor: number }
export interface CostRequest { productId: string; companyId: string; quantity: number; asOf?: string }
export interface CostAllocation { layerId: string; units: number; unitCostMinor: number; amountMinor: number }
export interface CostPreview { allocations: CostAllocation[]; totalCostMinor: number; unallocatedUnits: number; complete: boolean }
const units = (value: number) => Number.isSafeInteger(value) && value >= 0;
const minor = (value: number) => Number.isSafeInteger(value) && value >= 0;
export function previewFifoCost(request: CostRequest, layers: readonly CostLayer[]): CostPreview {
  if (!request.companyId || !request.productId || !units(request.quantity) || request.quantity === 0) throw new Error('Invalid costing request.');
  // If valuing a historical sale, never consume receipts dated after that sale.
  const cutoff = request.asOf === undefined ? undefined : Date.parse(request.asOf);
  if (request.asOf !== undefined && (!/^\d{4}-\d{2}-\d{2}T/.test(request.asOf) || !Number.isFinite(cutoff))) throw new Error('Invalid historical costing cutoff.');
  const seen = new Set<string>();
  for (const layer of layers) {
    if (!layer.id || seen.has(layer.id) || layer.companyId !== request.companyId || layer.productId !== request.productId ||
        !units(layer.remainingUnits) || !minor(layer.unitCostMinor) || !/^\d{4}-\d{2}-\d{2}T/.test(layer.receivedAt) || !Number.isFinite(Date.parse(layer.receivedAt))) {
      throw new Error('Incomplete, duplicate or cross-company cost layer; costing is unavailable.');
    }
    seen.add(layer.id);
  }
  const ordered = layers.filter(layer => cutoff === undefined || Date.parse(layer.receivedAt) <= cutoff)
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt) || a.id.localeCompare(b.id));
  let remaining = request.quantity;
  let totalCostMinor = 0;
  const allocations: CostAllocation[] = [];
  for (const layer of ordered) {
    if (remaining === 0) break;
    const take = Math.min(remaining, layer.remainingUnits);
    if (take === 0) continue;
    const amountMinor = take * layer.unitCostMinor;
    if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(totalCostMinor + amountMinor)) throw new Error('Cost precision limit exceeded.');
    allocations.push({layerId: layer.id, units: take, unitCostMinor: layer.unitCostMinor, amountMinor});
    totalCostMinor += amountMinor;
    remaining -= take;
  }
  return {allocations, totalCostMinor, unallocatedUnits: remaining, complete: remaining === 0};
}
