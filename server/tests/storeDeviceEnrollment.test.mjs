import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoreDeviceEnrollmentService} from '../storeDeviceEnrollment.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const C='33333333-3333-4333-8333-333333333333';
const COMPANY='44444444-4444-4444-8444-444444444444';
const OWNER='55555555-5555-4555-8555-555555555555';
const MEMBER='66666666-6666-4666-8666-666666666666';
const OTHER='77777777-7777-4777-8777-777777777777';
const TOKEN='a'.repeat(64);
const SESSION='88888888-8888-4888-8888-888888888888';
const SERVICE_ERR=/enrollment denied/;

function fixture(options={}) {
 let time=100_000, owner=OWNER, storeStatus='active', memberActive=true, sessionActive=true;
 const calls=[], invitationByDigest=new Map(),grantById=new Map(),audit=[];
 const state=()=>({invitationByDigest,grantById,audit,calls});
 const deepCopy=()=>({invitationByDigest:new Map(invitationByDigest),grantById:new Map(grantById),audit:[...audit]});
 const service=createStoreDeviceEnrollmentService({
  resolveSession:async session=>({userId:session,sessionId:SESSION,active:session!==OTHER}),
  clock:()=>time,
  randomInvite:()=>TOKEN,
  randomGrantId:(()=>{let n=0; return ()=>[A,B,C][n++]??A;})(),
  store:{async transaction(work){
    calls.push('begin');const snapshot=deepCopy();
    const tx={
     assertActiveSession:async(sessionId,userId)=>sessionActive && sessionId===SESSION && userId!==OTHER,
     getCompany:async id=>({id,ownerId:owner}),
     getMembership:async(id,userId)=>userId===owner?{companyId:id,userId,role:'owner',status:'active'}:
       userId===MEMBER&&memberActive?{companyId:id,userId,role:'attendant',status:'active'}:null,
     getStore:async(id,storeId)=>({id:storeId,companyId:id,status:storeStatus}),
     getInvitation:async d=>invitationByDigest.get(d)??null,
     insertInvitation:async i=>{if(invitationByDigest.has(i.tokenDigest))throw Error('unique');invitationByDigest.set(i.tokenDigest,i);},
     consumeInvitation:async id=>{const i=[...invitationByDigest.values()].find(x=>x.id===id&&x.status==='unused');if(!i)throw Error('duplicate');invitationByDigest.set(i.tokenDigest,{...i,status:'used'});},
     insertGrant:async g=>{if(options.failGrant)throw Error('db write fail');grantById.set(g.id,g);},
     getGrant:async(id,gid)=>{const g=grantById.get(gid);return g?.companyId===id?g:null;},
     revokeGrant:async(id,gid)=>{const g=grantById.get(gid);if(g?.companyId!==id||g.status!=='active')throw Error('conflict');grantById.set(gid,{...g,status:'revoked'});},
     appendAudit:async e=>{if(options.failAudit)throw Error('audit fail');audit.push(e);},
    };
    try {const result=await work(tx);calls.push('commit');return result;}
    catch(e){invitationByDigest.clear();for(const [k,v] of snapshot.invitationByDigest)invitationByDigest.set(k,v);
      grantById.clear();for(const [k,v] of snapshot.grantById)grantById.set(k,v);
      audit.length=0;audit.push(...snapshot.audit);calls.push('rollback');throw e;}
  }},
 });
 return {service,state,issue:()=>service.issueInvite({session:OWNER,companyId:COMPANY,storeId:'store-a',targetUserId:MEMBER}),
  redeem:()=>service.redeemInvite({session:MEMBER,token:TOKEN}),
  now:x=>{time=x},owner:x=>{owner=x},disableStore:()=>{storeStatus='disabled'},disableMember:()=>{memberActive=false},revokeSession:()=>{sessionActive=false}};
}

