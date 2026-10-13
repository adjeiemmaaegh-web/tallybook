/** Conservative denomination boundary for the legacy single-currency management
 * report. It is not an FX converter or a way to guess pre-snapshot currencies.
 * Every nonzero monetary source contributing to a report must retain the same
 * original three-letter currency as the currency used to format that report.
 * Original sale tenders/reversals inherit the matched sale's currency; their
 * distinct linkage/amount integrity is verified by the other ledger audits.
 */
const validCurrency = value => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const validAmount = value => Number.isSafeInteger(value) && value >= 0;
function assertRows(rows, currency, label, amountKey) {
  if (!Array.isArray(rows)) throw new Error(`Financial ${label} evidence is missing.`);
  for (const row of rows) {
    if (!row || !validAmount(row[amountKey]))
      throw new Error(`Financial ${label} has invalid monetary evidence.`);
    if (row[amountKey] > 0 && !validCurrency(row.currency))
      throw new Error(`Financial ${label} has unknown historical currency; reconcile the source before reporting.`);
    if (validCurrency(row.currency) && row.currency !== currency)
      throw new Error(`Financial ${label} contains a different currency (${row.currency}); do not combine currency amounts.`);
    if (row.currency !== undefined && !validCurrency(row.currency))
      throw new Error(`Financial ${label} contains invalid currency evidence.`);
  }
}
export function assertSingleCurrencyFinancialEvidence(input, currency) {
  if (!validCurrency(currency)) throw new Error('Financial reporting requires a valid business currency.');
  // Check complete company-owned history, not merely the selected date range:
  // a current balance and a past return can refer to earlier transactions.
  assertRows(input.sales, currency, 'sales', 'totalMinor');
  assertRows(input.repayments, currency, 'repayments', 'amountMinor');
  assertRows(input.expenses, currency, 'expenses', 'amountMinor');
  assertRows(input.walletTransfers, currency, 'prepaid transfers', 'amountMinor');
  assertRows(input.cashReturns, currency, 'partial cash returns', 'refundedMinor');
  return true;
}
