/** Server-only, short-lived human-session verifier for the optional sync gateway.
 * Token issuance belongs to a future trusted login service. This module NEVER
 * accepts user-supplied actor IDs without a verified session signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const B64 = /^[A-Za-z0-9_-]+$/;
function secretBytes(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret, 'utf8') < 32) throw new Error('Session provider not configured');
  return Buffer.from(secret, 'utf8');
}
export function validateSyncSessionClaims(claims, now = Date.now()) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims) ||
      claims.v !== 1 || claims.aud !== 'tallybook-sync-session' ||
      typeof claims.actorId !== 'string' || !ID.test(claims.actorId) ||
      typeof claims.sessionId !== 'string' || !ID.test(claims.sessionId) ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat * 1000 > now + 30_000 || claims.exp * 1000 <= now ||
      claims.exp <= claims.iat || claims.exp * 1000 > now + 15 * 60_000)
    throw new Error('Invalid or expired sync session');
  return Object.freeze({ actorId: claims.actorId, sessionId: claims.sessionId });
}
export function verifySyncSession(header, secret, now = Date.now()) {
  const key = secretBytes(secret);
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 4096) throw new Error('Missing sync session');
  const parts = header.slice(7).split('.');
  if (parts.length !== 2 || parts.some(x => !x || !B64.test(x))) throw new Error('Malformed sync session');
  const [payload, signature] = parts;
  const raw = Buffer.from(payload, 'base64url');
  if (raw.length > 2048 || raw.toString('base64url') !== payload) throw new Error('Invalid session encoding');
  const expected = createHmac('sha256', key).update(payload).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || supplied.toString('base64url') !== signature ||
      !timingSafeEqual(supplied, expected)) throw new Error('Invalid session signature');
  let claims;
  try { claims = JSON.parse(raw.toString('utf8')); } catch { throw new Error('Invalid session payload'); }
  return validateSyncSessionClaims(claims, now);
}
/** Session revocation must be consulted on every request by a server-owned adapter. */
export async function authorizeActiveSyncSession(verifiedSession, sessionStore) {
  if (!verifiedSession || !ID.test(verifiedSession.actorId ?? '') || !ID.test(verifiedSession.sessionId ?? '') ||
      !sessionStore || typeof sessionStore.getSession !== 'function') throw new Error('Sync session denied');
  let stored;
  try { stored = await sessionStore.getSession(verifiedSession.sessionId); } catch { throw new Error('Sync session denied'); }
  if (!stored || stored.id !== verifiedSession.sessionId || stored.actorId !== verifiedSession.actorId ||
      stored.status !== 'active') throw new Error('Sync session denied');
  return verifiedSession.actorId;
}
export const disabledSyncSessionStore = Object.freeze({ async getSession() { throw new Error('Session store not configured'); } });
