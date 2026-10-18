/**
 * Verified customer receivable arithmetic in minor units. Full sale reversals
 * are immutable NEGATIVE deltas in the saved ledger, not positive refund values.
 * No historical cost, payment or due-date facts are inferred here.
 */
export function checkedMinorSum(records, key) {
  if (!Array.isArray(records)) throw new Error('Customer ledger is unavailable for reconciliation.');
  let total = 0;
  for (const record of records) {
    const amount = record?.[key];
    if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('Customer ledger contains an invalid monetary amount.');
    total += amount;
    if (!Number.isSafeInteger(total)) throw new Error('Customer ledger exceeds safe monetary limits.');
  }
  return total;
}

/**
 * Validate optional explicit allocation evidence without rewriting legacy debt.
 * A missing saleAllocations property means UNKNOWN allocation, not FIFO.
 * A present property must cover the entire immutable repayment exactly.
 * This is pure, so callers can validate inside a write transaction and while
 * parsing a backup. It does not issue payments or resolve old transactions.
 */
export function reconcileRepaymentAllocations(sales, reversals, repayments) {
  if (![sales, reversals, repayments].every(Array.isArray))
    throw new Error('Customer repayment allocation records are unavailable.');
  const bySale = new Map();
  for (const sale of sales) {
    if (typeof sale?.id !== 'string' || !sale.id || bySale.has(sale.id) ||
        !Number.isSafeInteger(sale.outstandingMinor) || sale.outstandingMinor < 0)
      throw new Error('Invalid sale identity or debt in repayment allocations.');
    bySale.set(sale.id, sale);
  }
  const reversed = new Set(reversals.map(row => row.originalSaleId));
  const allocatedBySale = new Map();
  const repaymentIds = new Set();
  const repaymentKeys = new Set();
  let unallocatedMinor = 0;
  for (const repayment of repayments) {
    if (repayment?.id !== undefined) {
      if (typeof repayment.id !== 'string' || !repayment.id || repaymentIds.has(repayment.id))
        throw new Error('Duplicate or missing repayment identity in allocation history.');
      repaymentIds.add(repayment.id);
    }
    if (repayment?.submissionKey !== undefined) {
      if (typeof repayment.submissionKey !== 'string' || !repayment.submissionKey || repaymentKeys.has(repayment.submissionKey))
        throw new Error('Duplicate repayment operation key in allocation history.');
      repaymentKeys.add(repayment.submissionKey);
    }
    if (!Number.isSafeInteger(repayment?.amountMinor) || repayment.amountMinor < 0)
      throw new Error('Invalid repayment amount in allocation evidence.');
    if (repayment.saleAllocations === undefined) {
      unallocatedMinor += repayment.amountMinor;
      if (!Number.isSafeInteger(unallocatedMinor)) throw new Error('Repayment allocation exceeds safe money bounds.');
      continue;
    }
    if (repayment.saleAllocations !== undefined &&
        (typeof repayment.businessProfileId !== 'string' || !repayment.businessProfileId ||
         typeof repayment.customerId !== 'string' || !repayment.customerId))
      throw new Error('Repayment allocation lacks its company or customer identity.');
    if (repayment.amountMinor === 0 || !Array.isArray(repayment.saleAllocations) ||
        repayment.saleAllocations.length === 0 || repayment.saleAllocations.length > 256)
      throw new Error('Repayment allocation must be a nonempty list for a positive repayment.');
    const inRepayment = new Set();
    let allocatedTotal = 0;
    for (const entry of repayment.saleAllocations) {
      if (!entry || typeof entry.saleId !== 'string' || !entry.saleId || inRepayment.has(entry.saleId) ||
          !Number.isSafeInteger(entry.amountMinor) || entry.amountMinor <= 0)
        throw new Error('Repayment allocation has duplicate sale links or invalid amounts.');
      inRepayment.add(entry.saleId);
      const sale = bySale.get(entry.saleId);
      if (!sale || sale.customerId !== repayment.customerId ||
          sale.businessProfileId !== repayment.businessProfileId || reversed.has(entry.saleId))
        throw new Error('Repayment allocation refers to a foreign, missing or reversed credit sale.');
      // A positive allocation cannot link amounts with contradictory or only
      // one-sided currency evidence. Two historical unknowns are preserved as
      // unverifiable history, not silently migrated to today's profile currency.
      if (sale.currency !== repayment.currency)
        throw new Error('Repayment allocation currency does not match saved sale currency evidence.');
      allocatedTotal += entry.amountMinor;
      const paid = (allocatedBySale.get(entry.saleId) ?? 0) + entry.amountMinor;
      if (!Number.isSafeInteger(allocatedTotal) || !Number.isSafeInteger(paid) || paid > sale.outstandingMinor)
        throw new Error('Repayment allocations exceed the original sale debt or safe money bounds.');
      allocatedBySale.set(entry.saleId, paid);
    }
    if (allocatedTotal !== repayment.amountMinor)
      throw new Error('Repayment allocations do not sum to the immutable payment amount.');
  }
  return { unallocatedMinor, allocatedBySale };
}

/**
 * Find an attributable currency for one customer's receivables. Historical
 * rows without saved currency have UNKNOWN denomination. Never combine a
 * known currency with another known currency, or with unknown money, into a
 * single debt total. Zero-value rows carry no receivable currency evidence.
 *
 * An entirely legacy/unknown ledger is left readable for local historical
 * inspection, but must not be used to authorize a new currency-denominated
 * write until its currency has been independently established.
 */
