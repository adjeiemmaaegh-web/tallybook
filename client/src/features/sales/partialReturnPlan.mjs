/**
 * Read-only, deterministic draft allocation for a prospective partial sale return.
 * IMPORTANT: no refund, debt adjustment, tax credit, stock movement or provider
 * action is recorded here. This calculation is NOT an approved return policy.
 * It allocates the original SAVED invoice total proportionately, with fixed
 * per-line rounding, so retry/order cannot manufacture additional refunds.
 */
function integer(value, name, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new Error(`Invalid ${name} in original sale evidence.`);
  return value;
}
function id(value, name) {
  if (typeof value !== 'string' || !value.trim() || value.length > 140) throw new Error(`Invalid ${name} in original sale evidence.`);
  return value;
}
function safeNumber(value) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Return amount exceeds safe money precision.');
  return Number(value);
}
/** Fixed Hamilton distribution; stable line-ID order breaks exact ties. */
export function allocateSavedInvoiceMinor(totalMinor, lines) {
  integer(totalMinor, 'invoice amount');
  if (!Array.isArray(lines) || !lines.length) throw new Error('Original sale lines are unavailable.');
  const ids = new Set();
  let denominator = 0n;
  for (const row of lines) {
    id(row?.id, 'line identity');
    if (ids.has(row.id)) throw new Error('Duplicate original sale line identity.');
    ids.add(row.id);
    denominator += BigInt(integer(row.lineTotalMinor, 'line amount'));
  }
  if (denominator <= 0n && totalMinor !== 0) throw new Error('Original sale has no allocatable line value.');
  if (denominator === 0n) return Object.fromEntries(lines.map(row => [row.id, 0]));
  const target = BigInt(totalMinor);
  const allocations = lines.map(row => {
    const numerator = target * BigInt(row.lineTotalMinor);
    return { id: row.id, amount: numerator / denominator, remainder: numerator % denominator };
  });
  let remainder = target - allocations.reduce((sum, row) => sum + row.amount, 0n);
  allocations.sort((a,b) => a.remainder === b.remainder ? a.id.localeCompare(b.id) : (a.remainder > b.remainder ? -1 : 1));
  for (const allocation of allocations) {
    if (remainder === 0n) break;
    allocation.amount++;
    remainder--;
  }
  return Object.fromEntries(allocations.map(row => [row.id, safeNumber(row.amount)]));
}

/** Validate saved invoice tax evidence without relying on a live/current tax policy.
 * Legacy tax objects lacking their original policy remain explicitly unverified.
 * This is a DRAFT allocation, never an authorization to post a tax refund. */
function inspectSavedReturnTax(sale, subtotalMinor, discountMinor, totalMinor) {
  const base = BigInt(subtotalMinor) - BigInt(discountMinor);
  if (!sale.tax) {
    if (BigInt(totalMinor) !== base) throw new Error('Original sale money does not reconcile.');
    return { taxableMinor: totalMinor, taxMinor: 0, policyVerified: false };
  }
  const taxableMinor = integer(sale.tax.taxableMinor, 'taxable amount');
  const taxMinor = integer(sale.tax.taxMinor, 'tax amount');
  if (integer(sale.tax.totalMinor, 'tax snapshot total') !== totalMinor ||
      BigInt(taxableMinor) + BigInt(taxMinor) !== BigInt(totalMinor)) {
    throw new Error('Original saved tax snapshot does not reconcile.');
  }
  const policy = sale.tax.policy;
  if (!policy) return { taxableMinor, taxMinor, policyVerified: false };
  if (policy.enabled !== true || policy.registrationStatus !== 'registered' ||
      !Number.isInteger(policy.rateBasisPoints) || policy.rateBasisPoints < 0 ||
      policy.rateBasisPoints > 10000 || !['inclusive', 'exclusive'].includes(policy.priceMode)) {
    throw new Error('Original saved tax policy is invalid.');
  }
  const rate = BigInt(policy.rateBasisPoints);
  const divisor = policy.priceMode === 'inclusive' ? 10000n + rate : 10000n;
  const expectedTax = (base * rate * 2n + divisor) / (2n * divisor);
  const expectedTotal = policy.priceMode === 'inclusive' ? base : base + expectedTax;
  if (expectedTax !== BigInt(taxMinor) || expectedTotal !== BigInt(totalMinor) ||
      expectedTotal - expectedTax !== BigInt(taxableMinor)) {
    throw new Error('Original saved tax policy and amounts do not reconcile.');
  }
  return { taxableMinor, taxMinor, policyVerified: true };
}

/**
 * Each return supplies a nonempty array { saleLineId, quantity }. Previous
 * accepted returns are supplied as a flat array of those same immutable rows.
 * An exact full-sale reversal or any damaged/money-only disposition must be
 * checked/approved by the TRANSACTIONAL posting layer, not this draft planner.
 */
