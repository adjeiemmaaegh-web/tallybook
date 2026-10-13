export function isValidFinancialPostingTimestamp(value: unknown): value is string;
export interface PeriodPosting {createdAt: string; amountMinor?: number; totalMinor?: number; reversedSaleTotalMinor?: number; reversedReceivedMinor?: number; originalSaleId?: string; walletAppliedMinor?: number; refundedMinor?: number; kind?: string; expenseDate?: string; category?: string;}
export function assertFinancialPostingDates(input: {sales?: readonly {createdAt:string}[];payments?: readonly {createdAt:string}[];repayments?: readonly {createdAt:string}[];reversals?: readonly {createdAt:string}[];cashReturns?: readonly {createdAt:string}[];walletTransfers?: readonly {createdAt:string}[];expenses?: readonly {expenseDate:string;createdAt:string}[]}): true;
export function reconcileFinancialPeriodDisplay(input: {
  sales?: readonly {createdAt:string;totalMinor:number}[];
  payments?: readonly {createdAt:string;amountMinor:number}[];
  repayments?: readonly {createdAt:string;amountMinor:number}[];
  reversals?: readonly {createdAt:string;originalSaleId:string;reversedSaleTotalMinor:number;reversedReceivedMinor:number}[];
  refunds?: readonly {createdAt:string;refundedMinor:number}[];
  walletTransfers?: readonly {createdAt:string;kind:string;amountMinor:number}[];
  expenses?: readonly {expenseDate:string;createdAt:string;category:string;amountMinor:number}[];
}, saleById: ReadonlyMap<string,{walletAppliedMinor?:number}>,expected:{revenue:number;collections:number;expenses:number}):{daily:{day:string;revenueMinor:number;collectionsMinor:number;expensesMinor:number}[];expenseByCategory:{category:string;amountMinor:number}[]};
