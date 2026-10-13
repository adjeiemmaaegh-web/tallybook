/** Opt-in, single-process access HTTP handlers. No financial writes or sync delivery. */
import { createSessionIssuer } from './syncLogin.mjs';
import { verifySyncSession, authorizeActiveSyncSession } from './syncSession.mjs';
import { createReadOnlyFileSessionStore } from './syncSessionStore.mjs';
import { createServerEnrollmentRegistry } from './syncEnrollment.mjs';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const validId = x => typeof x === 'string' && ID.test(x);
export function createAccessLimiter({limit=5, windowMs=60_000, clock=()=>Date.now()}={}) {
  if (!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1000) throw Error('Invalid limiter');
  const hits=new Map();
  return {allow(key) {
    if (typeof key!=='string'||key.length>256) return false;
    const now=clock();
    if (!Number.isFinite(now)) return false;
    // Bounded memory; reject new keys when capacity is exhausted.
    for (const [id,entry] of hits) if (entry.until<=now) hits.delete(id);
    let entry=hits.get(key);
    if (!entry) { if (hits.size>=10000) return false; entry={until:now+windowMs,count:0};hits.set(key,entry); }
    entry.count++;
    return entry.count<=limit;
  }};
}
export function createAccessActions({loginDirectoryFile,sessionFile,sessionSecret,enrollmentFile,clock,limiter=createAccessLimiter()}) {
  const issuer=createSessionIssuer({directoryFile:loginDirectoryFile,sessionFile,secret:sessionSecret,clock});
  const registry=createServerEnrollmentRegistry(enrollmentFile,clock);
  const sessions=createReadOnlyFileSessionStore(sessionFile);
  async function actor(sessionHeader) {
    const verified=verifySyncSession(sessionHeader,sessionSecret,clock?.()??Date.now());
    return authorizeActiveSyncSession(verified,sessions);
  }
  return Object.freeze({
    async login({userId,password},clientKey) {
      // Rate limit BEFORE password hashing to prevent work amplification.
      if (!limiter.allow('login:'+clientKey)) throw Error('Access denied');
      if (!validId(userId)||typeof password!=='string'||password.length>1024) throw Error('Access denied');
      const session=await issuer.issue(userId,password);
      return {session:session.token,expiresAt:session.expiresAt};
    },
    async invite({orgId,targetActorId},sessionHeader,clientKey) {
      if (!limiter.allow('invite:'+clientKey)) throw Error('Access denied');
      if (!validId(orgId)||!validId(targetActorId)) throw Error('Access denied');
      const administratorId=await actor(sessionHeader);
      return registry.issueInvite({orgId,targetActorId,administratorId});
    },
    async enroll({orgId,deviceId,token},sessionHeader,clientKey) {
      if (!limiter.allow('enroll:'+clientKey)) throw Error('Access denied');
      if (!validId(orgId)||!validId(deviceId)||typeof token!=='string') throw Error('Access denied');
      const actorId=await actor(sessionHeader);
      return registry.enroll({orgId,actorId,deviceId,token});
    },
    async revoke({orgId,deviceId},sessionHeader,clientKey) {
      if (!limiter.allow('revoke:'+clientKey)) throw Error('Access denied');
      if (!validId(orgId)||!validId(deviceId)) throw Error('Access denied');
      const administratorId=await actor(sessionHeader);
      return registry.revoke({orgId,administratorId,deviceId});
    },
  });
}
export function isDirectTls(req) {return req?.socket?.encrypted === true;}
