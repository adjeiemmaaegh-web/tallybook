import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileSupplierPayable} from '../client/src/features/purchases/supplierPayables.mjs';

const invoice = {
  id:'invoice', businessProfileId:'shop', supplierId:'supplier', currency:'GHS',
  totalCostMinor:2500, createdAt:'2026-10-15T09:00:00.000Z',
};
const recognition = {
  id:'r', purchaseId:invoice.id, businessProfileId:invoice.businessProfileId, supplierId:invoice.supplierId,
  currency:'GHS', kind:'recognition', amountMinor:2500, submissionKey:'recognition-1', createdAt:invoice.createdAt,
};
const payment = {...recognition, id:'p', kind:'payment', method:'cash', amountMinor:900, submissionKey:'payment-1'};

test('supplier balances accept optional attribution and refuse malformed recorded identifiers', () => {
  for (const fields of [{}, {staffId:'staff-1'}, {staffId:'staff-1', shiftId:'shift-1'}]) {
    assert.equal(reconcileSupplierPayable(invoice,[recognition,{...payment,...fields}]).outstandingMinor,1600);
  }
  for (const key of ['staffId','shiftId']) {
    for (const value of ['', '   ', null, 24, 'x'.repeat(101)]) {
      assert.throws(() => reconcileSupplierPayable(invoice,[recognition,{...payment,[key]:value}]), /malformed/);
    }
  }
});

test('legacy unrecognized invoices keep unknown liability and valid offset timestamps preserve balances', () => {
  assert.equal(reconcileSupplierPayable({...invoice,currency:undefined},[]).outstandingMinor,null);
  assert.equal(reconcileSupplierPayable(invoice,[recognition,{...payment,createdAt:'2026-10-15T10:00:00+01:00'}]).outstandingMinor,1600);
  assert.throws(() => reconcileSupplierPayable(invoice,[recognition,{...payment,createdAt:'2026-02-30T10:00:00.000Z'}]),/malformed/);
});
