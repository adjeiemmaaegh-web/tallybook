import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantService} from '../run5TenantService.mjs';
const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner='11111111-1111-4111-8111-111111111111';
const attendee='22222222-2222-4222-8222-222222222222';
const sid='33333333-3333-4333-8333-333333333333';
const row='44444444-4444-4444-8444-444444444444';
function fixture(features={}){
 let live=true,hasMember=true,now=1000,wrongRows=false,auditFailure=false,scopeCount=0;
 let user=owner;const events=[];
 const tx={
  assertActiveSession:async()=>live,
  getCompany:async c=>({id:c,ownerId:c===company?owner:attendee}),
  getMembership:async(c,u)=>hasMember&&c===company?{companyId:c,userId:u,role:u===owner?'owner':'attendant',status:'active'}:null,
  activateTenantScope:async()=>{scopeCount++;return true;},
  readRecords:async({companyId,domain})=>[{companyId:wrongRows?other:companyId,
    domain,recordId:row,data:{companyId:wrongRows?other:companyId},revision:1}],
  countRecords:async()=>2,
  upsertMetadata:async({companyId,domain,recordId,expectedRevision})=>({
   companyId,domain,recordId,revision:expectedRevision+1}),
  insertImportedMetadata:async()=>{},
  appendAudit:async event=>{if(auditFailure)throw Error('audit unavailable');events.push(event);}
 };
 const service=createRun5TenantService({
  resolveSession:async()=>({userId:user,sessionId:sid,active:true,expiresAtEpochMs:200000}),
  store:{transaction:async task=>task(tx)},clock:()=>now,features
 });
 return {service,tx,events,setUser:u=>user=u,setLive:x=>live=x,
  revoke:()=>hasMember=false,setNow:n=>now=n,wrongRows:()=>wrongRows=true,
  failAudit:()=>auditFailure=true,scopeCount:()=>scopeCount};
}
const args=f=>({session:'a'.repeat(32),companyId:company,domain:'catalog'});
test('server-verified owner may read catalog only after transaction scope',async()=>{
 const f=fixture(),result=await f.service.read(args(f));
 assert.equal(result.companyId,company);
 assert.equal(result.rows.length,1);
 assert.equal(f.scopeCount(),1);
 assert.equal(f.events[0].action,'read');
});
test('foreign tenant selector never becomes authorization',async()=>{
 const f=fixture();
 await assert.rejects(f.service.read({...args(f),companyId:other}),/Tenant access denied|Tenant operation denied/);
 assert.equal(f.events.length,0);
});
test('revoked live session and membership deny before query and audit',async()=>{
 const f=fixture();f.setLive(false);
 await assert.rejects(f.service.read(args(f)),/Tenant operation denied/);
 f.setLive(true);f.revoke();
 await assert.rejects(f.service.read(args(f)),/Tenant access denied/);
 assert.equal(f.events.length,0);
});
test('expired token denied at protected read transaction clock',async()=>{
 const f=fixture();f.setNow(200000);
 await assert.rejects(f.service.read(args(f)),/Tenant operation denied/);
});
test('attendant reads public catalog only, cannot read company finance',async()=>{
 const f=fixture();f.setUser(attendee);
 const data=await f.service.read(args(f));
 assert.equal(data.rows.length,1);
 await assert.rejects(f.service.read({...args(f),domain:'payments'}),/Tenant access denied/);
 await assert.rejects(f.service.report({...args(f),domain:'catalog'}),/Tenant access denied/);
});
test('server rejects foreign row response after SQL even when request is own tenant',async()=>{
 const f=fixture();f.wrongRows();
 await assert.rejects(f.service.read(args(f)),/Tenant access denied/);
 assert.equal(f.events.length,0);
});
test('only owner may save guarded catalog metadata, no generic sales writes',async()=>{
 const f=fixture();
 const receipt=await f.service.writeMetadata({...args(f),recordId:row,
  data:{companyId:company,label:'Test'},expectedRevision:0});
 assert.equal(receipt.revision,1);
 await assert.rejects(f.service.writeMetadata({...args(f),domain:'sales',recordId:row,
  data:{companyId:company},expectedRevision:0}),/Tenant operation denied/);
});
test('financial report and export only provide scoped counts/manifests',async()=>{
 const f=fixture();
 const result=await f.service.report({...args(f),domain:'payments'});
 assert.equal(result.provisional,true);assert.equal(result.recordCount,2);
 const exp=await f.service.exportManifest({...args(f),domain:'payments'});
 assert.equal(exp.containsBusinessData,false);
});
test('backup, import, assistant and sync remain off without explicit features',async()=>{
 const f=fixture();
 for(const task of [
  ()=>f.service.backup({...args(f),domain:'payments'}),
  ()=>f.service.assistantContext({...args(f),domain:'assistant'}),
  ()=>f.service.syncPreview({...args(f),domain:'catalog'}),
  ()=>f.service.importMetadata({...args(f),records:[{companyId:company,
    domain:'catalog',recordId:row,data:{companyId:company}}]})
 ])await assert.rejects(task(),/Tenant operation denied/);
});
test('audit failure stops a write success acknowledgement',async()=>{
 const f=fixture();f.failAudit();
 await assert.rejects(f.service.writeMetadata({...args(f),recordId:row,
   data:{companyId:company},expectedRevision:0}),/audit unavailable/);
});
