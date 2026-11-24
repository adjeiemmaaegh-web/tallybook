/**
 * Independent, read-only audit of loyalty points moved by returns (ST22-02). It recomputes, from the saved sale, its earned-points entry and
 * the return journal alone, what each return MUST have taken back, and checks the customer-benefit ledger holds exactly that:
 * one `return-points-<returnId>` entry per return that reversed anything, no other `return-points-*` entry, never more than the sale earned.
 */
const raise = message => { throw new Error(`Loyalty return ${message}; reconcile the customer rewards ledger before reporting.`); };
const id = v => typeof v === 'string' && v.trim().length > 0;

export function reconcileLoyaltyReturns({ sales, benefits, returns }) {
  if (![sales, benefits, returns].every(Array.isArray)) raise('evidence is incomplete');
  const saleById = new Map();
  for (const s of sales) { if (!id(s?.id) || saleById.has(s.id)) raise('contains duplicate sale identities'); saleById.set(s.id, s); }
  const earnedBySale = new Map();
  const returnPoints = new Map();
  const restoredByReturn = new Map();
  for (const b of benefits) {
    if (b?.kind !== 'points' || !id(b.submissionKey)) continue;
    if (b.submissionKey.startsWith('sale-points-')) {
      const saleId = b.submissionKey.slice('sale-points-'.length);
      if (earnedBySale.has(saleId) || !Number.isSafeInteger(b.delta) || b.delta <= 0) raise('has duplicate or invalid earned-points evidence');
      earnedBySale.set(saleId, b);
    } else if (b.submissionKey.startsWith('return-redeemed-')) {
      const rid = b.submissionKey.slice('return-redeemed-'.length);
      if (restoredByReturn.has(rid)) raise('has duplicate spent-points entries for one return');
      restoredByReturn.set(rid, b);
    } else if (b.submissionKey.startsWith('return-points-')) {
      const rid = b.submissionKey.slice('return-points-'.length);
      if (returnPoints.has(rid)) raise('has duplicate points entries for one return');
      returnPoints.set(rid, b);
    }
  }
  const bySale = new Map();
  for (const r of returns) { if (!id(r?.id) || !id(r.originalSaleId)) raise('contains an invalid return'); (bySale.get(r.originalSaleId) ?? bySale.set(r.originalSaleId, []).get(r.originalSaleId)).push(r); }
  const seenReturnIds = new Set();
  let checked = 0;
  for (const [saleId, rows] of bySale) {
    const sale = saleById.get(saleId);
    if (!sale) raise('refers to a missing sale');
    rows.sort((a, b) => (a.returnSequence ?? 0) - (b.returnSequence ?? 0));
    const earned = earnedBySale.get(saleId);
    let before = 0n, reversedTotal = 0;
    for (const r of rows) {
      seenReturnIds.add(r.id);
      const after = before + BigInt(r.refundedMinor);
      const entry = returnPoints.get(r.id);
      if (!earned) {
        if (r.loyalty !== undefined || entry) raise('has loyalty evidence for a sale that earned no points');
        before = after; continue;
      }
      const l = r.loyalty;
      if (!l) raise('is missing for a sale that earned points');
      if (r.customerId !== sale.customerId || earned.customerId !== sale.customerId || l.earnedPoints !== earned.delta) raise('does not match the points the sale earned');
      const paid = BigInt(sale.amountPaidMinor);
      if (paid === 0n || after > paid) raise('exceeds the amount paid');
      const due = l.policy === 'keep' ? 0n : (BigInt(l.earnedPoints) * after) / paid - (BigInt(l.earnedPoints) * before) / paid;
      if (BigInt(l.pointsReversed) + BigInt(l.pointsShortfall) !== due) raise('does not equal the points the returned value earned');
      if (l.pointsReversed > 0) {
        if (!entry || entry.delta !== -l.pointsReversed || entry.customerId !== r.customerId || entry.businessProfileId !== r.businessProfileId || entry.createdAt !== r.createdAt)
          raise('has a missing, altered or mismatched points deduction');
      } else if (entry) raise('has a points deduction the return did not record');
      reversedTotal += l.pointsReversed; checked++;
      before = after;
    }
    if (earned && reversedTotal > earned.delta) raise('reversed more points than the sale earned');
    // Spent points given back: one entry per return that restored anything, exactly the recorded amount, never more than was spent.
    let restoredTotal = 0;
    for (const r of rows) {
      const entry = restoredByReturn.get(r.id), n = r.redeemed?.pointsRestored ?? 0;
      if (n > 0) {
        if (!entry || entry.delta !== n || entry.customerId !== sale.customerId || entry.businessProfileId !== r.businessProfileId || entry.createdAt !== r.createdAt)
          raise('has a missing, altered or mismatched spent-points refund');
      } else if (entry) raise('has a spent-points refund the return did not record');
      restoredTotal += n;
    }
    if (restoredTotal > (sale.loyaltyRedeemedPoints ?? 0)) raise('gave back more spent points than the sale used');
  }
  for (const rid of returnPoints.keys()) if (!seenReturnIds.has(rid)) raise('has a points deduction with no matching return');
  for (const rid of restoredByReturn.keys()) if (!seenReturnIds.has(rid)) raise('has a spent-points refund with no matching return');
  return Object.freeze({ checked });
}
