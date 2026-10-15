import test from 'node:test';
import assert from 'node:assert/strict';
import {createRun3MembershipService} from '../run3MembershipService.mjs';
import {createHash} from 'node:crypto';
const ids={
  ownerA:'11111111-1111-4111-8111-111111111111',
  ownerB:'22222222-2222-4222-8222-222222222222',
  staffA:'33333333-3333-4333-8333-333333333333',
  staffB:'44444444-4444-4444-8444-444444444444',
  foreign:'55555555-5555-4555-8555-555555555555',
  a:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  b:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
};
const digest=t=>createHash('sha256').update(t).digest('hex');
function fixture(){
  let now=1000,active=true,failAudit=false;
  const owners=new Map([[ids.a,ids.ownerA],[ids.b,ids.ownerB]]);
  const memberships=new Map([[ids.a+ids.ownerA,'owner'],[ids.b+ids.ownerB,'owner']]);
  const invites=new Map(),audits=[];
  const userSet=new Set([ids.ownerA,ids.ownerB,ids.staffA,ids.staffB,ids.foreign]);
  const txStore={async transaction(fn){
    const members=new Map(memberships),tickets=new Map([...invites].map(([k,v])=>[k,{...v}]));
    const events=[];
    const tx={
      assertActiveSession:async()=>active,
      getCompany:async c=>owners.has(c)?{id:c,ownerId:owners.get(c),status:'active'}:null,
      getMembership:async(c,u)=>members.has(c+u)?{companyId:c,userId:u,
        role:members.get(c+u),status:'active'}:null,
      userExists:async u=>userSet.has(u),
      hasUnexpiredInvitation:async(c,u,at)=>[...tickets.values()]
        .some(t=>t.companyId===c&&t.targetUserId===u&&t.status==='pending'&&t.expiresAt>at),
      insertInvitation:async t=>{tickets.set(t.id,{...t,status:'pending'});},
      getInvitationByHash:async h=>[...tickets.values()].find(t=>t.tokenSha256===h)||null,
      getInvitationById:async id=>tickets.get(id)||null,
      insertAttendant:async(c,u)=>{if(members.has(c+u))throw Error('unique');members.set(c+u,'attendant');},
      consumeInvitation:async id=>{if(tickets.get(id)?.status!=='pending')throw Error('spent');
        tickets.get(id).status='accepted';},
      revokeInvitation:async id=>{tickets.get(id).status='revoked';},
      deleteAttendant:async(c,u)=>{if(members.get(c+u)!=='attendant')throw Error('not attendant');
        members.delete(c+u);},
      cancelTargetInvitations:async(c,u)=>{for(const t of tickets.values())
        if(t.companyId===c&&t.targetUserId===u&&t.status==='pending')t.status='revoked';},
      appendAudit:async e=>{if(failAudit)throw Error('audit failed');events.push(e);},
      listMembers:async c=>[...members].filter(([k])=>k.startsWith(c))
        .map(([k,role])=>({companyId:c,userId:k.slice(c.length),role,status:'active'}))
    };
    const value=await fn(tx);
    memberships.clear();for(const [k,v] of members)memberships.set(k,v);
    invites.clear();for(const [k,v] of tickets)invites.set(k,v);
    audits.push(...events);return value;
  }};
  const service=createRun3MembershipService({
    resolveSession:async token=>({userId:ids[token],sessionId:ids.foreign,
      active:true,expiresAtEpochMs:1000000000}),
    store:txStore,clock:()=>now
  });
  return {service,invites,audits,memberships,owners,
    revokeSession:()=>{active=false;},failAudits:()=>{failAudit=true;},
    setNow:n=>{now=n;},removeMember:(c,u)=>memberships.delete(c+u),
    setOwner:(c,u)=>owners.set(c,u)};
}
const invitation=(f,companyId=ids.a,targetUserId=ids.staffA)=>f.service.invite({
  session:'ownerA',companyId,targetUserId});
