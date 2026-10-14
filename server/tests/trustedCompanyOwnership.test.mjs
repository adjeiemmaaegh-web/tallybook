import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrustedCompanyOwnershipService} from '../trustedCompanyOwnership.mjs';

function fixture() {
  const members = new Map([
    ['co:alice',{companyId:'co',userId:'alice',role:'owner',status:'active'}],
    ['co:bob',{companyId:'co',userId:'bob',role:'attendant',status:'active'}],
  ]);
  const proofs = new Map([
    ['restore',{id:'restore',companyId:'co',localCompanyId:'local',ownerId:'alice',kind:'verified-restore',status:'unused',expiresAt:2000}],
    ['transfer',{id:'transfer',companyId:'co',ownerId:'alice',recipientId:'bob',kind:'approved-transfer',status:'unused',expiresAt:2000}],
  ]);
  const audits = [];
  let ownerId = 'alice';
  const bindings = new Map();
  // Clone-on-write models atomic transaction rollback, including audit/recovery.
  const store = {async transaction(fn) {
    const nextMembers = new Map([...members].map(([k,v])=>[k,{...v}]));
    const nextProofs = new Map([...proofs].map(([k,v])=>[k,{...v}]));
    const nextAudit = [];
    let nextOwner = ownerId;
    const nextBindings = new Map([...bindings].map(([k,v])=>[k,{...v}]));
    const result = await fn({
      getCompany:async id=>id==='co'?{id,status:'active',ownerId:nextOwner}:null,
      putCompanyOwner:async (id,userId)=>{if(id!=='co')throw Error('missing company');nextOwner=userId;},
      getMembership:async(c,u)=>nextMembers.get(c+':'+u),
      putMembership:async m=>{nextMembers.set(m.companyId+':'+m.userId,m);},
      getRecovery:async id=>nextProofs.get(id),
      getBinding:async(c,l)=>nextBindings.get(c+':'+l),
      putBinding:async x=>{const key=x.companyId+':'+x.localCompanyId;if(nextBindings.has(key))throw Error('duplicate');nextBindings.set(key,x);},
      consumeRecovery:async id=>{const p=nextProofs.get(id);if(!p||p.status!=='unused')throw Error('consumed');p.status='consumed';},
      appendAudit:async event=>{nextAudit.push(event);},
    });
    ownerId = nextOwner;
    members.clear();for(const [k,v] of nextMembers) members.set(k,v);
    proofs.clear();for(const [k,v] of nextProofs) proofs.set(k,v);
    bindings.clear();for(const [k,v] of nextBindings) bindings.set(k,v);
    audits.push(...nextAudit);
    return result;
  }};
  const service = createTrustedCompanyOwnershipService({
    sessionResolver:async session => session==='alice'||session==='bob'?{userId:session,active:true}:null,
    store,clock:()=>1000,
  });
  return {service,members,proofs,audits,bindings,getOwnerId:()=>ownerId};
}
test('verified server backup proof permits one inert binding review, never grants access',async()=>{
  const f=fixture();
  const r=await f.service.bindExistingCompany({session:'alice',cloudCompanyId:'co',localCompanyId:'local',recoveryId:'restore'});
  assert.equal(r.cloudAccessGranted,false);
  assert.equal(r.bindingCreated,true);
  assert.equal(f.bindings.get('co:local').ownerId,'alice');
  assert.equal(f.audits.length,1);
  await assert.rejects(f.service.bindExistingCompany({session:'alice',cloudCompanyId:'co',localCompanyId:'local',recoveryId:'restore'}));
});
test('reject forged local company, wrong actor, missing session and foreign destination',async()=>{
  const f=fixture();
  for(const request of [
    {session:'bob',cloudCompanyId:'co',localCompanyId:'local',recoveryId:'restore'},
    {session:'alice',cloudCompanyId:'co',localCompanyId:'wrong',recoveryId:'restore'},
    {session:'invalid',cloudCompanyId:'co',localCompanyId:'local',recoveryId:'restore'},
    {session:'alice',cloudCompanyId:'other',localCompanyId:'local',recoveryId:'restore'},
  ]) await assert.rejects(f.service.bindExistingCompany(request));
  assert.equal(f.audits.length,0);
  assert.equal(f.bindings.size,0);
  assert.equal(f.proofs.get('restore').status,'unused');
});
test('approved owner transfer is atomic, auditable and replay protected',async()=>{
  const f=fixture();
  await assert.rejects(f.service.transferOwner({session:'bob',companyId:'co',newOwnerId:'alice',recoveryId:'transfer'}));
  const r=await f.service.transferOwner({session:'alice',companyId:'co',newOwnerId:'bob',recoveryId:'transfer'});
  assert.equal(r.transferred,true);
  assert.equal(f.members.get('co:bob').role,'owner');
  assert.equal(f.members.get('co:alice').role,'admin');
  assert.equal(f.audits[0].type,'ownership-transferred');
  await assert.rejects(f.service.transferOwner({session:'alice',companyId:'co',newOwnerId:'bob',recoveryId:'transfer'}));
});
test('transfer requires approved recovery proof and active target admin',async()=>{
  const f=fixture();f.members.get('co:bob').status='revoked';
  await assert.rejects(f.service.transferOwner({session:'alice',companyId:'co',newOwnerId:'bob',recoveryId:'transfer'}));
  assert.equal(f.members.get('co:alice').role,'owner');
  assert.equal(f.proofs.get('transfer').status,'unused');
});
test('no session resolver or transaction adapter means fail closed',()=>{
  assert.throws(()=>createTrustedCompanyOwnershipService({sessionResolver:null,store:{transaction(){}}}));
  assert.throws(()=>createTrustedCompanyOwnershipService({sessionResolver:()=>null,store:null}));
});
