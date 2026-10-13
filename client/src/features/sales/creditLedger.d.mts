export function checkedMinorSum<K extends string>(records: readonly Record<K, number>[], key: K): number;
export interface CreditSaleRecord { id: string; customerId?: string; businessProfileId?: string; outstandingMinor: number; currency?: string; }
export interface CreditReversalRecord { originalSaleId: string; customerId?: string; reversedOutstandingMinor: number; }
export interface CreditRepaymentRecord { amountMinor: number; customerId?: string; businessProfileId?: string; currency?: string; saleAllocations?: readonly { saleId: string; amountMinor: number }[]; }
export interface CreditLedgerTotals { salesOutstandingMinor: number; repaidMinor: number; outstandingMinor: number; }
export function reconcileCreditLedger(sales: readonly CreditSaleRecord[], reversals: readonly CreditReversalRecord[], repayments: readonly CreditRepaymentRecord[]): CreditLedgerTotals;
export function checkedCreditExposure(sales: readonly CreditSaleRecord[], reversals: readonly CreditReversalRecord[], repayments: readonly CreditRepaymentRecord[], newOutstanding?: number): number;

export function reconcileRepaymentAllocations(sales: readonly CreditSaleRecord[], reversals: readonly CreditReversalRecord[], repayments: readonly CreditRepaymentRecord[]): { unallocatedMinor: number; allocatedBySale: Map<string, number> };

export interface ReceivableCurrencyEvidence { currency: string | null; hasUnknownMoney: boolean; }
export function inspectReceivableCurrency(sales: readonly CreditSaleRecord[], repayments: readonly CreditRepaymentRecord[]): ReceivableCurrencyEvidence;
export function assertReceivableWriteCurrency(sales: readonly CreditSaleRecord[], repayments: readonly CreditRepaymentRecord[], currency: string): string;
