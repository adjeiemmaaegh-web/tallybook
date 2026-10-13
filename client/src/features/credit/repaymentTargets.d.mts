import type { Sale } from '../sales/sales';
import type { SaleReversal } from '../assistant/reversals';
import type { DebtRepayment } from './credit';
export interface RepaymentTarget { saleId: string; receiptNumber: string; remainingMinor: number; }
export interface RepaymentTargetsResult { canLink: boolean; reason: string | null; targets: RepaymentTarget[]; unallocatedMinor: number; }
export function getRepaymentTargetsFromLedger(
  sales: readonly Sale[], reversals: readonly SaleReversal[], repayments: readonly DebtRepayment[],
  scope: {customerId: string; businessProfileId: string; currency: string},
): RepaymentTargetsResult;
