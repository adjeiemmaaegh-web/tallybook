import type { InventoryCostEvent, InventoryCostAllocation } from './costLedger';
export interface PartialCostRestorationPlan {
  quantityDelta: number;
  allocations: InventoryCostAllocation[];
  previouslyRestoredQuantity: number;
  remainingQuantity: number;
}
/** Pure cost-only plan; does not post money, batches or stock. */
export declare function planPartialCostRestoration(original: InventoryCostEvent, priorReversals: readonly InventoryCostEvent[], returnQuantity: number): PartialCostRestorationPlan;
export declare function assertPartialCostRestoration(original: InventoryCostEvent, priorReversals: readonly InventoryCostEvent[], event: InventoryCostEvent): PartialCostRestorationPlan;
