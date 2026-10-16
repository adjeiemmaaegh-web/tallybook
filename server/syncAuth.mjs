/** Server-only Stage 8 transport boundary. No endpoint in this module writes data. */
import { createHmac, timingSafeEqual } from 'node:crypto';

const ID = /^[A-Za-z0-9:_-]{1,128}$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
export function validateSyncClaims(claims, now = Date.now()) {
  if (!claims || typeof claims !== 'object' || Array.isArray(claims)) throw new Error('Invalid claims');
  if (claims.v !== 1 || claims.aud !== 'tallybook-sync' || !ID.test(claims.orgId ?? '') || !ID.test(claims.deviceId ?? '') ||
      !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= now || claims.exp * 1000 > now + 15 * 60_000 ||
      !Number.isSafeInteger(claims.iat) || claims.iat * 1000 > now + 30_000 || claims.iat > claims.exp ||
      !['sync:inspect', 'sync:stage', 'backup:write', 'sync:replicate:write', 'sync:replicate:read'].includes(claims.scope)) throw new Error('Invalid or expired sync capability');
  return Object.freeze({ orgId: claims.orgId, deviceId: claims.deviceId, scope: claims.scope });
}

/** Verification only. Credentials must be provisioned by future authenticated identity service. */
export function verifySyncCapability(header, secret, now = Date.now()) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new Error('Sync identity provider is not configured');
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 4096) throw new Error('Missing sync capability');
  const token = header.slice(7);
  const segments = token.split('.');
  if (segments.length !== 2 || !segments.every(x => x && B64URL.test(x))) throw new Error('Malformed sync capability');
  const [payload, signature] = segments;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('Invalid sync capability signature');
  const raw = Buffer.from(payload, 'base64url');
  if (raw.length > 2048) throw new Error('Oversized sync capability');
  let claims;
  try { claims = JSON.parse(raw.toString('utf8')); } catch { throw new Error('Malformed capability claims'); }
  return validateSyncClaims(claims, now);
}

export function checkSyncRequestScope(claims, organizationId, deviceId) {
  if (!ID.test(organizationId ?? '') || !ID.test(deviceId ?? '') ||
      claims.orgId !== organizationId || claims.deviceId !== deviceId) throw new Error('Device or organization scope mismatch');
}
