/**
 * Stage 9 Round 1 — trusted, server-only invitation and device-grant lifecycle.
 * This module never accepts a browser-supplied owner ID or permission grant.
 * The caller must supply a live Supabase session resolver and a SERIALIZABLE
 * transactional store. No HTTP routes or commerce operations are enabled here.
 */
import { createHash, createPublicKey, randomBytes, randomUUID, verify } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const INVITE_RE = /^[0-9a-f]{64}$/;
const INVITATION_LIFETIME_MS = 10 * 60 * 1000;
const GRANT_LIFETIME_MS = 8 * 60 * 60 * 1000;
const denied = () => { throw new Error('Store/device enrollment denied'); };
const validUuid = value => typeof value === 'string' && UUID.test(value);
const validStoreId = value => typeof value === 'string' && STORE_ID.test(value);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');

/** Exact bytes signed by the enrolling Ed25519 key. The one-use owner token
 * binds this proof to a specific invite, member, store and staff identity.
 */
export function deviceKeyEnrollmentBytes({token,companyId,storeId,userId,staffId,deviceId,publicKeySpkiPem}) {
  if(typeof token!=='string'||!INVITE_RE.test(token)||!validUuid(companyId)||!validUuid(userId)||
     !validStoreId(storeId)||!validStoreId(staffId)||!validStoreId(deviceId)||
     typeof publicKeySpkiPem!=='string'||publicKeySpkiPem.length>500)denied();
  return Buffer.from(['tallybook.device.enroll.v1',digest(token),companyId,storeId,userId,
    staffId,deviceId,digest(publicKeySpkiPem)].join('\n'),'utf8');
}

