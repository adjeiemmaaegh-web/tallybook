/** Opt-in, metadata-only durable staging. An acknowledgement is NOT business-data replication. */
import {verifySyncCapability,checkSyncRequestScope} from './syncAuth.mjs';
import {verifySyncSession,authorizeActiveSyncSession} from './syncSession.mjs';
import {authorizeSyncStage} from './syncMembership.mjs';
import {validateJournalEvent} from './syncJournal.mjs';
export async function stageAuthenticatedEvent(headers, candidate, config) {
  if (!config?.directory || !config.sessionStore || typeof config.journal?.stageEvent !== 'function') throw new Error('Event delivery unavailable');
  const claims=verifySyncCapability(headers?.authorization,config.capabilitySecret);
  if (claims.scope!=='sync:stage') throw new Error('Event-stage capability required');
  checkSyncRequestScope(claims,headers?.organizationId,headers?.deviceId);
  const session=verifySyncSession(headers?.session,config.sessionSecret);
  const actorId=await authorizeActiveSyncSession(session,config.sessionStore);
  const directory=typeof config.directory.authorizeSnapshot==='function' ? await config.directory.authorizeSnapshot() : config.directory;
  await authorizeSyncStage(claims,directory,actorId);
  const event=validateJournalEvent(candidate);
  if(event.organizationId!==claims.orgId || event.deviceId!==claims.deviceId) throw new Error('Event claim mismatch');
  const result=await config.journal.stageEvent(event);
  if(!result || !['stored','duplicate','conflict'].includes(result.status)) throw new Error('Journal did not confirm outcome');
  if(result.status==='duplicate' && result.reason!=='same-event') throw new Error('Invalid duplicate acknowledgement');
  if(result.status==='stored' && result.reason!==null) throw new Error('Invalid storage acknowledgement');
  return Object.freeze({organizationId:claims.orgId,eventId:event.eventId,operationId:event.operationId,status:result.status,reason:result.reason,financialReplicationEnabled:false});
}
