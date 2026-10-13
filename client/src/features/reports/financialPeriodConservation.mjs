/** FIN-002: independent, read-only period/day/category conservation check.
 * Reconstructs the report's display rows from immutable saved events, without
 * calling the report's reducers. A valid final total cannot hide an overflowing
 * intermediate day, category, or cross-source financial posting.
 */
const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const validNumber = n => Number.isSafeInteger(n);
const amount = (n, source) => {
  if (!validNumber(n)) throw new Error(`Financial ${source} has an unsafe monetary amount.`);
  return BigInt(n);
};
const safe = (n, source) => {
  if (n > MAX || n < -MAX) throw new Error(`Financial ${source} exceeds safe monetary precision.`);
  return Number(n);
};
// Date.parse accepts normalized impossible calendar dates (e.g. February 30)
// and locale-specific phrases. Financial postings must have a real calendar
// day and an unambiguous, machine-readable date-time shape. Legacy local ISO
// date-times are accepted without inventing a historical UTC offset.
const POSTING_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-](\d{2}):(\d{2}))?$/;
const validExpenseDay = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  // Use UTC calendar fields, not the client's local clock or the Date.UTC
  // special mapping of years 0–99 to 1900–1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const validTimestamp = value => {
  if (typeof value !== 'string') return false;
  const match = POSTING_TIMESTAMP.exec(value);
  if (!match || !validExpenseDay(value.slice(0, 10))) return false;
  const hour = Number(match[4]), minute = Number(match[5]), second = Number(match[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return false;
  if (match[8] && match[8] !== 'Z') {
    const offsetHour = Number(match[9]), offsetMinute = Number(match[10]);
    if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return false;
  }
  return Number.isFinite(Date.parse(value));
};
/** Shared strict saved-posting validator for other read-only ledger audits. */
export const isValidFinancialPostingTimestamp = validTimestamp;
const key = timestamp => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const errorDate = label => {throw new Error(`Financial ${label} contains an invalid original posting date; reconcile saved evidence before reporting.`);};
/** Verify complete history, not just visible records. This prevents invalid past
 * rows being omitted from a report through a failing date-range comparison. */
export function assertFinancialPostingDates({sales=[],payments=[],repayments=[],reversals=[],cashReturns=[],walletTransfers=[],expenses=[]}) {
  for (const [label,rows] of Object.entries({sales,payments,repayments,reversals,cashReturns,walletTransfers})) {
    if (!Array.isArray(rows)) errorDate(label);
    for (const row of rows) if (!validTimestamp(row?.createdAt)) errorDate(label);
  }
  if (!Array.isArray(expenses)) errorDate('expenses');
  for (const expense of expenses) {
    if (!validExpenseDay(expense?.expenseDate) || !validTimestamp(expense?.createdAt)) errorDate('expenses');
  }
  return true;
}
/** The caller supplies ONLY rows selected for the reporting period. Original
 * source timestamps and the original reversal's wallet amount are used. */
export function reconcileFinancialPeriodDisplay({sales=[],payments=[],repayments=[],reversals=[],refunds=[],walletTransfers=[],expenses=[]}, saleById, expected) {
  // This public pure helper may also be called independently of the report.
  // Never group a malformed posting into a different calendar day.
  assertFinancialPostingDates({sales,payments,repayments,reversals,cashReturns:refunds,walletTransfers,expenses});
  const daily = new Map();
  const categories = new Map();
  const row = day => {let value=daily.get(day);if (!value){value={day,revenue:0n,collections:0n,expenses:0n};daily.set(day,value);}return value;};
  const add=(day,field,delta) => {
    const item=row(day);
    item[field]+=delta;
    // Even if a later correction cancels it, an unrepresentable intermediate
    // posting must not be published as a valid daily amount.
    safe(item[field],`daily ${field}`);
  };
  const totals={revenue:0n,collections:0n,expenses:0n};
  const post=(day,field,delta) => {add(day,field,delta); totals[field]+=delta; safe(totals[field],`period ${field}`);};
  for(const sale of sales) post(key(sale.createdAt),'revenue',amount(sale.totalMinor,'sale'));
  for(const reversal of reversals) {
    const original=saleById.get(reversal.originalSaleId);
    if(!original) throw new Error('Financial reversal has no original sale.');
    const day=key(reversal.createdAt);
    post(day,'revenue',amount(reversal.reversedSaleTotalMinor,'reversal'));
    post(day,'collections',amount(reversal.reversedReceivedMinor,'reversal receipt')+amount(original.walletAppliedMinor ?? 0,'original wallet'));
  }
  for(const payment of payments) post(key(payment.createdAt),'collections',amount(payment.amountMinor,'sale payment'));
  for(const repayment of repayments) post(key(repayment.createdAt),'collections',amount(repayment.amountMinor,'repayment'));
  for(const refund of refunds) {
    const day=key(refund.createdAt);
    const value=amount(refund.refundedMinor,'cash return');
    post(day,'revenue',-value);
    post(day,'collections',-value);
  }
  for(const transfer of walletTransfers) {
    if(!['deposit','refund'].includes(transfer.kind)) throw new Error('Financial prepaid transfer kind is invalid.');
    const value=amount(transfer.amountMinor,'prepaid transfer');
    post(key(transfer.createdAt),'collections',transfer.kind==='deposit'?value:-value);
  }
  for(const expense of expenses) {
    if(typeof expense.category !== 'string' || !expense.category.trim()) throw new Error('Financial expense category is invalid.');
    const value=amount(expense.amountMinor,'expense');
    post(expense.expenseDate,'expenses',value);
    const next=(categories.get(expense.category) ?? 0n)+value;
    safe(next,'expense category');
    categories.set(expense.category,next);
  }
  for(const [field, expectedValue] of Object.entries(expected)) {
    if(!Object.hasOwn(totals,field)) throw new Error('Invalid period reconciliation field.');
    if(totals[field] !== amount(expectedValue,'reported total'))
      throw new Error(`Financial daily ${field} does not reconcile to the report summary.`);
  }
  return {
    daily:[...daily.values()].map(item => ({day:item.day,revenueMinor:safe(item.revenue,'daily revenue'),collectionsMinor:safe(item.collections,'daily collections'),expensesMinor:safe(item.expenses,'daily expenses')})).sort((a,b)=>a.day.localeCompare(b.day)),
    expenseByCategory:[...categories].map(([category, value])=>({category,amountMinor:safe(value,'expense category')})).sort((a,b)=>b.amountMinor-a.amountMinor),
  };
}
