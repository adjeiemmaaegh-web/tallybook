/** Value Added Tax Act, 2025 (Act 1151), effective 1 January 2026.
 * GRA standard supply: VAT 15%, NHIL 2.5%, GETFund 2.5% on one base.
 * Zero-rated/exempt supplies carry none of these three charges.
 * This calculator does not issue or certify GRA e-VAT invoices, file returns,
 * determine a product's legal classification or validate registration.
 */
export const GHANA_VAT_VERSION = "act-1151-2026";
export const GHANA_STANDARD_RATES_BPS = Object.freeze({ vat: 1500, nhil: 250, getFund: 250 });
const safe = value => Number.isSafeInteger(value) && value >= 0;
const toNumber = value => {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Ghana VAT amount exceeds safe currency precision.");
  return Number(value);
};
const round = (value, denominator) => (value * 2n + denominator) / (2n * denominator);
const valid = value => {
  if (!safe(value)) throw new Error("Ghana VAT requires non-negative safe integer minor amounts.");
  return BigInt(value);
};
const treatments = new Set(["standard", "zero-rated", "exempt"]);

export function calculateGhanaVat(lines, discountMinor, priceMode) {
  if (!Array.isArray(lines) || !lines.length || lines.length > 256)
    throw new Error("Ghana VAT requires one or more classified product lines.");
  if (!["inclusive", "exclusive"].includes(priceMode)) throw new Error("Choose a Ghana tax-inclusive or tax-exclusive price mode.");
  const discount = valid(discountMinor);
  const gross = lines.map(line => {
    if (!treatments.has(line?.treatment)) throw new Error("Classify every product as standard, zero-rated or exempt before Ghana VAT checkout.");
    return valid(line.amountMinor);
  });
  const subtotal = gross.reduce((sum, value) => sum + value, 0n);
  toNumber(subtotal);
  if (discount > subtotal) throw new Error("Ghana VAT discount exceeds the sale subtotal.");
  const allocated = gross.map(value => subtotal === 0n ? { floor: 0n, remainder: 0n } : {
    floor: value * discount / subtotal, remainder: value * discount % subtotal
  });
  let remaining = discount - allocated.reduce((sum, item) => sum + item.floor, 0n);
  const priority = allocated.map((item, index) => ({ index, remainder: item.remainder }))
    .sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1);
  for (const {index} of priority) {
    if (!remaining) break;
    allocated[index].floor += 1n;
    remaining -= 1n;
  }
  if (remaining) throw new Error("Ghana VAT discount allocation failed.");
  const groups = { standard: 0n, "zero-rated": 0n, exempt: 0n };
  lines.forEach((line, i) => {
    const net = gross[i] - allocated[i].floor;
    if (net < 0n) throw new Error("Ghana VAT discount allocation exceeded a product amount.");
    groups[line.treatment] += net;
  });
  const taxableGross = groups.standard;
  let vat, nhil, getFund, taxableBase;
  if (priceMode === "exclusive") {
    taxableBase = taxableGross;
    vat = round(taxableBase * 1500n, 10000n);
    nhil = round(taxableBase * 250n, 10000n);
    getFund = round(taxableBase * 250n, 10000n);
  } else {
    // The total already contains the three levies. Allocate any unavoidable
    // final minor-unit rounding residue by largest remainder (15:2.5:2.5).
    taxableBase = round(taxableGross * 10000n, 12000n);
    const wholeTax = taxableGross - taxableBase;
    const weights = [6n, 1n, 1n];
    const portions = weights.map(weight => ({floor: wholeTax * weight / 8n, remainder: wholeTax * weight % 8n}));
    let cents = wholeTax - portions.reduce((sum, part) => sum + part.floor, 0n);
    const order = [0,1,2].sort((a,b) => portions[a].remainder === portions[b].remainder ? a-b : portions[a].remainder > portions[b].remainder ? -1 : 1);
    for (const index of order) { if (!cents) break; portions[index].floor += 1n; cents -= 1n; }
    [vat,nhil,getFund] = portions.map(item=>item.floor);
  }
  const net = subtotal - discount;
  const tax = vat + nhil + getFund;
  const total = priceMode === "inclusive" ? net : net + tax;
  return {
    version: GHANA_VAT_VERSION, eVatStatus: "not-certified",
    standardMinor: toNumber(groups.standard), zeroRatedMinor: toNumber(groups["zero-rated"]), exemptMinor: toNumber(groups.exempt),
    taxableBaseMinor: toNumber(taxableBase), vatMinor: toNumber(vat), nhilMinor: toNumber(nhil), getFundMinor: toNumber(getFund),
    taxMinor: toNumber(tax), totalMinor: toNumber(total), taxableMinor: toNumber(total - tax)
  };
}

export function validateGhanaVatEvidence(sale) {
  const policy = sale?.tax?.policy, details = sale?.tax?.ghana;
  if (!policy || policy.scheme !== "ghana-vat-2026" || !policy.enabled ||
      policy.registrationStatus !== "registered" ||
      typeof policy.registrationNumber !== "string" || !policy.registrationNumber.trim() ||
      policy.rateBasisPoints !== 2000 || !["inclusive","exclusive"].includes(policy.priceMode))
    throw new Error("Ghana VAT policy or registered taxpayer evidence is invalid.");
  if (!details || details.version !== GHANA_VAT_VERSION || details.eVatStatus !== "not-certified" ||
      !safe(sale.subtotalMinor) || !safe(sale.discountMinor) || sale.discountMinor > sale.subtotalMinor)
    throw new Error("Ghana VAT invoice evidence is missing or invalid.");
  const groups = ["standardMinor","zeroRatedMinor","exemptMinor"];
  if (!groups.every(key => safe(details[key])) ||
      BigInt(details.standardMinor) + BigInt(details.zeroRatedMinor) + BigInt(details.exemptMinor) !== BigInt(sale.subtotalMinor - sale.discountMinor))
    throw new Error("Ghana VAT classified amounts do not reconcile to the discounted sale.");
  const expected = calculateGhanaVat([
    { amountMinor: details.standardMinor, treatment: "standard" },
    { amountMinor: details.zeroRatedMinor, treatment: "zero-rated" },
    { amountMinor: details.exemptMinor, treatment: "exempt" }
  ], 0, policy.priceMode);
  for (const field of ["standardMinor","zeroRatedMinor","exemptMinor","taxableBaseMinor","vatMinor","nhilMinor","getFundMinor","taxMinor","totalMinor","taxableMinor"]) {
    if (expected[field] !== details[field]) throw new Error("Ghana VAT component " + field + " does not reconcile.");
  }
  if (sale.tax.taxMinor !== expected.taxMinor || sale.tax.totalMinor !== expected.totalMinor ||
      sale.tax.taxableMinor !== expected.taxableMinor || sale.totalMinor !== expected.totalMinor)
    throw new Error("Ghana VAT saved receipt totals do not reconcile.");
  return true;
}