const accept=(f,token,user='staffA')=>f.service.accept({session:user,inviteToken:token});
test('targeted one-time invite accepts only original account, owner preserved',async()=>{
  const f=fixture(),i=await invitation(f);
  assert.match(i.inviteToken,/^v1\.[A-Za-z0-9_-]{43}$/);
  assert.equal(f.invites.get(i.invitationId).tokenSha256,digest(i.inviteToken));
  assert.equal(f.invites.get(i.invitationId).status,'pending');
  const result=await accept(f,i.inviteToken);
  assert.deepEqual(result,{companyId:ids.a,userId:ids.staffA,role:'attendant'});
  assert.equal(f.memberships.get(ids.a+ids.ownerA),'owner');
  assert.equal(f.audits.length,2);
  await assert.rejects(accept(f,i.inviteToken));
});
test('foreign tenant invite and non-owner invite are denied',async()=>{
  const f=fixture();
  await assert.rejects(f.service.invite({session:'ownerA',companyId:ids.b,targetUserId:ids.staffA}));
  await assert.rejects(f.service.invite({session:'staffA',companyId:ids.a,targetUserId:ids.staffB}));
  assert.equal(f.invites.size,0);
});
test('wrong recipient and unrelated account cannot consume bearer invite',async()=>{
  const f=fixture(),i=await invitation(f);
  await assert.rejects(accept(f,i.inviteToken,'foreign'));
  assert.equal(f.invites.get(i.invitationId).status,'pending');
  assert.equal(f.memberships.has(ids.a+ids.foreign),false);
});
test('expired invitation fails even with a valid live user session',async()=>{
  const f=fixture(),i=await invitation(f);
  f.setNow(i.expiresAtEpochMs);
  await assert.rejects(accept(f,i.inviteToken));
  assert.equal(f.memberships.has(ids.a+ids.staffA),false);
});
test('revoked auth session fails closed for all membership mutations',async()=>{
  const f=fixture(),i=await invitation(f);
  f.revokeSession();
  await assert.rejects(accept(f,i.inviteToken));
  await assert.rejects(invitation(f,ids.a,ids.staffB));
  await assert.rejects(f.service.revokeInvite({session:'ownerA',companyId:ids.a,invitationId:i.invitationId}));
});
test('repeat active invitation is denied, no token or audit duplication',async()=>{
  const f=fixture();await invitation(f);
  await assert.rejects(invitation(f));
  assert.equal(f.invites.size,1);assert.equal(f.audits.length,1);
});
test('recipient must still have a live owner and membership at redemption',async()=>{
  const f=fixture(),i=await invitation(f);
  f.removeMember(ids.a,ids.ownerA);
  await assert.rejects(accept(f,i.inviteToken));
  assert.equal(f.memberships.has(ids.a+ids.staffA),false);
});
test('revocation removes attendant but never owner, foreign tenant or self',async()=>{
  const f=fixture(),i=await invitation(f);
  await accept(f,i.inviteToken);
  await assert.rejects(f.service.revokeMember({session:'ownerA',companyId:ids.a,targetUserId:ids.ownerA}));
  await assert.rejects(f.service.revokeMember({session:'ownerB',companyId:ids.b,targetUserId:ids.staffA}));
  const result=await f.service.revokeMember({session:'ownerA',companyId:ids.a,targetUserId:ids.staffA});
  assert.equal(result.revoked,true);
  assert.equal(f.memberships.has(ids.a+ids.staffA),false);
  assert.equal(f.memberships.get(ids.a+ids.ownerA),'owner');
});
test('owner can cancel pending invitation; replay cannot restore membership',async()=>{
  const f=fixture(),i=await invitation(f);
  await f.service.revokeInvite({session:'ownerA',companyId:ids.a,invitationId:i.invitationId});
  await assert.rejects(accept(f,i.inviteToken));
  await assert.rejects(f.service.revokeInvite({session:'ownerA',companyId:ids.a,invitationId:i.invitationId}));
});
test('audit failure aborts creation without storing a token',async()=>{
  const f=fixture();f.failAudits();
  await assert.rejects(invitation(f),/audit failed/);
  assert.equal(f.invites.size,0);assert.equal(f.audits.length,0);
});
test('member listing is owner-only and company-isolated',async()=>{
  const f=fixture(),i=await invitation(f);await accept(f,i.inviteToken);
  const result=await f.service.listMembers({session:'ownerA',companyId:ids.a});
  assert.equal(result.members.length,2);
  assert.ok(result.members.every(m=>m.companyId===ids.a));
  await assert.rejects(f.service.listMembers({session:'ownerA',companyId:ids.b}));
  await assert.rejects(f.service.listMembers({session:'staffA',companyId:ids.a}));
});
test('malformed UUIDs, invitations and missing trusted store fail closed',async()=>{
  const f=fixture();
  for(const value of ['foreign','',null,'   '])
    await assert.rejects(f.service.invite({session:'ownerA',companyId:value,targetUserId:ids.staffA}));
  await assert.rejects(accept(f,'v1.fake'));
  assert.throws(()=>createRun3MembershipService({}),/denied/);
});
