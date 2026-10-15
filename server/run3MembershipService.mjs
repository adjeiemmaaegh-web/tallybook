/** V19 Run 3 - server-only cloud-company membership.
 * Existing canonical roles: owner | attendant. An invitation never transfers
 * ownership; Run 2 controls that separately. No IndexedDB ID grants access.
 */
import {createHash,randomBytes,randomUUID} from 'node:crypto';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^v1\.[A-Za-z0-9_-]{43}$/;
const denied=()=>{throw Error('Cloud membership denied');};
const isId=x=>typeof x==='string'&&UUID.test(x);
const hash=x=>createHash('sha256').update(x).digest('hex');
export function createRun3MembershipService({resolveSession,store,clock=Date.now}){
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||typeof clock!=='function')denied();
  async function principal(session){
    if(typeof session!=='string'||session.length>16384)denied();
    const user=await resolveSession(session);
    if(!isId(user?.userId)||!isId(user?.sessionId)||user?.active!==true||
       !Number.isSafeInteger(user?.expiresAtEpochMs))denied();
    return user;
  }
  async function authorize(tx,user,companyId,role){
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0||now>=user.expiresAtEpochMs)denied();
    // Read the authoritative session and membership inside the same SQL txn.
    if(await tx.assertActiveSession(user.sessionId,user.userId,now)!==true)denied();
    const business=await tx.getCompany(companyId);
    if(business?.id!==companyId||!isId(business.ownerId))denied();
    const membership=await tx.getMembership(companyId,user.userId);
    if(membership?.companyId!==companyId||membership.userId!==user.userId||
       membership.status!=='active'||!['owner','attendant'].includes(membership.role))denied();
    if(membership.role==='owner'&&business.ownerId!==user.userId)denied();
    if(membership.role==='attendant'&&business.ownerId===user.userId)denied();
    if(role==='owner'&&(membership.role!=='owner'||business.ownerId!==user.userId))denied();
    return {now,business,membership};
  }
  function transaction(fn){return store.transaction(fn);}
  return Object.freeze({
    async invite({session,companyId,targetUserId}){
      if(!isId(companyId)||!isId(targetUserId))denied();
      const actor=await principal(session);
      if(actor.userId===targetUserId)denied();
      // Bearer invitation issued exclusively here; only its hash is stored.
      const token='v1.'+randomBytes(32).toString('base64url');
      const digest=hash(token),invitationId=randomUUID();
      return transaction(async tx=>{
        const {now}=await authorize(tx,actor,companyId,'owner');
        if(await tx.userExists(targetUserId)!==true||
           await tx.getMembership(companyId,targetUserId)||
           await tx.hasUnexpiredInvitation(companyId,targetUserId,now))denied();
        await tx.insertInvitation({id:invitationId,companyId,invitedBy:actor.userId,
          targetUserId,tokenSha256:digest,createdAt:now,expiresAt:now+15*60*1000});
        await tx.appendAudit({companyId,actorId:actor.userId,targetUserId,
          event:'invited',invitationId,at:now});
        return Object.freeze({invitationId,companyId,targetUserId,
          inviteToken:token,expiresAtEpochMs:now+15*60*1000});
      });
    },
    async accept({session,inviteToken}){
      if(typeof inviteToken!=='string'||!TOKEN.test(inviteToken))denied();
      const actor=await principal(session),digest=hash(inviteToken);
      return transaction(async tx=>{
        const invitation=await tx.getInvitationByHash(digest);
        if(!invitation||invitation.status!=='pending'||
           !isId(invitation.companyId)||invitation.targetUserId!==actor.userId)denied();
        const {now}=await authorizeRecipient(tx,actor,invitation);
        const owner=await tx.getMembership(invitation.companyId,invitation.invitedBy);
        const company=await tx.getCompany(invitation.companyId);
        if(company?.ownerId!==invitation.invitedBy||
           owner?.role!=='owner'||owner?.status!=='active')denied();
        if(await tx.getMembership(invitation.companyId,actor.userId))denied();
        await tx.insertAttendant(invitation.companyId,actor.userId);
        await tx.consumeInvitation(invitation.id);
        await tx.appendAudit({companyId:invitation.companyId,actorId:actor.userId,
          targetUserId:actor.userId,event:'accepted',invitationId:invitation.id,at:now});
        return Object.freeze({companyId:invitation.companyId,userId:actor.userId,role:'attendant'});
      });
    },
    async revokeMember({session,companyId,targetUserId}){
      if(!isId(companyId)||!isId(targetUserId))denied();
      const actor=await principal(session);
      if(targetUserId===actor.userId)denied();
      return transaction(async tx=>{
        const {now}=await authorize(tx,actor,companyId,'owner');
        const target=await tx.getMembership(companyId,targetUserId);
        if(target?.role!=='attendant'||target.status!=='active')denied();
        await tx.deleteAttendant(companyId,targetUserId);
        await tx.cancelTargetInvitations(companyId,targetUserId);
        await tx.appendAudit({companyId,actorId:actor.userId,targetUserId,
          event:'member-revoked',invitationId:null,at:now});
        return Object.freeze({companyId,targetUserId,revoked:true});
      });
    },
    async revokeInvite({session,companyId,invitationId}){
      if(!isId(companyId)||!isId(invitationId))denied();
      const actor=await principal(session);
      return transaction(async tx=>{
        const {now}=await authorize(tx,actor,companyId,'owner');
        const invite=await tx.getInvitationById(invitationId);
        if(invite?.companyId!==companyId||invite.status!=='pending')denied();
        await tx.revokeInvitation(invitationId);
        await tx.appendAudit({companyId,actorId:actor.userId,targetUserId:invite.targetUserId,
          event:'invite-revoked',invitationId,at:now});
        return Object.freeze({invitationId,revoked:true});
      });
    },
    async listMembers({session,companyId}){
      if(!isId(companyId))denied();
      const actor=await principal(session);
      return transaction(async tx=>{
        await authorize(tx,actor,companyId,'owner');
        const rows=await tx.listMembers(companyId);
        if(!Array.isArray(rows)||rows.length>10000||
           rows.some(m=>m.companyId!==companyId||!isId(m.userId)||
             !['owner','attendant'].includes(m.role)))denied();
        return Object.freeze({companyId,members:rows.map(m=>Object.freeze({...m}))});
      });
    }
  });
  async function authorizeRecipient(tx,user,invite){
    const now=clock();
    if(!Number.isSafeInteger(now)||now<=0||now>=user.expiresAtEpochMs||
       !Number.isSafeInteger(invite.expiresAt)||now>=invite.expiresAt||
       !isId(invite.targetUserId)||!isId(invite.invitedBy)||!isId(invite.id))denied();
    if(await tx.assertActiveSession(user.sessionId,user.userId,now)!==true)denied();
    return {now};
  }
}
