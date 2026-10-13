import { isValidFinancialPostingTimestamp } from "./financialPeriodConservation.mjs";

/** FIN-002: independent, read-only reconstruction of the saved prepaid-wallet
 * liability. Wallet transfers are external money movements; a wallet sale or
 * reversal changes the liability but is not another cash collection. No legacy
 * wallet credits or historical currencies are invented here.
 */
const id = v => typeof v === 'string' && v.trim().length > 0;
const minor = v => Number.isSafeInteger(v) && v >= 0;
const signed = v => Number.isSafeInteger(v) && v !== 0;
const validDate = isValidFinancialPostingTimestamp;
const currencyCode = v => typeof v === 'string' && /^[A-Z]{3}$/.test(v);
const raise = message => { throw new Error(`Prepaid wallet ${message}; reconcile the original ledger before reporting.`); };

/** Requires complete, single-company, full-history snapshots. */
export function reconcilePrepaidLiability({transfers, benefits, sales, reversals}, currency) {
  if (!currencyCode(currency)) raise('currency is unavailable');
  if (![transfers,benefits,sales,reversals].every(Array.isArray)) raise('evidence is incomplete');
  const company = new Set();
  for (const row of [...transfers,...benefits,...sales,...reversals]) {
    if (!id(row?.businessProfileId)) raise('contains missing company identity');
    company.add(row.businessProfileId);
  }
  if (company.size > 1) raise('contains cross-company records');
  const required = new Map();
  const saleIndex = new Map();
  const originalBenefits = new Map();
  const reversalIndex = new Map();
  const usedIds = new Set();
  const usedSubmissionKeys = new Set();
  const addExpected = (key, expected) => {
    if (required.has(key)) raise('contains duplicate source identities');
    required.set(key, expected);
  };
  for (const sale of sales) {
    if (!id(sale?.id) || saleIndex.has(sale.id)) raise('contains duplicate or invalid sale identities');
    saleIndex.set(sale.id,sale);
    const wallet = sale.walletAppliedMinor ?? 0;
    if (!minor(wallet)) raise('contains invalid saved sale wallet usage');
    if (!wallet) continue;
    if (!id(sale.customerId) || sale.paymentMethod !== 'wallet' ||
        !minor(sale.amountPaidMinor) || wallet !== sale.amountPaidMinor || !validDate(sale.createdAt) ||
        sale.currency !== currency) raise('has unverifiable wallet sale evidence');
    addExpected(`sale-wallet-${sale.id}`, {customerId:sale.customerId, companyId:sale.businessProfileId,
      delta:-wallet, createdAt:sale.createdAt, source:'sale'});
  }
  for (const transfer of transfers) {
    if (!id(transfer?.id) || usedIds.has(`transfer:${transfer.id}`) ||
        !id(transfer.submissionKey) || usedSubmissionKeys.has(transfer.submissionKey) ||
        !id(transfer.benefitEntryId) || !id(transfer.customerId) ||
        !['deposit','refund'].includes(transfer.kind) || !minor(transfer.amountMinor) ||
        transfer.amountMinor === 0 || !validDate(transfer.createdAt) || transfer.currency !== currency) {
      raise('has missing, duplicated, invalid or mismatched transfer evidence');
    }
    usedIds.add(`transfer:${transfer.id}`); usedSubmissionKeys.add(transfer.submissionKey);
    addExpected(`wallet-transfer-${transfer.id}`, {customerId:transfer.customerId,
      companyId:transfer.businessProfileId,delta:transfer.kind==='deposit'?transfer.amountMinor:-transfer.amountMinor,
      createdAt:transfer.createdAt,source:'transfer', benefitEntryId:transfer.benefitEntryId});
  }
  for (const reversal of reversals) {
    if (!id(reversal?.id) || reversalIndex.has(reversal.originalSaleId) || !id(reversal.originalSaleId) ||
        !validDate(reversal.createdAt)) raise('contains duplicate or invalid reversal identities');
    reversalIndex.set(reversal.originalSaleId,reversal);
    const sale=saleIndex.get(reversal.originalSaleId);
    if (!sale || sale.businessProfileId !== reversal.businessProfileId ||
        (sale.customerId ?? undefined) !== (reversal.customerId ?? undefined))
      raise('contains orphaned or foreign reversal');
    if (!(sale.walletAppliedMinor ?? 0)) continue;
    if (Date.parse(reversal.createdAt) < Date.parse(sale.createdAt)) raise('has reversal credit before original wallet sale');
    // The reversal benefit refers to the *original benefit ID*, not to sale ID.
    originalBenefits.set(`sale-wallet-${sale.id}`,reversal);
  }
  const walletRows = benefits.filter(b => b?.kind === 'wallet');
  const walletById=new Map();
  for (const row of walletRows) {
    if (!id(row.id) || walletById.has(row.id)) raise('contains duplicated wallet benefit IDs');
    walletById.set(row.id,row);
  }
  const seenKeys=new Set(), seenBenefitIds=new Set();
  const events=[];
  for (const entry of walletRows) {
    if (!id(entry.id) || !id(entry.submissionKey) || seenBenefitIds.has(entry.id) ||
        seenKeys.has(entry.submissionKey) || !id(entry.customerId) || !signed(entry.delta) || !validDate(entry.createdAt))
      raise('contains duplicated or malformed wallet benefit evidence');
    seenBenefitIds.add(entry.id); seenKeys.add(entry.submissionKey);
    let expected=required.get(entry.submissionKey);
    if (!expected && entry.submissionKey.startsWith('reversal-benefit-')) {
      // A reversal credits only the exact preceding debit for its saved sale.
      const originalId=entry.submissionKey.slice('reversal-benefit-'.length);
      const original=walletById.get(originalId);
      if (!original || !original.submissionKey.startsWith('sale-wallet-')) raise('contains orphaned wallet reversal credit');
      const reversal=originalBenefits.get(original.submissionKey);
      if (!reversal) raise('contains wallet credit without a saved reversal');
      expected={customerId:original.customerId,companyId:original.businessProfileId,
        delta:-original.delta,createdAt:reversal.createdAt,source:'reversal'};
      addExpected(entry.submissionKey,expected);
    }
    if (!expected || entry.customerId !== expected.customerId ||
        entry.businessProfileId !== expected.companyId || entry.delta !== expected.delta ||
        entry.createdAt !== expected.createdAt ||
        (expected.benefitEntryId && entry.id !== expected.benefitEntryId))
      raise('has unlinked or inconsistent wallet benefit entry');
    events.push(entry);
  }
  for (const [key, expected] of required) {
    if (!seenKeys.has(key)) raise(`is missing the ${expected.source} wallet movement`);
  }
  for (const [saleKey,reversal] of originalBenefits) {
    const original=walletRows.find(row => row.submissionKey === saleKey);
    if (!original || !seenKeys.has(`reversal-benefit-${original.id}`))
      raise(`is missing the reversal wallet credit for ${reversal.originalSaleId}`);
  }
  const byCustomer=new Map();
  // Multiple valid ISO strings may represent the exact same instant (Z vs
  // offset, or distinct fractional precision). Net all credits and debits at
  // that instant per customer; otherwise their array insertion order would
  // invent a negative intermediate balance or mask a later overdraft.
  const grouped=new Map();
  for (const entry of events) {
    const instant=Date.parse(entry.createdAt);
    const key=`${entry.customerId}\u0000${instant}`;
    grouped.set(key,(grouped.get(key)??0n)+BigInt(entry.delta));
  }
  const chronological=[...grouped].map(([key,amount])=>{
    const at=key.lastIndexOf('\u0000');
    return {customerId:key.slice(0,at),instant:Number(key.slice(at+1)),amount};
  }).sort((a,b)=>a.instant-b.instant||a.customerId.localeCompare(b.customerId));
  for (const event of chronological) {
    const next=(byCustomer.get(event.customerId)??0n)+event.amount;
    if (next<0n) raise('has a negative historical customer balance');
    if (next>BigInt(Number.MAX_SAFE_INTEGER)) raise('exceeds safe monetary precision');
    byCustomer.set(event.customerId,next);
  }
  let total=0n;
  for (const amount of byCustomer.values()) total+=amount;
  if (total>BigInt(Number.MAX_SAFE_INTEGER)) raise('total exceeds safe monetary precision');
  return {currency,liabilityMinor:Number(total),customerCount:[...byCustomer.values()].filter(n=>n>0n).length};
}
