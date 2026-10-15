import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantDataService} from '../run5TenantDataService.mjs';
const ID={
 A:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 B:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 ownerA:'11111111-1111-4111-8111-111111111111',
 ownerB:'22222222-2222-4222-8222-222222222222',
 staffA:'33333333-3333-4333-8333-333333333333',
 stranger:'44444444-4444-4444-8444-444444444444',
 session:'55555555-5555-4555-8555-555555555555'
};
const TOKENS={
 ['ownerA']: 'ownerA'+'x'.repeat(30),
 ['ownerB']: 'ownerB'+'x'.repeat(30),
 ['staffA']: 'staffA'+'x'.repeat(30),
 ['stranger']: 'stranger'+'x'.repeat(30)
};
const actorId=new Map(Object.entries(TOKENS).map(([name,token])=>[token,ID[name]]));
function fixture(){
 let now=1000,sessionActive=true,failAudit=false,scopeCount=0;
 const owner=new Map([[ID.A,ID.ownerA],[ID.B,ID.ownerB]]);
 const members=new Map([[ID.A+ID.ownerA,'owner'],[ID.B+ID.ownerB,'owner'],
   [ID.A+ID.staffA,'attendant']]);
 const rows=new Map(),audits=[];
 const store={async transaction(fn){
   const changes=new Map([...rows].map(([k,v])=>[k,structuredClone(v)]));
   const events=[];
   let scope=null;
   const key=(c,k,id)=>[c,k,id].join('|');
   const tx={
     assertActiveSession:async()=>sessionActive,
     getCompany:async c=>owner.has(c)?{id:c,ownerId:owner.get(c)}:null,
     getMembership:async(c,u)=>members.has(c+u)?{
       companyId:c,userId:u,role:members.get(c+u),status:'active'}:null,
     activateTenantScope:async(u,c)=>{scope={u,c};scopeCount++;return true;},
     getRow:async(c,k,id)=>{if(scope?.c!==c)throw Error('unsafe scope');
       return changes.get(key(c,k,id))??null;},
     listRows:async(c,k,limit,after)=>{if(scope?.c!==c)throw Error('unsafe scope');
       return [...changes.values()].filter(r=>r.companyId===c&&r.collection===k&&
         (after===null||r.id>after)).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);},
     putRow:async({companyId,collection,id,payload,expectedRevision})=>{
       if(scope?.c!==companyId)throw Error('unsafe scope');
       const old=changes.get(key(companyId,collection,id));
       if(expectedRevision===(old?.revision??0)){
         const record={companyId,collection,id,payload,revision:expectedRevision+1};
         changes.set(key(companyId,collection,id),record);
         return record;
       }
       throw Error('revision conflict');
     },
     deleteRow:async(c,k,id,rev)=>{
       if(scope?.c!==c)throw Error('unsafe scope');
       const old=changes.get(key(c,k,id));
       if(old?.revision!==rev)throw Error('revision conflict');
       changes.delete(key(c,k,id));
     },
     appendAudit:async e=>{if(failAudit)throw Error('audit persistence failed');
       if(scope?.c!==e.companyId)throw Error('audit scope mismatch');
       events.push(e);}
   };
   const result=await fn(tx);
   rows.clear();for(const [k,v] of changes)rows.set(k,v);
   audits.push(...events);return result;
 }};
 const service=createRun5TenantDataService({
   resolveSession:async token=>({
     userId:actorId.get(token),sessionId:ID.session,active:true,expiresAtEpochMs:200000
   }),store,clock:()=>now
 });
 return {service,rows,audits,members,owner,TOKENS,
   sessionOff:()=>sessionActive=false,
   failAudit:()=>failAudit=true,setNow:n=>now=n,scopeCount:()=>scopeCount};
}
const put=(f,c=ID.A,session=TOKENS.ownerA,id='row1',collection='assistant')=>
 f.service.put({session,companyId:c,collection,id,payload:{companyId:c,value:1},
   expectedRevision:0});
