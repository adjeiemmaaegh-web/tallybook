/**
 * Tallybook Supply (CC-S-03/04/08): exact landed-cost comparison of supplier quotes. PURE and read-only: it never creates a purchase,
 * order, stock change or payment. Integer minor units throughout (BigInt), no currency conversion, no invented tax, neutral ranking
 * (promotion flags never change order), and savings are claimed only against a comparable, recent, complete baseline.
 */
const MAX = 100_000_000_000_000n; // 1e14 minor units, matches the money bounds used across the cloud ledger
const isInt = v => Number.isSafeInteger(v);
const big = (v, label, {min = 0n} = {}) => {
  if (!isInt(v)) throw new Error(`${label} must be a whole number of minor units.`);
  const n = BigInt(v);
  if (n < min || n > MAX) throw new Error(`${label} is out of range.`);
  return n;
};
const ceilDiv = (a, b) => (a + b - 1n) / b;
const roundDiv = (a, b) => (a * 2n + b) / (b * 2n); // half-up

function validateRequest(request) {
  if (!request || typeof request.item !== 'string' || !request.item.trim()) throw new Error('A quote request needs an item.');
  if (!isInt(request.quantity) || request.quantity < 1 || request.quantity > 1_000_000) throw new Error('Quantity must be 1 to 1,000,000 base units.');
  if (!/^[A-Z]{3}$/.test(request.currency ?? '')) throw new Error('A quote request needs a currency.');
  return {item: request.item.trim(), quantity: BigInt(request.quantity), currency: request.currency};
}

/** Evaluate ONE quote against a request. Returns {status:'comparable'|'incomplete'|'excluded', ...}. Never throws on a supplier's bad data: it excludes with a reason. */
export function priceQuote(request, quote, now = Date.now()) {
  const req = validateRequest(request);
  const base = {supplierId: quote?.supplierId ?? null, supplierName: String(quote?.supplierName ?? 'Unknown supplier'), promoted: quote?.promoted === true};
  const exclude = reason => ({...base, status: 'excluded', reason});
  try {
    if (!quote || typeof quote !== 'object') return exclude('Quote is missing.');
    if (quote.currency !== req.currency) return exclude(`Quoted in ${quote.currency ?? 'an unstated currency'}, not ${req.currency}. Tallybook does not convert currencies.`);
    const validUntil = Date.parse(quote.validUntil);
    if (!Number.isFinite(validUntil)) return exclude('The quote has no valid expiry date.');
    if (validUntil < now) return exclude('The quote has expired. Ask the supplier to reconfirm.');
    const pack = quote.packSize === undefined ? 1n : (isInt(quote.packSize) && quote.packSize >= 1 && quote.packSize <= 100_000 ? BigInt(quote.packSize) : (() => { throw new Error('Invalid pack size.'); })());
    const moq = quote.minOrderUnits === undefined ? 1n : big(quote.minOrderUnits, 'Minimum order', {min: 1n});
    let units = req.quantity;
    if (units < moq) units = moq;
    const packs = ceilDiv(units, pack); units = packs * pack;
    const adjusted = units !== req.quantity;
    const goods = big(quote.packPriceMinor, 'Price') * packs;
    const shipping = quote.shippingMinor === undefined ? null : big(quote.shippingMinor, 'Shipping');
    const packaging = quote.packagingMinor === undefined ? 0n : big(quote.packagingMinor, 'Packaging');
    const discount = quote.discountMinor === undefined ? 0n : big(quote.discountMinor, 'Discount');
    if (discount > goods + packaging) return exclude('The discount is larger than the goods and packaging.');
    const taxIncluded = quote.taxIncluded === true;
    const tax = quote.taxMinor === undefined ? null : big(quote.taxMinor, 'Tax');
    const missing = [];
    if (shipping === null) missing.push('shipping not stated');
    if (!taxIncluded && tax === null) missing.push('tax not stated');
    if (taxIncluded && tax !== null) return exclude('The quote says tax is included and also lists a separate tax amount.');
    if (!Number.isSafeInteger(quote.leadTimeDays) || quote.leadTimeDays < 0 || quote.leadTimeDays > 365) missing.push('lead time not stated');
    const total = goods + packaging - discount + (shipping ?? 0n) + (tax ?? 0n);
    if (total > MAX) return exclude('The total is out of range.');
    return {...base, status: missing.length ? 'incomplete' : 'comparable', missing, unitsOrdered: Number(units), adjustedQuantity: adjusted,
      adjustmentNote: adjusted ? `Ordering ${units} units (pack of ${pack}, minimum ${moq}) instead of ${req.quantity}.` : null,
      landedTotalMinor: total, landedTotal: total.toString(), perUnitMinor: roundDiv(total, units).toString(), perUnitMillis: ((total * 1000n) / units).toString(),
      leadTimeDays: Number.isSafeInteger(quote.leadTimeDays) ? quote.leadTimeDays : null, validUntil: new Date(validUntil).toISOString(),
      // An "incomplete" total is a floor, never a price to compare against complete quotes.
      isLowerBoundOnly: missing.length > 0};
  } catch (e) { return exclude(e instanceof Error ? e.message : 'Quote could not be read.'); }
}

