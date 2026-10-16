/** Run 14 — trusted, short-lived scoped capability issuer.
 * No user-supplied actor ID, owner membership override, or browser-held HMAC key.
 * Server-only directory/session adapters must independently verify active status.
 */
import {createHmac} from "node:crypto";
import {verifySyncSession,authorizeActiveSyncSession} from "./syncSession.mjs";
import {authorizeSyncInspect} from "./syncMembership.mjs";
import {validateSyncClaims} from "./syncAuth.mjs";
const ID=/^[A-Za-z0-9:_-]{1,128}$/;
const deny=()=>{throw Error("Encrypted replication capability denied.");};
export async function issueRun14ReplicaCapability(request,config) {
  if(!config||typeof config.secret!=="string"||
    Buffer.byteLength(config.secret)<32||!config.sessionStore||
    !config.directory||typeof config.sessionSecret!=="string")deny();
  const {organizationId,deviceId,scope}=request??{};
  if(!ID.test(organizationId??"")||!ID.test(deviceId??"")||
    !["sync:replicate:read","sync:replicate:write"].includes(scope))deny();
  const session=verifySyncSession(config.session,config.sessionSecret);
  const actorId=await authorizeActiveSyncSession(session,config.sessionStore);
  const directory=typeof config.directory.authorizeSnapshot==="function"
    ? await config.directory.authorizeSnapshot():config.directory;
  await authorizeSyncInspect({orgId:organizationId,deviceId,scope:"sync:inspect"},directory,actorId);
  const now=typeof config.clock==="function"?config.clock():Date.now();
  if(!Number.isSafeInteger(now)||now<0)deny();
  const iat=Math.floor(now/1000),exp=iat+300;
  const claims={v:1,aud:"tallybook-sync",orgId:organizationId,deviceId,scope,iat,exp};
  validateSyncClaims(claims,now);
  const payload=Buffer.from(JSON.stringify(claims)).toString("base64url");
  const sig=createHmac("sha256",config.secret).update(payload).digest("base64url");
  return Object.freeze({capability:payload+"."+sig,scope,organizationId,
    deviceId,expiresAt:new Date(exp*1000).toISOString()});
}