test('owner-issued invitation is scoped to company, store, target and a 10-min token',async()=>{
 const f=fixture(),i=await f.issue();assert.equal(i.companyId,COMPANY);assert.equal(i.targetUserId,MEMBER);
 assert.equal(i.expiresAt,700_000);assert.equal(i.token,TOKEN);
 assert.equal(f.state().audit[0].action,'device.invite.issued');
 assert.equal(JSON.stringify([...f.state().invitationByDigest.values()]).includes(TOKEN),false);
});
test('authenticated target redeems once, grant is 8h, audit matches and result is explicitly not hardware bound',async()=>{
 const f=fixture();await f.issue();const g=await f.redeem();
 assert.equal(g.userId,MEMBER);assert.equal(g.expiresAt,100_000+8*60*60*1000);
 assert.equal(g.hardwareBound,false);assert.equal(f.state().grantById.get(g.grantId).status,'active');
 assert.deepEqual(f.state().audit.map(x=>x.action),['device.invite.issued','device.grant.issued']);
 await assert.rejects(f.redeem(),SERVICE_ERR);
});
test('non-owner, signed-out, wrong account and malformed scope cannot issue',async()=>{
 const f=fixture();
 for(const session of [MEMBER,OTHER])await assert.rejects(f.service.issueInvite({session,companyId:COMPANY,storeId:'store-a',targetUserId:MEMBER}),SERVICE_ERR);
 await assert.rejects(f.service.issueInvite({session:OWNER,companyId:'broken',storeId:'store-a',targetUserId:MEMBER}),SERVICE_ERR);
 await assert.rejects(f.service.issueInvite({session:OWNER,companyId:COMPANY,storeId:'bad store',targetUserId:MEMBER}),SERVICE_ERR);
 assert.equal(f.state().invitationByDigest.size,0);
});
test('wrong account cannot redeem a bearer token without own verified membership',async()=>{
 const f=fixture();await f.issue();await assert.rejects(f.service.redeemInvite({session:OWNER,token:TOKEN}),SERVICE_ERR);
 await assert.rejects(f.service.redeemInvite({session:OTHER,token:TOKEN}),SERVICE_ERR);
 assert.equal(f.state().grantById.size,0);
});
test('expiry is exclusive and non-monotonic invalid clock is denied',async()=>{
 const f=fixture();await f.issue();f.now(700_000);await assert.rejects(f.redeem(),SERVICE_ERR);
 f.now(-1);await assert.rejects(f.redeem(),SERVICE_ERR);
});
test('owner transfer, membership removal or store disable before redemption invalidates outstanding invitation',async()=>{
 for(const mode of ['owner','member','store']){
  const f=fixture();await f.issue();if(mode==='owner')f.owner(OTHER);if(mode==='member')f.disableMember();if(mode==='store')f.disableStore();
  await assert.rejects(f.redeem(),SERVICE_ERR);assert.equal(f.state().grantById.size,0);
 }
});
test('owner revokes only own company grant, same invite cannot be redeemed twice',async()=>{
 const f=fixture();await f.issue();const g=await f.redeem();
 await assert.rejects(f.service.revokeGrant({session:MEMBER,companyId:COMPANY,grantId:g.grantId}),SERVICE_ERR);
 await assert.rejects(f.service.revokeGrant({session:OWNER,companyId:OTHER,grantId:g.grantId}),SERVICE_ERR);
 const rev=await f.service.revokeGrant({session:OWNER,companyId:COMPANY,grantId:g.grantId});
 assert.equal(rev.revoked,true);assert.equal(f.state().grantById.get(g.grantId).status,'revoked');
 await assert.rejects(f.service.revokeGrant({session:OWNER,companyId:COMPANY,grantId:g.grantId}),SERVICE_ERR);
});
test('owner can revoke an existing grant even after store is disabled',async()=>{
 const f=fixture();await f.issue();const g=await f.redeem();f.disableStore();
 const r=await f.service.revokeGrant({session:OWNER,companyId:COMPANY,grantId:g.grantId});assert.equal(r.revoked,true);
});
test('grant insert and audit failures roll back proof consumption, grant and audit atomically',async()=>{
 for(const options of [{failGrant:true},{failAudit:true}]){
  const f=fixture(options);if(options.failAudit){await assert.rejects(f.issue(),/audit fail/);assert.equal(f.state().invitationByDigest.size,0);}else{
   await f.issue();await assert.rejects(f.redeem(),/db write fail/);
   assert.equal([...f.state().invitationByDigest.values()][0].status,'unused');assert.equal(f.state().grantById.size,0);
  }
  assert.ok(f.state().calls.includes('rollback'));
 }
});
test('unknown invitation and invalid/weak token always fail closed',async()=>{
 const f=fixture();for(const token of ['abc','0'.repeat(64),'ABC','x'.repeat(64)]){
  await assert.rejects(f.service.redeemInvite({session:MEMBER,token}),SERVICE_ERR);
 }
});

test('revoked server-side auth session during issuance, redemption or revocation fails closed',async()=>{
 for(const action of ['issue','redeem','revoke']) {
  const f=fixture();let grant;
  if(action!=='issue')await f.issue();
  if(action==='revoke')grant=await f.redeem();
  f.revokeSession();
  if(action==='issue')await assert.rejects(f.issue(),SERVICE_ERR);
  if(action==='redeem')await assert.rejects(f.redeem(),SERVICE_ERR);
  if(action==='revoke')await assert.rejects(f.service.revokeGrant({session:OWNER,companyId:COMPANY,grantId:grant.grantId}),SERVICE_ERR);
  assert.ok(f.state().calls.includes('rollback'));
 }
});
