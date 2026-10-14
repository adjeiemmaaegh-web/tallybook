/** Trusted server-only company ownership operations.
 * Do not expose directly to browser calls. Caller must supply a trusted session
 * resolver and a durable transactional store. This is intentionally not wired to
 * production until those dependencies and deployment are independently verified.
 *
 * Store transactions MUST serialize updates across all server instances.
 * Recovery evidence is server-created; client backup or restore flags are
 * never accepted as proof of ownership.
 */
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const valid = x => typeof x === 'string' && ID.test(x);
const deny = () => { throw new Error('Company ownership operation denied'); };
const active = (m, companyId, userId, role) =>
  m?.companyId === companyId && m?.userId === userId &&
  m?.status === 'active' && m?.role === role;
const immutable = x => Object.freeze({...x});
export function createTrustedCompanyOwnershipService({sessionResolver, store, clock=Date.now}) {
  if (typeof sessionResolver !== 'function' || !store ||
      typeof store.transaction !== 'function' || typeof clock !== 'function') deny();
  async function actor(session) {
    // resolve actor using a server-side validated and unrevoked session.
    const result = await sessionResolver(session);
    if (!valid(result?.userId) || result?.active !== true) deny();
    return result.userId;
  }
  async function operate(session, companyId, action) {
    const userId = await actor(session);
    if (!valid(companyId)) deny();
    return store.transaction(async tx => {
      if (!tx || !['getCompany','getMembership','putMembership','putCompanyOwner','getRecovery','consumeRecovery','appendAudit','getBinding','putBinding']
          .every(k => typeof tx[k] === 'function')) deny();
      const company = await tx.getCompany(companyId);
      if (company?.id !== companyId || company?.status !== 'active' || !valid(company?.ownerId)) deny();
      return action(tx,userId,company);
    });
  }
  return Object.freeze({
    /** Requires already-provisioned owner, does not self-provision. */
    async bindExistingCompany({session,cloudCompanyId,localCompanyId,recoveryId}) {
      if (!valid(localCompanyId) || !valid(recoveryId)) deny();
      return operate(session,cloudCompanyId,async(tx,userId,company) => {
        if (company.ownerId !== userId) deny();
        if (!active(await tx.getMembership(cloudCompanyId,userId),cloudCompanyId,userId,'owner')) deny();
        const proof = await tx.getRecovery(recoveryId);
        if (proof?.id !== recoveryId || proof?.companyId !== cloudCompanyId ||
            proof?.localCompanyId !== localCompanyId || proof?.ownerId !== userId ||
            proof?.kind !== 'verified-restore' || proof?.status !== 'unused' ||
            !Number.isSafeInteger(proof?.expiresAt) || proof.expiresAt <= clock()) deny();
        // A verified restore proof must have been created and signed off by a
        // trusted server review; this API cannot mint one from browser claims.
        if (await tx.getBinding(cloudCompanyId,localCompanyId)) deny();
        // Store must enforce a unique (cloudCompanyId,localCompanyId) binding
        // inside the same serializable transaction, including across workers.
        await tx.putBinding(immutable({companyId:cloudCompanyId,localCompanyId,
          ownerId:userId,createdAt:clock()}));
        await tx.consumeRecovery(recoveryId);
        await tx.appendAudit(immutable({type:'company-binding-created',companyId:cloudCompanyId,
          localCompanyId,actorId:userId,recoveryId,at:clock()}));
        return immutable({companyId:cloudCompanyId,localCompanyId,userId,bindingCreated:true,
          cloudAccessGranted:false});
      });
    },
    /** Transfers authority ONLY against a pre-existing server-approved recovery
     * case, with both existing owner and recipient membership checked atomically. */
    async transferOwner({session,companyId,newOwnerId,recoveryId}) {
      if (!valid(newOwnerId) || !valid(recoveryId)) deny();
      return operate(session,companyId,async(tx,userId,company) => {
        if (company.ownerId !== userId) deny();
        if (userId === newOwnerId ||
            !active(await tx.getMembership(companyId,userId),companyId,userId,'owner')) deny();
        const target = await tx.getMembership(companyId,newOwnerId);
        if (target?.companyId !== companyId || target?.userId !== newOwnerId ||
            target?.status !== 'active' || target?.role !== 'attendant') deny();
        const proof = await tx.getRecovery(recoveryId);
        if (proof?.id !== recoveryId || proof?.companyId !== companyId ||
            proof?.ownerId !== userId || proof?.recipientId !== newOwnerId ||
            proof?.kind !== 'approved-transfer' || proof?.status !== 'unused' ||
            !Number.isSafeInteger(proof?.expiresAt) || proof.expiresAt <= clock()) deny();
        await tx.putMembership(immutable({...target,role:'owner'}));
        await tx.putMembership(immutable({...(await tx.getMembership(companyId,userId)),role:'attendant'}));
        await tx.putCompanyOwner(companyId,newOwnerId);
        await tx.consumeRecovery(recoveryId);
        await tx.appendAudit(immutable({type:'ownership-transferred',companyId,actorId:userId,
          recipientId:newOwnerId,recoveryId,at:clock()}));
        return immutable({companyId,newOwnerId,formerOwnerId:userId,transferred:true});
      });
    },
  });
}
