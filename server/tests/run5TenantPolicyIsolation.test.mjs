import test from 'node:test';
import assert from 'node:assert/strict';
import {requireRun5Access,validateRun5Request,assertRun5ScopedRows,
  assertRun5ScopedPayload} from '../run5TenantPolicy.mjs';
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const sessionId='33333333-3333-4333-8333-333333333333';
const recordId='44444444-4444-4444-8444-444444444444';
function params(role='owner',action='read',domain='catalog'){
 const userId=role==='owner'?owner:attendant;
 return {principal:{userId,sessionId,active:true,expiresAtEpochMs:10000},
   company:{id:A,ownerId:owner},
   membership:{companyId:A,userId,role,status:'active'},
   request:{companyId:A,domain,action},now:1000};
}
test('owner can read own tenant catalog and approve metadata writes',()=>{
 assert.equal(requireRun5Access(params()).companyId,A);
 assert.equal(requireRun5Access(params('owner','write','catalog')).role,'owner');
});
test('attendant can read only operational catalog, stock and orders',()=>{
 for(const domain of ['catalog','inventory','orders'])
   assert.equal(requireRun5Access(params('attendant','read',domain)).role,'attendant');
 for(const domain of ['customers','sales','payments','wallet','assistant','audit'])
   assert.throws(()=>requireRun5Access(params('attendant','read',domain)));
});
test('attendant cannot write, import, export, run reports, backup or sync',()=>{
 for(const action of ['write','import','export','report','backup','assistant','sync'])
   assert.throws(()=>requireRun5Access(params('attendant',action,'catalog')));
});
test('generic financial ledger mutations are denied even to a cloud owner',()=>{
 for(const domain of ['sales','payments','purchases','inventory','wallet','expenses'])
   assert.throws(()=>requireRun5Access(params('owner','write',domain)));
});
test('foreign company and mismatched membership cannot authorize',()=>{
 const mismatch=params();mismatch.request.companyId=B;
 assert.throws(()=>requireRun5Access(mismatch));
 const unrelated=params();unrelated.membership.companyId=B;
 assert.throws(()=>requireRun5Access(unrelated));
});
test('expired, revoked or mismatched owner fails closed',()=>{
 const expired=params();expired.principal.expiresAtEpochMs=1000;
 assert.throws(()=>requireRun5Access(expired));
 const revoked=params();revoked.membership.status='revoked';
 assert.throws(()=>requireRun5Access(revoked));
 const changed=params();changed.company.ownerId=attendant;
 assert.throws(()=>requireRun5Access(changed));
});
test('unknown resources, actions and legacy local IDs are not cloud grants',()=>{
 assert.throws(()=>validateRun5Request({companyId:'primary',domain:'sales',action:'read'}));
 assert.throws(()=>validateRun5Request({companyId:A,domain:'unknown',action:'read'}));
 assert.throws(()=>validateRun5Request({companyId:A,domain:'sales',action:'truncate'}));
});
test('return arrays reject foreign company IDs and foreign domain',()=>{
 assert.throws(()=>assertRun5ScopedRows([{companyId:B,domain:'catalog',data:{companyId:B}}],A));
 assert.throws(()=>assertRun5ScopedRows([{companyId:A,domain:'sales',data:{companyId:A}}],A,{domain:'catalog'}));
});
test('nested foreign-company payload and cyclic records cannot cross tenant boundary',()=>{
 assert.throws(()=>assertRun5ScopedRows([{companyId:A,domain:'catalog',data:{
   companyId:A,children:[{businessProfileId:B}]
 }}],A));
 const cyclic={companyId:A};cyclic.me=cyclic;
 assert.throws(()=>assertRun5ScopedPayload({companyId:A,domain:'catalog',recordId,data:cyclic},A));
});
test('matching tenant payload validates without rewriting customer data',()=>{
 const input={companyId:A,domain:'catalog',recordId,data:{
   companyId:A,title:'Item',extra:[{tenantId:A}]
 }};
 assert.equal(assertRun5ScopedPayload(input,A),input);
});
