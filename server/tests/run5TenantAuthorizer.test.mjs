import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun5TenantAuthorizer} from '../run5TenantAuthorizer.mjs';
const owner='11111111-1111-4111-8111-111111111111';
const attendant='22222222-2222-4222-8222-222222222222';
const company='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const session='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function fixture({role='owner',active=true,expiresAt=90000,foreign=false,revoked=false}={}){
 const calls=[];
 const tx={
  async assertActiveSession(){calls.push('session');return active;},
  async getCompany(id){calls.push('company');return{id:foreign?'cccccccc-cccc-4ccc-8ccc-cccccccccccc':id,ownerId:owner};},
  async getMembership(id,user){calls.push('membership');return revoked?null:
   {companyId:id,userId:user,role,status:'active'};}
 };
 const store={async transaction(fn){calls.push('begin');try{
   const r=await fn(tx);calls.push('commit');return r;
  }catch(e){calls.push('rollback');throw e;}}};
 const service=createRun5TenantAuthorizer({
  resolveSession:async()=>({userId:role==='owner'?owner:attendant,
    sessionId:session,active:true,expiresAtEpochMs:expiresAt}),
  store,clock:()=>1000});
 const request={accessToken:'x'.repeat(32),companyId:company,action:'company:read'};
 return{service,calls,request,tx};
}
test('session, company and membership are checked inside same transaction',async()=>{
 const f=fixture();
 const result=await f.service.authorize(f.request,(tx,ctx)=>{
  assert.equal(tx,f.tx);return ctx.companyId;});
 assert.equal(result,company);
 assert.deepEqual(f.calls,['begin','session','company','membership','commit']);
});
test('revoked session blocks data action and rolls back',async()=>{
 const f=fixture({active:false});let called=false;
 await assert.rejects(f.service.authorize(f.request,()=>{called=true;}),/denied/);
 assert.equal(called,false);assert.equal(f.calls.at(-1),'rollback');
});
test('removed membership blocks tenant data reads',async()=>{
 const f=fixture({revoked:true});
 await assert.rejects(f.service.authorize(f.request),/denied/);
});
test('foreign company lookup is rejected before callback',async()=>{
 const f=fixture({foreign:true});
 await assert.rejects(f.service.authorize(f.request,()=>true),/denied/);
});
test('expired session fails before checking company records',async()=>{
 const f=fixture({expiresAt:1000});
 await assert.rejects(f.service.authorize(f.request),/denied/);
 assert.equal(f.calls.includes('company'),false);
});
test('attendant cannot execute financial service operation',async()=>{
 const f=fixture({role:'attendant'});
 await assert.rejects(f.service.authorize({...f.request,action:'finance:write'}),/denied/);
});
test('invalid actions and identifiers cannot reach trusted callback',async()=>{
 const f=fixture();let calls=0;
 for(const overrides of [{companyId:'local-primary'},{action:'root'},{accessToken:''}]){
  await assert.rejects(f.service.authorize({...f.request,...overrides},()=>{calls++;}),/denied/);
 }
 assert.equal(calls,0);
});
test('callback failure is returned as error and transaction rolls back',async()=>{
 const f=fixture();
 await assert.rejects(f.service.authorize(f.request,()=>{throw Error('adapter conflict');}),/adapter conflict/);
 assert.equal(f.calls.at(-1),'rollback');
});
test('return value alone contains no bearer credential',async()=>{
 const f=fixture();const context=await f.service.authorize(f.request);
 assert.equal(context.companyId,company);
 assert.equal(JSON.stringify(context).includes(f.request.accessToken),false);
});