export function inspectReceivableCurrency(sales, repayments) {
  if (!Array.isArray(sales) || !Array.isArray(repayments))
    throw new Error('Customer currency evidence is unavailable.');
  const currencies = new Set();
  let unknown = false;
  for (const [rows, amountKey] of [[sales, 'outstandingMinor'], [repayments, 'amountMinor']]) {
    for (const row of rows) {
      const amount = row?.[amountKey];
      if (!Number.isSafeInteger(amount) || amount < 0)
        throw new Error('Customer currency evidence has an invalid monetary amount.');
      const currency = row?.currency;
      if (currency !== undefined && (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)))
        throw new Error('Customer currency evidence has an invalid currency code.');
      if (amount > 0) {
        if (currency === undefined) unknown = true;
        else currencies.add(currency);
      }
    }
  }
  if (currencies.size > 1 || (unknown && currencies.size > 0))
    throw new Error('Customer debt combines currencies or unverified historical money; reconcile currency evidence before posting.');
  return { currency: currencies.values().next().value ?? null, hasUnknownMoney: unknown };
}

/** Validate the proposed tender/credit currency against the immutable ledger. */
export function assertReceivableWriteCurrency(sales, repayments, currency) {
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency))
    throw new Error('A supported three-letter currency code is required.');
  const evidence = inspectReceivableCurrency(sales, repayments);
  if (evidence.hasUnknownMoney)
    throw new Error('Historical customer debt has no verified currency; reconcile it before collecting or extending credit.');
  if (evidence.currency !== null && evidence.currency !== currency)
    throw new Error('Customer debt is recorded in a different currency; cross-currency settlement is not configured.');
  return currency;
}

/**
 * Reconcile the complete saved ledger for ONE customer. Never suppress a
 * negative balance: it indicates an orphan reversal, over-repayment or damage.
 * The full-reversal contract requires a single exact reversal per original sale.
 */
export function reconcileCreditLedger(sales, reversals, repayments) {
  if (!Array.isArray(sales) || !Array.isArray(reversals) || !Array.isArray(repayments)) {
    throw new Error('Customer ledger is unavailable for reconciliation.');
  }
  const saleById = new Map();
  let ledgerOwner = null;
  // Every record in this aggregate must refer to one exact customer/company.
  // Refuse unscoped or foreign entries rather than presenting blended debt.
  const assertOwner = (row) => {
    if (typeof row?.businessProfileId !== 'string' || !row.businessProfileId ||
        typeof row?.customerId !== 'string' || !row.customerId)
      throw new Error('Customer ledger contains an unscoped financial entry.');
    if (ledgerOwner === null) ledgerOwner = [row.businessProfileId, row.customerId];
    else if (row.businessProfileId !== ledgerOwner[0] || row.customerId !== ledgerOwner[1])
      throw new Error('Customer ledger mixes company or customer identities.');
  };
  for (const sale of sales) {
    if (typeof sale?.id !== 'string' || !sale.id || saleById.has(sale.id)) {
      throw new Error('Customer ledger has missing or duplicate sale identities.');
    }
    assertOwner(sale);
    saleById.set(sale.id, sale);
  }
  for (const repayment of repayments) assertOwner(repayment);
  for (const reversal of reversals) assertOwner(reversal);
  // Currency is as important as the integer amount: never add GHS to USD.
  inspectReceivableCurrency(sales, repayments);
  const grossOutstandingMinor = checkedMinorSum(sales, 'outstandingMinor');
  const seenOriginals = new Set();
  const reversalCredits = [];
  for (const reversal of reversals) {
    const originalId = reversal?.originalSaleId;
    const sale = saleById.get(originalId);
    if (typeof originalId !== 'string' || !originalId || !sale || seenOriginals.has(originalId) ||
        !Number.isSafeInteger(reversal.reversedOutstandingMinor) || reversal.reversedOutstandingMinor > 0 ||
        reversal.reversedOutstandingMinor !== -sale.outstandingMinor ||
        reversal.businessProfileId !== sale.businessProfileId ||
        reversal.customerId !== sale.customerId) {
      throw new Error('Customer ledger contains an invalid, orphaned or duplicate sale reversal.');
    }
    seenOriginals.add(originalId);
    reversalCredits.push({ amountMinor: -reversal.reversedOutstandingMinor });
  }
  const reversedOutstandingMinor = checkedMinorSum(reversalCredits, 'amountMinor');
  const repaidMinor = checkedMinorSum(repayments, 'amountMinor');
  reconcileRepaymentAllocations(sales, reversals, repayments);
  const salesOutstandingMinor = grossOutstandingMinor - reversedOutstandingMinor;
  const outstandingMinor = salesOutstandingMinor - repaidMinor;
  if (!Number.isSafeInteger(salesOutstandingMinor) || !Number.isSafeInteger(outstandingMinor) ||
      salesOutstandingMinor < 0 || outstandingMinor < 0) {
    throw new Error('Customer ledger needs reconciliation before extending credit.');
  }
  return { salesOutstandingMinor, repaidMinor, outstandingMinor };
}

export function checkedCreditExposure(sales, reversals, repayments, newOutstanding = 0) {
  if (!Number.isSafeInteger(newOutstanding) || newOutstanding < 0) throw new Error('Invalid new credit balance.');
  const balance = reconcileCreditLedger(sales, reversals, repayments).outstandingMinor;
  if (!Number.isSafeInteger(balance + newOutstanding)) {
    throw new Error('Customer ledger needs reconciliation before extending credit.');
  }
  return balance + newOutstanding;
}
