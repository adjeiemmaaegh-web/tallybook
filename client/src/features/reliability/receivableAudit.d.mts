export type ReceivableAuditCode = 'receivable-customer' | 'receivable-sale' | 'receivable-reversal' | 'receivable-repayment' | 'receivable-allocation' | 'receivable-currency' | 'receivable-balance';
export interface ReceivableAuditIssue { code: ReceivableAuditCode; recordId?: string; }
export interface AuditCompanyRecord { id: string; businessProfileId: string; }
export interface AuditSaleRecord extends AuditCompanyRecord { customerId?: string; receiptNumber: string; currency?: string; outstandingMinor: number; totalMinor: number; amountPaidMinor: number; }
export interface AuditReversalRecord extends AuditCompanyRecord { originalSaleId: string; originalReceiptNumber: string; customerId?: string; reversedSaleTotalMinor: number; reversedReceivedMinor: number; reversedOutstandingMinor: number; }
export interface AuditRepaymentRecord extends AuditCompanyRecord { customerId: string; amountMinor: number; currency?: string; saleAllocations?: readonly {saleId: string; amountMinor: number}[]; }
export function auditReceivableRecords(companyId: string, customers: readonly AuditCompanyRecord[], sales: readonly AuditSaleRecord[], reversals: readonly AuditReversalRecord[], repayments: readonly AuditRepaymentRecord[]): ReceivableAuditIssue[];