export function createStoreDeviceEnrollmentService({resolveSession, store, clock=Date.now, randomInvite=()=>randomBytes(32).toString('hex'), randomGrantId=randomUUID}) {
  if (typeof resolveSession !== 'function' || typeof store?.transaction !== 'function' ||
      typeof clock !== 'function' || typeof randomInvite !== 'function' ||
      typeof randomGrantId !== 'function') denied();

  const authenticatedUser = async session => {
    const principal = await resolveSession(session);
    if (principal?.active !== true || !validUuid(principal.userId) ||
        !validUuid(principal.sessionId)) denied();
    return Object.freeze({userId:principal.userId,sessionId:principal.sessionId});
  };
  const getNow = () => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0 || now > Number.MAX_SAFE_INTEGER-GRANT_LIFETIME_MS) denied();
    return now;
  };
  const assertMethods = tx => {
    for (const method of ['assertActiveSession','getCompany','getMembership','getStore','getInvitation',
      'insertInvitation','consumeInvitation','insertGrant','getGrant','revokeGrant','appendAudit']) {
      if (typeof tx?.[method] !== 'function') denied();
    }
  };
  const assertCompanyAndStore = async (tx, companyId, storeId, requireActive=true) => {
    const company = await tx.getCompany(companyId);
    const storeScope = await tx.getStore(companyId, storeId);
    if (company?.id !== companyId || !validUuid(company.ownerId) ||
        storeScope?.companyId !== companyId || storeScope?.id !== storeId ||
        (requireActive && storeScope?.status !== 'active')) denied();
    return company;
  };
  const requireOwner = async (tx, company, actorId) => {
    const member = await tx.getMembership(company.id, actorId);
    if (company.ownerId !== actorId || member?.companyId !== company.id ||
        member?.userId !== actorId || member?.role !== 'owner' || member?.status !== 'active') denied();
  };
  const requireMember = async (tx, companyId, userId) => {
    const member = await tx.getMembership(companyId, userId);
    if (member?.companyId !== companyId || member?.userId !== userId ||
        member?.status !== 'active' || !['owner','attendant'].includes(member?.role)) denied();
  };

  return Object.freeze({
    /** Owner authorizes a specific member to enroll in an existing active store. */
    async issueInvite({session, companyId, storeId, targetUserId}) {
      if (!validUuid(companyId) || !validUuid(targetUserId) || !validStoreId(storeId)) denied();
      const actor = await authenticatedUser(session);
      const actorId = actor.userId;
      const now = getNow();
      const token = randomInvite();
      if (typeof token !== 'string' || !INVITE_RE.test(token)) denied();
      const tokenDigest = digest(token);
      const inviteId = randomGrantId();
      if (!validUuid(inviteId)) denied();
      const invitation = Object.freeze({id:inviteId,companyId,storeId,targetUserId,issuedBy:actorId,
        tokenDigest,expiresAt:now+INVITATION_LIFETIME_MS,status:'unused',createdAt:now});
      await store.transaction(async tx => {
        assertMethods(tx);
        if (await tx.assertActiveSession(actor.sessionId,actorId,now) !== true) denied();
        const company = await assertCompanyAndStore(tx, companyId, storeId);
        await requireOwner(tx, company, actorId);
        await requireMember(tx, companyId, targetUserId);
        await tx.insertInvitation(invitation);
        await tx.appendAudit({action:'device.invite.issued',companyId,storeId,actorId,targetUserId,
          grantId:null,inviteId,at:now});
      });
      // Only the verified caller receives the raw one-use token. Never log it.
      return Object.freeze({inviteId, token, expiresAt:invitation.expiresAt, companyId,storeId,targetUserId});
    },

    /** Intended member independently signs in, then consumes the one-use token. */
    async redeemInvite({session, token}) {
      if (typeof token !== 'string' || !INVITE_RE.test(token)) denied();
      const actor = await authenticatedUser(session);
      const actorId = actor.userId;
      const now = getNow();
      const tokenDigest = digest(token);
      const grantId = randomGrantId();
      if (!validUuid(grantId)) denied();
      return store.transaction(async tx => {
        assertMethods(tx);
        if (await tx.assertActiveSession(actor.sessionId,actorId,now) !== true) denied();
        const invite = await tx.getInvitation(tokenDigest);
        if (!invite || invite.tokenDigest !== tokenDigest || invite.status !== 'unused' ||
            invite.targetUserId !== actorId || !validUuid(invite.companyId) ||
            !validStoreId(invite.storeId) || !Number.isSafeInteger(invite.expiresAt) ||
            invite.expiresAt <= now) denied();
        const company = await assertCompanyAndStore(tx, invite.companyId, invite.storeId);
        // An invitation is not authorization if its issuer has lost ownership.
        if (company.ownerId !== invite.issuedBy) denied();
        await requireOwner(tx, company, invite.issuedBy);
        await requireMember(tx, invite.companyId, actorId);
        const grant = Object.freeze({id:grantId, companyId:invite.companyId,
          storeId:invite.storeId,userId:actorId,status:'active',
          expiresAt:now+GRANT_LIFETIME_MS,createdAt:now});
        await tx.consumeInvitation(invite.id);
        await tx.insertGrant(grant);
        await tx.appendAudit({action:'device.grant.issued',companyId:invite.companyId,
          storeId:invite.storeId,actorId,targetUserId:actorId,
          grantId,inviteId:invite.id,at:now});
        // Even this does NOT prove an unforgeable hardware/device identity.
        return Object.freeze({grantId,companyId:grant.companyId,storeId:grant.storeId,
          userId:actorId,expiresAt:grant.expiresAt,hardwareBound:false});
      });
    },

    /** The target redeems an owner invitation with proof of key possession.
     * This produces a server-owned public-key record, never a hardware claim.
     */
    async redeemKeyInvite({session,token,staffId,deviceId,publicKeySpkiPem,proofSignature}) {
      if(typeof token!=='string'||!INVITE_RE.test(token)||!validStoreId(staffId)||
         !validStoreId(deviceId)||typeof publicKeySpkiPem!=='string'||
         !/^[A-Za-z0-9_-]{86}$/.test(proofSignature??''))denied();
      const actor=await authenticatedUser(session);
      const now=getNow();
      return store.transaction(async tx=>{
        assertMethods(tx);
        if(typeof tx.getStaffBinding!=='function'||typeof tx.isStaffAssigned!=='function'||
           typeof tx.insertDeviceKey!=='function')denied();
        if(await tx.assertActiveSession(actor.sessionId,actor.userId,now)!==true)denied();
        const invitation=await tx.getInvitation(digest(token));
        if(!invitation||invitation.status!=='unused'||invitation.targetUserId!==actor.userId||
           !validUuid(invitation.companyId)||!validStoreId(invitation.storeId)||
           !Number.isSafeInteger(invitation.expiresAt)||invitation.expiresAt<=now)denied();
        const company=await assertCompanyAndStore(tx,invitation.companyId,invitation.storeId);
        if(company.ownerId!==invitation.issuedBy)denied();
        await requireOwner(tx,company,invitation.issuedBy);
        await requireMember(tx,company.id,actor.userId);
        const staff=await tx.getStaffBinding(company.id,actor.userId);
        if(staff?.id!==staffId||staff?.active!==true||
           await tx.isStaffAssigned(company.id,invitation.storeId,staffId)!==true)denied();
        let key;
        try {key=createPublicKey(publicKeySpkiPem);} catch {denied();}
        if(key.asymmetricKeyType!=='ed25519'||
           key.export({type:'spki',format:'pem'})!==publicKeySpkiPem)denied();
        const bytes=deviceKeyEnrollmentBytes({token,companyId:company.id,storeId:invitation.storeId,
          userId:actor.userId,staffId,deviceId,publicKeySpkiPem});
        const signature=Buffer.from(proofSignature,'base64url');
        if(signature.length!==64||!verify(null,bytes,key,signature))denied();
        const grantId=randomGrantId();
        if(!validUuid(grantId))denied();
        await tx.consumeInvitation(invitation.id);
        await tx.insertDeviceKey({companyId:company.id,id:deviceId,storeId:invitation.storeId,
          userId:actor.userId,staffId,publicKeySpkiPem,approvedBy:invitation.issuedBy,approvedAt:now});
        // A key alone cannot authorize signed reads. Issue the bounded grant
        // in this same transaction so a partial enrollment cannot escape.
        await tx.insertGrant({id:grantId,companyId:company.id,storeId:invitation.storeId,
          userId:actor.userId,status:'active',createdAt:now,expiresAt:now+GRANT_LIFETIME_MS});
        await tx.appendAudit({action:'device.grant.issued',companyId:company.id,
          storeId:invitation.storeId,actorId:actor.userId,targetUserId:actor.userId,
          grantId,inviteId:invitation.id,at:now});
        await tx.appendAudit({action:'device.key.enrolled',companyId:company.id,
          storeId:invitation.storeId,actorId:actor.userId,targetUserId:actor.userId,
          grantId:null,inviteId:invitation.id,at:now});
        return Object.freeze({companyId:company.id,storeId:invitation.storeId,
          userId:actor.userId,staffId,deviceId,publicKeyBound:true,hardwareBound:false});
      });
    },

    async revokeDeviceKey({session,companyId,deviceId}) {
      if(!validUuid(companyId)||!validStoreId(deviceId))denied();
      const actor=await authenticatedUser(session);
      const now=getNow();
      return store.transaction(async tx=>{
        assertMethods(tx);
        if(typeof tx.getDeviceKey!=='function'||typeof tx.revokeDeviceKey!=='function')denied();
        if(await tx.assertActiveSession(actor.sessionId,actor.userId,now)!==true)denied();
        const key=await tx.getDeviceKey(companyId,deviceId);
        if(key?.companyId!==companyId||key.id!==deviceId||key.status!=='active'||
           !validStoreId(key.storeId))denied();
        const company=await assertCompanyAndStore(tx,companyId,key.storeId,false);
        await requireOwner(tx,company,actor.userId);
        await tx.revokeDeviceKey(companyId,deviceId);
        await tx.appendAudit({action:'device.key.revoked',companyId,
          storeId:key.storeId,actorId:actor.userId,targetUserId:key.userId,
          grantId:null,inviteId:null,at:now});
        return Object.freeze({companyId,deviceId,revoked:true});
      });
    },

    /** Owner can revoke any grant within their company, with audit. */
    async revokeGrant({session, companyId, grantId}) {
      if (!validUuid(companyId) || !validUuid(grantId)) denied();
      const actor = await authenticatedUser(session);
      const actorId = actor.userId;
      const now = getNow();
      return store.transaction(async tx => {
        assertMethods(tx);
        if (await tx.assertActiveSession(actor.sessionId,actorId,now) !== true) denied();
        const grant = await tx.getGrant(companyId, grantId);
        if (!grant || grant.id !== grantId || grant.companyId !== companyId ||
            !validStoreId(grant.storeId) || grant.status !== 'active') denied();
        const company = await assertCompanyAndStore(tx, companyId, grant.storeId, false);
        await requireOwner(tx, company, actorId);
        await tx.revokeGrant(companyId, grantId);
        await tx.appendAudit({action:'device.grant.revoked',companyId,storeId:grant.storeId,
          actorId,targetUserId:grant.userId,grantId,inviteId:null,at:now});
        return Object.freeze({grantId,revoked:true,companyId});
      });
    },
  });
}
