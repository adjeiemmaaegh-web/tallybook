/**
 * Refund allocation and loyalty reversal for returns (ST22-02). PURE and deterministic: no money is posted here.
 * Defaults (owner-confirmed): refund goes back through the ORIGINAL payment methods, and the loyalty points the returned
 * value earned are reversed. Each business may choose a different allocation order or keep points.
 */
export const REFUND_ALLOCATIONS = Object.freeze(['proportional', 'reverse-order']);
export const LOYALTY_ON_RETURN = Object.freeze(['reverse', 'keep']);
export const DEFAULT_REFUND_ALLOCATION = 'proportional';
export const DEFAULT_LOYALTY_ON_RETURN = 'reverse';

const MAX = BigInt(Number.MAX_SAFE_INTEGER);
const whole = (v, label, min = 0) => {
  if (!Number.isSafeInteger(v) || v < min) throw new Error(`Invalid ${label} in return allocation.`);
  return BigInt(v);
};
const out = (v) => { if (v < 0n || v > MAX) throw new Error('Return amount exceeds safe money precision.'); return Number(v); };

/** Normalise optional policy fields from a company policy revision (older revisions simply lack them). */
export function returnPolicyChoices(policy) {
  const refundAllocation = policy?.refundAllocation ?? DEFAULT_REFUND_ALLOCATION;
  const loyaltyOnReturn = policy?.loyaltyOnReturn ?? DEFAULT_LOYALTY_ON_RETURN;
  if (!REFUND_ALLOCATIONS.includes(refundAllocation) || !LOYALTY_ON_RETURN.includes(loyaltyOnReturn))
    throw new Error('Company return policy has an unsupported refund allocation or loyalty choice.');
  return Object.freeze({ refundAllocation, loyaltyOnReturn });
}

/**
 * Split `valueMinor` across the sale's original tenders.
 * `legs` are in ORIGINAL TENDER ORDER: [{method, capacityMinor}] where capacity = amount paid with that method minus what was already
 * refunded to it. The result never exceeds a leg's capacity and always sums to exactly `valueMinor` (or throws).
 *  - proportional: weights are the remaining capacities; largest remainder, ties broken by original order.
 *  - reverse-order: the LAST tender used is refunded first, then the one before it, and so on.
 */
export function allocateReturnToTenders({ valueMinor, legs, policy = DEFAULT_REFUND_ALLOCATION }) {
  if (!REFUND_ALLOCATIONS.includes(policy)) throw new Error('Unsupported refund allocation policy.');
  const value = whole(valueMinor, 'return value', 1);
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 3) throw new Error('A return needs one to three original tenders.');
  const seen = new Set();
  const caps = legs.map(l => {
    if (!l || typeof l.method !== 'string' || !l.method || seen.has(l.method)) throw new Error('Original tenders must be distinct.');
    seen.add(l.method);
    return whole(l.capacityMinor, 'tender capacity');
  });
  const total = caps.reduce((a, b) => a + b, 0n);
  if (value > total) throw new Error('The return is larger than what is left to refund on the original tenders.');
  const share = caps.map(() => 0n);
  if (policy === 'reverse-order') {
    let left = value;
    for (let i = legs.length - 1; i >= 0 && left > 0n; i--) { const take = left < caps[i] ? left : caps[i]; share[i] = take; left -= take; }
  } else {
    let given = 0n;
    const rem = [];
    caps.forEach((cap, i) => { const q = (value * cap) / total; share[i] = q; given += q; rem.push({ i, r: (value * cap) % total }); });
    rem.sort((a, b) => (a.r === b.r ? a.i - b.i : (a.r > b.r ? -1 : 1)));
    let extra = value - given;
    for (const { i } of rem) { if (extra === 0n) break; if (share[i] < caps[i]) { share[i] += 1n; extra -= 1n; } }
    if (extra !== 0n) throw new Error('Return could not be allocated exactly; reconcile with the owner.');
  }
  return legs.map((l, i) => ({ method: l.method, amountMinor: out(share[i]) })).filter(l => l.amountMinor > 0);
}

/**
 * Points to take back for a return. `earnedPoints` is what the ORIGINAL sale actually earned (the saved ledger entry, so a later change of
 * the customer's earning rate cannot distort it). Reversal is proportional to the share of the PAID money that has been refunded, cumulative
 * and exact: refunding all paid money reverses all earned points, and repeated small returns can never reverse more in total. Points the
 * customer has already spent are never driven negative: the unrecoverable part is recorded as a shortfall.
 */
export function pointsToReverse({ earnedPoints, paidMinor, refundedBeforeMinor, refundedAfterMinor, balancePoints, policy = DEFAULT_LOYALTY_ON_RETURN }) {
  if (!LOYALTY_ON_RETURN.includes(policy)) throw new Error('Unsupported loyalty-on-return policy.');
  const earned = whole(earnedPoints, 'earned points');
  const paid = whole(paidMinor, 'paid amount');
  const before = whole(refundedBeforeMinor, 'prior refunds');
  const after = whole(refundedAfterMinor, 'cumulative refunds');
  const balance = whole(balancePoints, 'points balance');
  if (after < before || after > paid) throw new Error('Cumulative refunds must not exceed what was paid.');
  if (policy === 'keep' || earned === 0n || paid === 0n) return { reverse: 0, shortfall: 0, due: 0 };
  // Cumulative deduction = floor(earned x refunded / paid): rounds in the CUSTOMER's favour (no point is taken early for a sliver of a
  // refund), is monotone, and reaches exactly `earned` when all paid money has been refunded.
  const due = (earned * after) / paid - (earned * before) / paid;
  const reverse = due < balance ? due : balance;
  return { reverse: out(reverse), shortfall: out(due - reverse), due: out(due) };
}
