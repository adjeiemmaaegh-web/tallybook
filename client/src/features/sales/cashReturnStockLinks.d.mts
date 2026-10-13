import type { Sale, SaleLine } from './sales';
import type { CashPartialSaleReturn } from './cashPartialReturnPosting';
import type { InventoryMovement } from '../inventory/inventory';
import type { InventoryCostEvent } from '../inventory/costLedger';
export function assertCashReturnStockLinks(
  sale: Sale,
  saleLines: SaleLine[],
  returns: CashPartialSaleReturn[],
  movements: InventoryMovement[],
  costEvents: InventoryCostEvent[],
): { checkedReturns: number; checkedLines: number };
export function assertCashReturnLedgerLinks(
  sales: Sale[],
  saleLines: SaleLine[],
  returns: CashPartialSaleReturn[],
  movements: InventoryMovement[],
  costEvents: InventoryCostEvent[],
): { checkedReturns: number; checkedLines: number; checkedSales: number };
