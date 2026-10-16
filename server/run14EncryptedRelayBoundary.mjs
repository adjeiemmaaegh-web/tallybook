/** Run 14 — server-only remote relay permission boundary.
 * Never trust local device registrations, browser actor IDs, or unsigned claims.
 */
import {verifySyncCapability,checkSyncRequestScope} from "./syncAuth.mjs";
import {verifySyncSession,authorizeActiveSyncSession} from "./syncSession.mjs";
import {authorizeSyncInspect} from "./syncMembership.mjs";
import {validateRun14Envelope} from "./run14EncryptedReplicaStore.mjs";
const fail=()=>{throw Error("Encrypted replication authorization denied.");};
async function verify(headers,config,scope){
  if(!config?.directory||!config.sessionStore||!config.relay||
    !["sync:replicate:write","sync:replicate:read"].includes(scope))fail();
  const claims=verifySyncCapability(headers?.authorization,config.capabilitySecret);
  if(claims.scope!==scope)fail();
  checkSyncRequestScope(claims,headers?.organizationId,headers?.deviceId);
  const session=verifySyncSession(headers?.session,config.sessionSecret);
  const actorId=await authorizeActiveSyncSession(session,config.sessionStore);
  const directory=typeof config.directory.authorizeSnapshot==="function"
    ? await config.directory.authorizeSnapshot():config.directory;
  await authorizeSyncInspect({...claims,scope:"sync:inspect"},directory,actorId);
  if((await directory.getOrganization(claims.orgId))?.replicationOptIn!==true)
    fail(); // independently provisioned server consent, not a local browser toggle
  return claims;
}
export async function stageRun14EncryptedEvent(headers,raw,config){
  const claims=await verify(headers,config,"sync:replicate:write");
  const envelope=validateRun14Envelope(raw);
  if(claims.orgId!==envelope.organizationId||claims.deviceId!==envelope.deviceId)fail();
  if(typeof config.relay.append!=="function")fail();
  const receipt=await config.relay.append(envelope);
  if(!receipt||!["stored","duplicate","conflict"].includes(receipt.status)||
    receipt.organizationId!==claims.orgId||receipt.eventId!==envelope.eventId||
    receipt.ciphertextSha256!==envelope.ciphertextSha256||
    !Number.isSafeInteger(receipt.cursor)||receipt.cursor<0||
    receipt.financialReplicationEnabled!==false)fail();
  return receipt;
}
export async function listRun14EncryptedEvents(headers,after,config) {
  const claims=await verify(headers,config,"sync:replicate:read");
  if(typeof config.relay.page!=="function")fail();
  const page=await config.relay.page(claims.orgId,after,20);
  if(!page||page.organizationId!==claims.orgId||!Array.isArray(page.events)||
    page.events.length>20||page.financialReplicationEnabled!==false)fail();
  for(const item of page.events) {
    validateRun14Envelope(item);
    if(item.organizationId!==claims.orgId)fail();
  }
  return page;
}
