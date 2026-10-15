import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRun5Request,requireRun5Access,assertRun5ScopedRows,
  assertRun5ScopedPayload} from '../run5TenantPolicy.mjs';
const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const foreign='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user='11111111-1111-4111-8111-111111111111';
const session='22222222-2222-4222-8222-222222222222';
const now=1000;
const principal={userId:user,sessionId:session,active:true,expiresAtEpochMs:5000};
const business={id:company,ownerId:user};
const member={companyId:company,userId:user,role:'owner',status:'active'};
const req={companyId:company,domain:'catalog',action:'write',recordId:session};
test('canonical owner and attendee policy requires server-backed exact membership',()=>{
 const grant=requireRun5Access({principal,company:business,membership:member,request:req,now});
 assert.equal(grant.companyId,company);assert.equal(grant.role,'owner');
});
test('foreign company and malicious role claims are rejected',()=>{
 for(const values of [
   {request:{...req,companyId:foreign}},
   {membership:{...member,companyId:foreign}},
   {membership:{...member,role:'admin'}},
   {principal:{...principal,userId:foreign}},
   {company:{...business,ownerId:foreign}}
 ])assert.throws(()=>requireRun5Access({principal,company:business,membership:member,
     request:req,now,...values}),/denied/);
});
test('revoked session and expired token are denied',()=>{
 for(const values of [{principal:{...principal,active:false}},
   {principal:{...principal,expiresAtEpochMs:now}}])
   assert.throws(()=>requireRun5Access({principal,company:business,membership:member,
     request:req,now,...values}),/denied/);
});
test('attendant can read catalog but never backups, finance, or mutation',()=>{
 const other={...member,role:'attendant'},companyRow={...business,ownerId:foreign};
 const read=requireRun5Access({principal,company:companyRow,membership:other,
   request:{companyId:company,domain:'catalog',action:'read'},now});
 assert.equal(read.role,'attendant');
 for(const change of [
   {domain:'payments',action:'read'},{domain:'catalog',action:'write'},
   {domain:'inventory',action:'export'},{domain:'catalog',action:'import'}
 ])assert.throws(()=>requireRun5Access({principal,company:companyRow,
   membership:other,request:{companyId:company,...change},now}),/denied/);
});
test('no generic cloud financial mutation, even by owner',()=>{
 for(const domain of ['payments','sales','wallet','inventory','expenses','receivables'])
 assert.throws(()=>requireRun5Access({principal,company:business,membership:member,
   request:{companyId:company,domain,action:'write'},now}),/denied/);
});
test('payload rejects nested foreign tenancy, fractional money, malformed keys',()=>{
 for(const data of [
   {companyId:foreign},
   {companyId:company,deeper:{businessProfileId:foreign}},
   {companyId:company,amountMinor:3.5},
   {companyId:company,unsafe:Infinity}
 ])assert.throws(()=>assertRun5ScopedPayload({
   companyId:company,domain:'assistant',recordId:session,data},company),/denied/);
});
test('foreign or mismatched-domain returned row is never released',()=>{
 const ok=[{companyId:company,domain:'catalog',recordId:session,data:{companyId:company}}];
 assert.equal(assertRun5ScopedRows(ok,company,{domain:'catalog'}).length,1);
 for(const rows of [
   [{...ok[0],companyId:foreign}],
   [{...ok[0],data:{businessProfileId:foreign}}],
   [{...ok[0],domain:'sales'}]
 ])assert.throws(()=>assertRun5ScopedRows(rows,company,{domain:'catalog'}),/denied/);
});
test('unknown or malformed cloud domain/record/action never authorizes',()=>{
 for(const values of [
  {companyId:'primary',domain:'catalog',action:'read'},
  {companyId:company,domain:'rawSQL',action:'read'},
  {companyId:company,domain:'catalog',action:'drop'},
  {companyId:company,domain:'catalog',action:'read',recordId:'../secret'}
 ])assert.throws(()=>validateRun5Request(values),/denied/);
});
