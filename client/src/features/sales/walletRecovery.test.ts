import { describe, it, expect } from 'vitest';
import { recoverSavedCheckout } from './recoverSavedCheckout';
import type { SaleSnapshot, Sale } from './sales';

const sale: Sale = {
  id:'s1',businessProfileId:'biz',customerId:'c1',receiptNumber:'R-1',status:'completed',
  subtotalMinor:1000,discountMinor:100,totalMinor:900,amountPaidMinor:900,
  walletAppliedMinor:900,loyaltyRedeemedPoints:2,loyaltyRedeemedMinor:100,
  outstandingMinor:0,paymentMethod:'wallet',submissionKey:'wallet-key-123',createdAt:'2026-10-09T00:00:00.000Z',
};
const snapshot:SaleSnapshot = {sales:[sale],lines:[{id:'l1',saleId:'s1',businessProfileId:'biz',productId:'p1',productName:'Rice',quantity:1,unitPriceMinor:1000,lineTotalMinor:1000}],payments:[],receipts:[{id:'r1',saleId:'s1',businessProfileId:'biz',receiptNumber:'R-1',issuedAt:'2026-10-09T00:00:00.000Z'}]};
describe('prepaid wallet receipt recovery',()=>{
  it('recognizes wallet settlement with zero new cash payments',()=>{
    expect(recoverSavedCheckout(snapshot,'biz','wallet-key-123')?.sale.id).toBe('s1');
  });
  it('rejects wallet records whose settlement exceeds the saved amount',()=>{
    expect(()=>recoverSavedCheckout({...snapshot,sales:[{...sale,walletAppliedMinor:901}]},'biz','wallet-key-123')).toThrow(/payment does not reconcile|invalid wallet settlement/);
  });
  it('rejects cash transactions without a matching payment record',()=>{
    expect(()=>recoverSavedCheckout({...snapshot,sales:[{...sale,paymentMethod:'cash',walletAppliedMinor:undefined}]},'biz','wallet-key-123')).toThrow(/payment does not reconcile/);
  });
});