/** Compare quotes neutrally. Complete quotes are ranked by landed total, then lead time, then name; incomplete and excluded are listed separately. */
export function compareQuotes({request, quotes, baseline, now = Date.now()}) {
  const req = validateRequest(request);
  if (!Array.isArray(quotes) || quotes.length > 50) throw new Error('Provide 1 to 50 quotes.');
  const priced = quotes.map(q => priceQuote(request, q, now));
  const key = r => `${r.supplierId ?? ''}\u0000${r.supplierName}`;
  const comparable = priced.filter(r => r.status === 'comparable').sort((a, b) =>
    (a.landedTotalMinor < b.landedTotalMinor ? -1 : a.landedTotalMinor > b.landedTotalMinor ? 1 : 0) ||
    (a.leadTimeDays - b.leadTimeDays) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const incomplete = priced.filter(r => r.status === 'incomplete').sort((a, b) => (key(a) < key(b) ? -1 : 1));
  const excluded = priced.filter(r => r.status === 'excluded').sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return {item: req.item, quantity: Number(req.quantity), currency: req.currency, comparable, incomplete, excluded,
    // CC-S-08: ranking never uses a promotion flag; a promoted supplier is only labelled.
    rankingNote: 'Ordered by total landed cost, then lead time. Promotion never affects order.',
    cheapest: comparable.length >= 2 ? comparable[0].supplierName : null,
    savings: comparable.length ? savingsAgainst(comparable[0], baseline, req, now) : {claimed: false, reason: 'No complete comparable quote.'}};
}

/** Savings are claimed only against a documented baseline: same currency, same item, a complete past landed cost, not older than 365 days. */
export function savingsAgainst(best, baseline, req, now = Date.now()) {
  const no = reason => ({claimed: false, reason});
  if (!baseline) return no('No baseline recorded, so no saving is claimed.');
  if (baseline.currency !== req.currency) return no('The baseline is in a different currency.');
  if (String(baseline.item ?? '').trim().toLowerCase() !== req.item.toLowerCase()) return no('The baseline is for a different item.');
  if (baseline.complete !== true) return no('The baseline does not include all costs (shipping, tax), so it is not comparable.');
  const at = Date.parse(baseline.paidAt);
  if (!Number.isFinite(at) || at > now) return no('The baseline date is invalid.');
  if (now - at > 365 * 86_400_000) return no('The baseline is more than a year old.');
  let perUnit, bestUnit;
  try { perUnit = big(baseline.landedPerUnitMillis, 'Baseline', {min: 1n}); } catch { return no('The baseline price is invalid.'); }
  bestUnit = BigInt(best.perUnitMillis);
  if (bestUnit >= perUnit) return {claimed: false, reason: 'The best quote is not cheaper than the baseline.', savedPerUnitMillis: '0', savedBps: 0};
  return {claimed: true, savedPerUnitMillis: (perUnit - bestUnit).toString(), savedBps: Number(((perUnit - bestUnit) * 10_000n) / perUnit),
    note: 'Compared with the documented baseline landed cost. Estimates, not a guarantee.'};
}
