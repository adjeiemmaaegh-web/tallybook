/** Isolated server-only signed sale receipt. No HTTP route or browser import. */
import { verifyCentralSaleEvent } from './centralEventTrust.mjs';

const denied=()=>{throw new Error('Central sale ingestion denied');};
const ID=/^[A-Za-z0-9:_-]{1,128}$/;

/** `store.transaction` must lock session, directory rows and event uniqueness
 * in one SERIALIZABLE PostgreSQL transaction. A prior session check alone
 * cannot protect against revocation between verification and commit.
 */
export function createCentralSaleIngestService({resolveSession,store,clock=Date.now}) {
  if(typeof resolveSession!=='function'||typeof store?.transaction!=='function'||typeof clock!=='function')denied();
  return Object.freeze({
    async ingest({session,envelope}) {
      const principal=await resolveSession(session);
      const now=clock();
      if(principal?.active!==true || typeof principal.userId!=='string' || !ID.test(principal.userId) ||
         typeof principal.sessionId!=='string' || !ID.test(principal.sessionId) ||
         !Number.isSafeInteger(principal.expiresAtEpochMs) || principal.expiresAtEpochMs<=now ||
         !Number.isSafeInteger(now) || now<=0)denied();
      const commit=()=>store.transaction(async tx=>{
        for(const method of ['assertActiveSession','getMembership','getDevice','getShop','getStaff','isAssigned','getEvent','insertEvent'])
          if(typeof tx?.[method]!=='function')denied();
        if(await tx.assertActiveSession(principal.sessionId,principal.userId,now)!==true)denied();
        // UUID-backed adapters must pin an exact local-company binding before
        // the parallel directory reads in the signature verifier.
        if(typeof tx.resolveCompany==='function' &&
           await tx.resolveCompany(envelope?.businessId,principal.userId)!==true)denied();
        const verified=await verifyCentralSaleEvent(envelope,principal.userId,tx);
        if(verified.financialPostingAllowed!==false)denied();
        const existing=await tx.getEvent(verified.businessId,verified.operationId);
        if(existing){
          if(existing.eventId!==verified.eventId || existing.payloadDigest!==verified.payloadSha256 ||
             existing.deviceId!==verified.deviceId || existing.actorId!==principal.userId)
            throw new Error('Central operation conflicts with an existing event');
          return Object.freeze({businessId:existing.businessId,operationId:existing.operationId,
            deviceId:existing.deviceId,payloadDigest:existing.payloadDigest,status:'accepted',
            receivedAtUtc:existing.receivedAtUtc});
        }
        const row={businessId:verified.businessId,shopId:verified.shopId,
          staffId:verified.staffId,deviceId:verified.deviceId,actorId:principal.userId,
          eventId:verified.eventId,operationId:verified.operationId,
          payloadDigest:verified.payloadSha256,payload:verified.payload,
          receivedAtUtc:new Date(now).toISOString()};
        await tx.insertEvent(row);
        return Object.freeze({businessId:row.businessId,operationId:row.operationId,
          deviceId:row.deviceId,payloadDigest:row.payloadDigest,status:'accepted',
          receivedAtUtc:row.receivedAtUtc});
      });
      // Concurrent exact retries may race on the unique operation index.
      // Re-run the entire authorization transaction once after PostgreSQL
      // serialization/unique conflicts; revoked access is checked again.
      for(let attempt=0;attempt<2;attempt++){
        try{return await commit();}
        catch(error){
          if(attempt===1 || !['23505','40001'].includes(error?.code))throw error;
        }
      }
      denied();
    },
  });
}
