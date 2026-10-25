import { test } from 'node:test';
import assert from 'node:assert/strict';

export function auditSaleAmounts(sale: {totalMinor:number; paidMinor:number; outstandingMinor:number}) {
  const nums = [sale.totalMinor,sale.paidMinor,sale.outstandingMinor];
  if (!nums.every(n => Number.isSafeInteger(n) && n >= 0)) throw new Error('Invalid minor units');
  if (sale.paidMinor > sale.totalMinor || sale.totalMinor - sale.paidMinor !== sale.outstandingMinor) throw new Error('Sale imbalance');
  return true;
}
export function auditRefundClaim(refund: {amountMinor:number; confirmed:boolean; reference?:string}) {
  if (!Number.isSafeInteger(refund.amountMinor) || refund.amountMinor <= 0) throw new Error('Invalid refund');
  if (refund.confirmed && !refund.reference?.trim()) throw new Error('Missing disbursement evidence');
  return refund.confirmed ? 'evidenced' : 'unsettled';
}

test('balanced invoice passes', () => assert.equal(auditSaleAmounts({totalMinor:50000,paidMinor:30000,outstandingMinor:20000}),true));
test('invoice imbalance fails', () => assert.throws(() => auditSaleAmounts({totalMinor:50000,paidMinor:30000,outstandingMinor:10000}),/imbalance/));
test('unsafe minor units fail', () => assert.throws(() => auditSaleAmounts({totalMinor:Number.MAX_SAFE_INTEGER+1,paidMinor:0,outstandingMinor:0}),/minor/));
test('refund cannot claim disbursed without evidence', () => assert.throws(() => auditRefundClaim({amountMinor:100,confirmed:true}),/evidence/));
test('unsettled refund is not treated as paid', () => assert.equal(auditRefundClaim({amountMinor:100,confirmed:false}),'unsettled'));