export function planPartialSaleReturn(sale, saleLines, previousReturns, requestedLines) {
  if (!sale || !Array.isArray(saleLines) || !saleLines.length || !Array.isArray(previousReturns) ||
      !Array.isArray(requestedLines) || !requestedLines.length) throw new Error('A complete sale and return request are required.');
  id(sale.id, 'sale identity');
  id(sale.businessProfileId, 'company identity');
  const subtotalMinor = integer(sale.subtotalMinor, 'subtotal');
  const discountMinor = integer(sale.discountMinor, 'discount');
  const totalMinor = integer(sale.totalMinor, 'sale total');
  integer(sale.amountPaidMinor, 'recorded payment');
  integer(sale.outstandingMinor, 'outstanding debt');
  if (discountMinor > subtotalMinor || BigInt(sale.amountPaidMinor) + BigInt(sale.outstandingMinor) !== BigInt(totalMinor)) {
    throw new Error('Original sale money does not reconcile.');
  }
  const savedTax = inspectSavedReturnTax(sale, subtotalMinor, discountMinor, totalMinor);
  const byId = new Map();
  let grossMinor = 0n;
  for (const line of saleLines) {
    id(line?.id, 'line identity');
    if (byId.has(line.id) || line.saleId !== sale.id || line.businessProfileId !== sale.businessProfileId) throw new Error('Original sale lines are duplicated or belong to another sale/company.');
    integer(line.quantity, 'line quantity', true);
    integer(line.unitPriceMinor, 'unit price');
    integer(line.lineTotalMinor, 'line amount');
    if (BigInt(line.quantity) * BigInt(line.unitPriceMinor) !== BigInt(line.lineTotalMinor)) throw new Error('Sale line quantities and prices do not reconcile.');
    grossMinor += BigInt(line.lineTotalMinor);
    byId.set(line.id, line);
  }
  if (grossMinor !== BigInt(subtotalMinor)) throw new Error('Sale lines do not reconcile with original subtotal.');
  const previous = new Map();
  const request = new Map();
  function collect(rows, destination, prior) {
    for (const row of rows) {
      const saleLineId = id(row?.saleLineId, 'return line identity');
      const line = byId.get(saleLineId);
      if (!line) throw new Error('Return refers to a missing or foreign original sale line.');
      if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) throw new Error('Return quantity must be a positive integer.');
      const sum = BigInt(destination.get(saleLineId) ?? 0) + BigInt(row.quantity);
      if (sum > BigInt(line.quantity)) throw new Error(prior ? 'Saved return history exceeds original quantity.' : 'Return quantity exceeds original quantity.');
      destination.set(saleLineId, Number(sum));
    }
  }
  collect(previousReturns, previous, true);
  collect(requestedLines, request, false);
  // Allocate each original SAVED component separately. Splitting an invoice first
  // and allocating tax afterwards on each return can invent rounding pennies.
  // Fixed invoice-wide shares and cumulative deltas ensure that repeated small
  // returns conserve the exact original tax, taxable and discount totals.
  const taxableShares = allocateSavedInvoiceMinor(savedTax.taxableMinor, saleLines);
  const taxShares = allocateSavedInvoiceMinor(savedTax.taxMinor, saleLines);
  const discountShares = allocateSavedInvoiceMinor(discountMinor, saleLines);
  const partialShare = (share, before, after, totalQuantity) => {
    const part = BigInt(share);
    return (part * BigInt(after) / BigInt(totalQuantity)) - (part * BigInt(before) / BigInt(totalQuantity));
  };
  let taxableAmount = 0n, taxAmount = 0n, discountAmount = 0n;
  const lines = [];
  for (const [saleLineId, quantity] of request) {
    const line = byId.get(saleLineId);
    const already = previous.get(saleLineId) ?? 0;
    if (BigInt(already) + BigInt(quantity) > BigInt(line.quantity)) throw new Error('Cumulative returns exceed original line quantity.');
    const taxable = partialShare(taxableShares[saleLineId], already, already + quantity, line.quantity);
    const tax = partialShare(taxShares[saleLineId], already, already + quantity, line.quantity);
    const discount = partialShare(discountShares[saleLineId], already, already + quantity, line.quantity);
    taxableAmount += taxable;
    taxAmount += tax;
    discountAmount += discount;
    lines.push({ saleLineId, quantity, previouslyReturnedQuantity: already, cumulativeReturnedQuantity: already + quantity,
      allocatedMinor: safeNumber(taxable + tax), taxableMinor: safeNumber(taxable), taxMinor: safeNumber(tax), discountMinor: safeNumber(discount) });
  }
  lines.sort((a,b) => a.saleLineId.localeCompare(b.saleLineId));
  return { originalSaleId: sale.id, businessProfileId: sale.businessProfileId,
    draftAmountMinor: safeNumber(taxableAmount + taxAmount), draftTaxableMinor: safeNumber(taxableAmount),
    draftTaxMinor: safeNumber(taxAmount), draftDiscountMinor: safeNumber(discountAmount),
    taxPolicyVerified: savedTax.policyVerified,
    lines, taxAllocationStatus: sale.tax ? 'invoice-snapshot-proportional-draft' : 'historical-tax-unknown',
    status: 'DRAFT_ONLY_NO_FINANCIAL_OR_STOCK_POSTING' };
}
