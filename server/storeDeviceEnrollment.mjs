/**
 * Stage 9 Round 1 — trusted, server-only invitation and device-grant lifecycle.
 * This module never accepts a browser-supplied owner ID or permission grant.
 * The caller must supply a live Supabase session resolver and a SERIALIZABLE
 * transactional store. No HTTP routes or commerce operations are enabled here.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const INVITE_RE = /^[0-9a-f]{64}$/;
const INVITATION_LIFETIME_MS = 10 * 60 * 1000;
const GRANT_LIFETIME_MS = 8 * 60 * 60 * 1000;
const denied = () => { throw new Error('Store/device enrollment denied'); };
const validUuid = value => typeof value === 'string' && UUID.test(value);
const validStoreId = value => typeof value === 'string' && STORE_ID.test(value);
const digest = value => createHash('sha256').update(value, 'utf8').digest('hex');

export function createStoreDeviceEnrollmentService({resolveSession, store, clock=Date.now, randomInvite=()=>randomBytes(32).toString('hex'), randomGrantId=randomUUID}) {
  if (typeof resolveSession !== 'function' || typeof store?.transaction !== 'function' ||
      typeof clock !== 'function' || typeof randomInvite !== 'function' ||
      typeof randomGrantId !== 'function') denied();

  const authenticatedUser = async session => {
    const principal = await resolveSession(session);
    if (principal?.active !== true || !validUuid(principal.userId)) denied();
    return principal.userId;
  };
  const getNow = () => {
    const now = clock();
    if (!Number.isSafeInteger(now) || now <= 0 || now > Number.MAX_SAFE_INTEGER-GRANT_LIFETIME_MS) denied();
    return now;
  };
  const assertMethods = tx => {
    for (const method of ['getCompany','getMembership','getStore','getInvitation',
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
      const actorId = await authenticatedUser(session);
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
      const actorId = await authenticatedUser(session);
      const now = getNow();
      const tokenDigest = digest(token);
      const grantId = randomGrantId();
      if (!validUuid(grantId)) denied();
      return store.transaction(async tx => {
        assertMethods(tx);
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

    /** Owner can revoke any grant within their company, with audit. */
    async revokeGrant({session, companyId, grantId}) {
      if (!validUuid(companyId) || !validUuid(grantId)) denied();
      const actorId = await authenticatedUser(session);
      const now = getNow();
      return store.transaction(async tx => {
        assertMethods(tx);
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
