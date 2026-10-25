import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCheckoutAttribution, normalizeMobileReference, assertUnusedMobileReference } from '../client/src/features/sales/requireStaff.mjs';
import { validateNoSaleRequest, sameNoSaleRequest } from '../client/src/features/drawer/noSaleEvent.mjs';
const actor={id:'staff-A',businessProfileId:'company-A'};
const shift={id:'shift-A',staffId:'staff-A',businessProfileId:'company-A',openedAt:'2026-10-24T08:00:00Z'};
test('refuses missing staff or missing shift',()=>{
 assert.throws(()=>assertCheckoutAttribution(null,shift,'company-A','staff-A'));
 assert.throws(()=>assertCheckoutAttribution(actor,null,'company-A','staff-A'));
 assert.throws(()=>assertCheckoutAttribution(actor,shift,'company-A',null));
});
test('accepts exact company, actor, shift',()=>{
 assert.deepEqual(assertCheckoutAttribution(actor,shift,'company-A','staff-A'),{staffId:'staff-A',shiftId:'shift-A'});
});
test('rejects closed, foreign or stale shifts',()=>{
 assert.throws(()=>assertCheckoutAttribution(actor,{...shift,closedAt:'2026-10-24T09:00:00Z'},'company-A','staff-A'));
 assert.throws(()=>assertCheckoutAttribution(actor,{...shift,businessProfileId:'company-B'},'company-A','staff-A'));
});
test('mobile requires usable provider and reference',()=>{
 assert.throws(()=>normalizeMobileReference('mobile','provider',''));
 assert.throws(()=>normalizeMobileReference('mobile',undefined,'ABC1'));
 assert.equal(normalizeMobileReference('mobile','provider',' AbC123 '),'AbC123');
 assert.throws(()=>normalizeMobileReference('cash','provider','ABC1'));
});
test('duplicate MoMo scoped to provider and company, case folded',()=>{
 const p=[{businessProfileId:'company-A',saleId:'s1',method:'mobile',mobileMoneyProviderId:'P1',mobileMoneyReference:'  abC123 '}];
 assert.throws(()=>assertUnusedMobileReference(p,'company-A','P1','ABC123'));
 assert.doesNotThrow(()=>assertUnusedMobileReference(p,'company-B','P1','ABC123'));
 assert.doesNotThrow(()=>assertUnusedMobileReference(p,'company-A','P2','ABC123'));
});
test('no-sale requires attributed evidence, valid reason and operation key',()=>{
 const request={operationKey:'nosale:123456789',reason:'cash_check',note:'verified',staffId:'S',shiftId:'H',storeId:'T',deviceId:'D'};
 assert.equal(validateNoSaleRequest(request).reason,'cash_check');
 assert.throws(()=>validateNoSaleRequest({...request,shiftId:''}));
 assert.throws(()=>validateNoSaleRequest({...request,reason:'secret'}));
 assert.throws(()=>validateNoSaleRequest({...request,operationKey:'bad'}));
 assert.ok(sameNoSaleRequest({...request,businessProfileId:'C'},{...request,businessProfileId:'C'}));
 assert.equal(sameNoSaleRequest({...request,businessProfileId:'C'},{...request,businessProfileId:'C',storeId:'X'}),false);
});
test('outbox receipt must attest exact operation, digest, company and device',async()=>{
 const {verifyCentralReceipt,assertUploadPayload}=await import('../client/src/features/sync/supabaseUploader.mjs');
 const e={businessProfileId:'C',operationId:'op-1',deviceId:'D',payloadDigest:'a'.repeat(64),status:'pending'};
 const r={businessId:'C',operationId:'op-1',deviceId:'D',payloadDigest:'a'.repeat(64),status:'accepted',receivedAtUtc:'2026-10-24T12:00:00Z'};
 assert.equal(assertUploadPayload(e,'a'.repeat(64)),'op-1');
 assert.equal(verifyCentralReceipt(e,r),r.receivedAtUtc);
 assert.throws(()=>assertUploadPayload(e,'b'.repeat(64)));
 assert.throws(()=>verifyCentralReceipt(e,{...r,deviceId:'fake'}));
 assert.throws(()=>verifyCentralReceipt(e,{...r,status:'rejected'}));
});