test('owner insert and exact company-qualified read return only scoped data',async()=>{
 const f=fixture(),record=await put(f);
 assert.equal(record.companyId,ID.A);assert.equal(record.revision,1);
 const found=await f.service.get({session:TOKENS.ownerA,companyId:ID.A,collection:'assistant',id:'row1'});
 assert.equal(found.id,'row1');assert.equal(f.audits.length,2);
 assert.equal(f.scopeCount(),2);
});
test('same record ID in two businesses never aliases another tenant',async()=>{
 const f=fixture();await put(f,ID.A,TOKENS.ownerA);
 await put(f,ID.B,TOKENS.ownerB);
 const a=await f.service.get({session:TOKENS.ownerA,companyId:ID.A,collection:'assistant',id:'row1'});
 const b=await f.service.get({session:TOKENS.ownerB,companyId:ID.B,collection:'assistant',id:'row1'});
 assert.equal(a.companyId,ID.A);assert.equal(b.companyId,ID.B);
 assert.equal(f.rows.size,2);
});
test('cross-tenant owner get/list/put/export/import and report are all denied',async()=>{
 const f=fixture();await put(f);
 const bad={session:TOKENS.ownerB,companyId:ID.A,collection:'assistant'};
 for(const action of [
   ()=>f.service.get({...bad,id:'row1'}),
   ()=>f.service.list(bad),
   ()=>f.service.put({...bad,id:'p2',payload:{companyId:ID.A},expectedRevision:0}),
   ()=>f.service.exportRows(bad),
   ()=>f.service.importRows({...bad,rows:[{companyId:ID.A,collection:'assistant',
     id:'p3',payload:{companyId:ID.A},expectedRevision:0}]}),
   ()=>f.service.report({session:TOKENS.ownerB,companyId:ID.A}),
   ()=>f.service.assistant({session:TOKENS.ownerB,companyId:ID.A}),
   ()=>f.service.syncInspect({session:TOKENS.ownerB,companyId:ID.A})
 ])await assert.rejects(action(),/Tenant data authorization denied/);
 assert.equal(f.rows.size,1);
});
test('nonmember cannot read tenant data, even with valid Supabase session',async()=>{
 const f=fixture();await put(f);
 await assert.rejects(f.service.list({session:TOKENS.stranger,companyId:ID.A,
   collection:'assistant'}),/denied/);
});
test('revoked auth.sessions row blocks all data operations',async()=>{
 const f=fixture();await put(f);f.sessionOff();
 await assert.rejects(f.service.get({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',id:'row1'}),/denied/);
 await assert.rejects(put(f,ID.A,TOKENS.ownerA,'new'),/denied/);
});
test('removed membership immediately rejects new authenticated read',async()=>{
 const f=fixture();await put(f);f.members.delete(ID.A+ID.ownerA);
 await assert.rejects(f.service.list({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant'}),/denied/);
});
test('expired access JWT rejected at privileged transaction boundary',async()=>{
 const f=fixture();await put(f);f.setNow(200000);
 await assert.rejects(f.service.list({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant'}),/denied/);
});
test('attendant may use allowed products but cannot read financial/backup/assistant',async()=>{
 const f=fixture();
 f.rows.set([ID.A,'products','row1'].join('|'),{companyId:ID.A,collection:'products',
   id:'row1',revision:1,payload:{companyId:ID.A,value:1}});
 await f.service.list({session:TOKENS.staffA,companyId:ID.A,collection:'products'});
 for(const collection of ['ledger','reports','backups','assistant','sync',
   'expenses','purchases','suppliers']){
   await assert.rejects(f.service.list({session:TOKENS.staffA,companyId:ID.A,collection}),
     /Tenant data authorization denied/);
   await assert.rejects(f.service.put({session:TOKENS.staffA,companyId:ID.A,collection,
     id:'confidential',payload:{companyId:ID.A},expectedRevision:0}),/denied/);
 }
});
test('all supplied company identifiers including deeply nested object must match scope',async()=>{
 const f=fixture();
 for(const payload of [
   {companyId:ID.B},{deep:{businessProfileId:ID.B}},
   {nested:[{organizationId:ID.B}]},{tenantId:ID.B}
 ])await assert.rejects(f.service.put({session:TOKENS.ownerA,companyId:ID.A,
    collection:'assistant',id:'invalid',payload,expectedRevision:0}),/denied/);
 assert.equal(f.rows.size,0);
});
test('invalid categories, record keys and non-json content rejected before mutation',async()=>{
 const f=fixture();
 for(const collection of ['raw-sql','system','business_members','__proto__']){
   await assert.rejects(f.service.list({session:TOKENS.ownerA,companyId:ID.A,collection}),/denied/);
 }
 for(const payload of [{companyId:ID.A,amountMinor:2.5},
   {companyId:ID.A,amountMinor:Infinity},[1,2]]){
   await assert.rejects(f.service.put({session:TOKENS.ownerA,companyId:ID.A,
     collection:'assistant',id:'row1',payload,expectedRevision:0}),/denied/);
 }
});
test('optimistic revision protects against overwrite and stale delete',async()=>{
 const f=fixture();await put(f);
 await assert.rejects(put(f),/revision conflict/);
 await assert.rejects(f.service.remove({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',id:'row1',expectedRevision:7}),/revision conflict/);
 const next=await f.service.put({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',id:'row1',payload:{companyId:ID.A,value:2},expectedRevision:1});
 assert.equal(next.revision,2);
});
test('delete respects exact tenant, revision and appends audit atomically',async()=>{
 const f=fixture();await put(f);
 const response=await f.service.remove({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',id:'row1',expectedRevision:1});
 assert.equal(response.removed,true);assert.equal(f.rows.size,0);
 assert.equal(f.audits.at(-1).action,'delete');
});
test('audit failure rolls back a new write and import together',async()=>{
 const f=fixture();f.failAudit();
 await assert.rejects(put(f),/audit persistence failed/);
 await assert.rejects(f.service.importRows({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',rows:[{companyId:ID.A,collection:'assistant',id:'row1',
     payload:{companyId:ID.A},expectedRevision:0}]}),/audit persistence failed/);
 assert.equal(f.rows.size,0);
});
test('owner export and import are tenant-limited, bounded and non-overwriting',async()=>{
 const f=fixture();await put(f);
 const exported=await f.service.exportRows({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant'});
 assert.equal(exported.exported,true);assert.equal(exported.rows.length,1);
 assert.equal(exported.rows[0].companyId,ID.A);
 await assert.rejects(f.service.importRows({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',rows:[{companyId:ID.A,collection:'assistant',id:'row1',
     payload:{companyId:ID.A},expectedRevision:0}]}),/revision conflict/);
 const capped=await f.service.exportRows({session:TOKENS.ownerA,companyId:ID.A,
   collection:'assistant',limit:101});
 assert.equal(capped.rows.length,1);
});
test('duplicate and cross-company import rows rejected before SQL writes',async()=>{
 const f=fixture();
 const entry={companyId:ID.A,collection:'assistant',id:'p',
   payload:{companyId:ID.A},expectedRevision:0};
 for(const rows of [[entry,entry],[{...entry,companyId:ID.B}]]){
   await assert.rejects(f.service.importRows({session:TOKENS.ownerA,companyId:ID.A,
     collection:'assistant',rows}),/denied/);
 }
 assert.equal(f.rows.size,0);
});
test('report, assistant, and sync previews return scoped records only',async()=>{
 const f=fixture();
 for(const collection of ['reports','assistant','sync'])
   f.rows.set([ID.A,collection,'row1'].join('|'),{companyId:ID.A,collection,
     id:'row1',revision:1,payload:{companyId:ID.A,value:1}});
 const data=await f.service.report({session:TOKENS.ownerA,companyId:ID.A});
 assert.equal(data.authoritativeLedger,false);
 const assistant=await f.service.assistant({session:TOKENS.ownerA,companyId:ID.A});
 assert.equal(assistant.rows[0].companyId,ID.A);
 const sync=await f.service.syncInspect({session:TOKENS.ownerA,companyId:ID.A});
 assert.equal(sync.replicationEnabled,false);
});

test('generic cloud financial, stock and customer writes remain fail-closed until invariant-safe writers',async()=>{
 const f=fixture();
 for(const collection of ['products','customers','sales','payments','ledger',
   'backups','inventory','sync','reports']){
   await assert.rejects(f.service.put({session:TOKENS.ownerA,companyId:ID.A,
     collection,id:'new',payload:{companyId:ID.A},expectedRevision:0}),/denied/);
   await assert.rejects(f.service.importRows({session:TOKENS.ownerA,companyId:ID.A,
     collection,rows:[{companyId:ID.A,collection,id:'new',
       payload:{companyId:ID.A},expectedRevision:0}]}),/denied/);
 }
 assert.equal(f.rows.size,0);
});