/**
 * Independent, read-only inspection of persisted customer debt, reversals and
 * repayment links. Keep this separate from creditLedger.mjs, which authorizes
 * writes: an audit must not certify a balance by calling its posting calculator.
 * No currency conversion, legacy allocation or destructive repair is performed.
 */
export function auditReceivableRecords(companyId, customers, sales, reversals, repayments) {
  if (typeof companyId !== 'string' || !companyId ||
      ![customers, sales, reversals, repayments].every(Array.isArray))
    throw new Error('Receivable audit input is unavailable.');
  const issues = [];
  const flag = (code, recordId) => issues.push({code, recordId});
  const validMoney = value => Number.isSafeInteger(value) && value >= 0;
  const validCurrency = value => value === undefined || (typeof value === 'string' && /^[A-Z]{3}$/.test(value));
  const knownCustomers = new Set();
  for (const customer of customers) {
    if (!customer || customer.businessProfileId !== companyId || typeof customer.id !== 'string' || !customer.id || knownCustomers.has(customer.id))
      flag('receivable-customer', customer?.id);
    else knownCustomers.add(customer.id);
  }
  const saleById = new Map();
  const totals = new Map();
  const customerTotals = id => {
    if (!totals.has(id)) totals.set(id, {gross: 0n, credited: 0n, paid: 0n, currencies: new Set(), unknown: false});
    return totals.get(id);
  };
  const denomination = (t, record, amount) => {
    if (!validCurrency(record.currency)) { flag('receivable-currency', record.id); return; }
    if (amount > 0) {
      if (record.currency === undefined) t.unknown = true;
      else t.currencies.add(record.currency);
    }
  };
  for (const sale of sales) {
    if (!sale || typeof sale.id !== 'string' || !sale.id || saleById.has(sale.id)) {
      flag('receivable-sale', sale?.id);
      continue;
    }
    saleById.set(sale.id, sale);
    if (sale.businessProfileId !== companyId || !validMoney(sale.outstandingMinor) || !validCurrency(sale.currency) ||
        (sale.customerId && !knownCustomers.has(sale.customerId)) ||
        (sale.outstandingMinor > 0 && !sale.customerId)) {
      flag('receivable-sale', sale.id);
      continue;
    }
    if (sale.customerId) {
      const t = customerTotals(sale.customerId);
      t.gross += BigInt(sale.outstandingMinor);
      denomination(t, sale, sale.outstandingMinor);
    }
  }
  const reversed = new Set();
  for (const reversal of reversals) {
    const sale = saleById.get(reversal?.originalSaleId);
    if (!reversal || reversal.businessProfileId !== companyId || typeof reversal.id !== 'string' || !reversal.id ||
        !sale || sale.businessProfileId !== companyId || reversed.has(reversal.originalSaleId) ||
        reversal.customerId !== sale.customerId || reversal.originalReceiptNumber !== sale.receiptNumber ||
        !validMoney(sale.totalMinor) || !validMoney(sale.amountPaidMinor) || !validMoney(sale.outstandingMinor) ||
        !Number.isSafeInteger(reversal.reversedSaleTotalMinor) || reversal.reversedSaleTotalMinor !== -sale.totalMinor ||
        !Number.isSafeInteger(reversal.reversedReceivedMinor) || reversal.reversedReceivedMinor !== -sale.amountPaidMinor ||
        !Number.isSafeInteger(reversal.reversedOutstandingMinor) || reversal.reversedOutstandingMinor !== -sale.outstandingMinor) {
      flag('receivable-reversal', reversal?.id);
      continue;
    }
    reversed.add(sale.id);
    if (sale.customerId) customerTotals(sale.customerId).credited += BigInt(sale.outstandingMinor);
  }
  const allocations = new Map();
  const repaymentIds = new Set();
  for (const repayment of repayments) {
    if (!repayment || typeof repayment.id !== 'string' || !repayment.id || repaymentIds.has(repayment.id) ||
        repayment.businessProfileId !== companyId || !knownCustomers.has(repayment.customerId) ||
        !Number.isSafeInteger(repayment.amountMinor) || repayment.amountMinor <= 0) {
      flag('receivable-repayment', repayment?.id);
      continue;
    }
    repaymentIds.add(repayment.id);
    const t = customerTotals(repayment.customerId);
    t.paid += BigInt(repayment.amountMinor);
    denomination(t, repayment, repayment.amountMinor);
    if (repayment.saleAllocations === undefined) continue; // Old payments remain unallocated.
    if (!Array.isArray(repayment.saleAllocations) || repayment.saleAllocations.length < 1 || repayment.saleAllocations.length > 256) {
      flag('receivable-allocation', repayment.id);
      continue;
    }
    let sum = 0n;
    let invalid = false;
    const seen = new Set();
    for (const part of repayment.saleAllocations) {
      const sale = saleById.get(part?.saleId);
      if (!part || typeof part.saleId !== 'string' || !part.saleId || seen.has(part.saleId) ||
          !Number.isSafeInteger(part.amountMinor) || part.amountMinor <= 0 ||
          !sale || sale.businessProfileId !== companyId || sale.customerId !== repayment.customerId ||
          !validMoney(sale.outstandingMinor) || reversed.has(sale.id) || sale.currency !== repayment.currency) {
        invalid = true;
        continue;
      }
      seen.add(part.saleId);
      const amount = BigInt(part.amountMinor);
      sum += amount;
      allocations.set(sale.id, (allocations.get(sale.id) ?? 0n) + amount);
    }
    if (invalid || sum !== BigInt(repayment.amountMinor)) flag('receivable-allocation', repayment.id);
  }
  for (const [saleId, amount] of allocations) {
    if (amount > BigInt(saleById.get(saleId).outstandingMinor)) flag('receivable-allocation', saleId);
  }
  for (const [customerId, t] of totals) {
    if (t.currencies.size > 1 || (t.unknown && t.currencies.size)) flag('receivable-currency', customerId);
    const net = t.gross - t.credited - t.paid;
    if (net < 0n || net > BigInt(Number.MAX_SAFE_INTEGER) ||
        t.gross > BigInt(Number.MAX_SAFE_INTEGER) || t.credited > BigInt(Number.MAX_SAFE_INTEGER) || t.paid > BigInt(Number.MAX_SAFE_INTEGER))
      flag('receivable-balance', customerId);
  }
  return issues;
}
