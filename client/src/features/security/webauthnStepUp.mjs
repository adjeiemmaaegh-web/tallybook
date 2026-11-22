/** Optional WebAuthn / FIDO2 security-key STEP-UP for sensitive owner/admin operations.
 *  Pure verification (no DOM): CBOR/COSE parsing, registration and assertion checks, single-use challenges and the policy that
 *  prevents lockout. A key is an ADDITIONAL factor, never the only way in: the PIN/passphrase and the one-time recovery code
 *  always remain valid alternatives.
 *  Scope: ES256 (COSE alg -7, P-256) only; attestation "none" is accepted (we do not allow-list manufacturers).
 *  Verified here with a simulated authenticator and a Chromium virtual authenticator; NOT with a physical key yet. */

const te = new TextEncoder(), td = new TextDecoder();
export const SENSITIVE_OPERATIONS = Object.freeze(["disable-encryption", "rotate-data-key", "change-refund-policy", "export-backup", "restore-backup", "change-retention", "manage-staff-admin", "approve-payment-provider"]);
export class StepUpError extends Error { constructor(message, code = "step-up") { super(message); this.code = code; } }
const fail = (m, c) => { throw new StepUpError(m, c); };

export const b64uEncode = bytes => { let s = ""; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
export const b64uDecode = str => { const p = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - str.length % 4) % 4); const bin = atob(p); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
const asBytes = v => v instanceof Uint8Array ? v : v instanceof ArrayBuffer ? new Uint8Array(v) : ArrayBuffer.isView(v) ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : fail("Expected bytes", "malformed");
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const sha256 = async b => new Uint8Array(await crypto.subtle.digest("SHA-256", b));

/** Minimal strict CBOR (definite lengths; uint, negint, bytes, text, array, map, simple true/false/null). Returns {value, end}. */
export function decodeCbor(bytes, offset = 0, depth = 0) {
  if (depth > 8) fail("CBOR too deep", "malformed");
  if (offset >= bytes.length) fail("CBOR truncated", "malformed");
  const ib = bytes[offset], major = ib >> 5, info = ib & 31; let pos = offset + 1, len;
  const need = n => { if (pos + n > bytes.length) fail("CBOR truncated", "malformed"); };
  if (info < 24) len = info;
  else if (info === 24) { need(1); len = bytes[pos]; pos += 1; }
  else if (info === 25) { need(2); len = (bytes[pos] << 8) | bytes[pos + 1]; pos += 2; }
  else if (info === 26) { need(4); len = bytes[pos] * 2 ** 24 + ((bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]); pos += 4; }
  else if (major === 7 && info < 28) len = 0; else fail("Unsupported CBOR length", "malformed");
  switch (major) {
    case 0: return {value: len, end: pos};
    case 1: return {value: -1 - len, end: pos};
    case 2: need(len); return {value: bytes.slice(pos, pos + len), end: pos + len};
    case 3: need(len); return {value: td.decode(bytes.slice(pos, pos + len)), end: pos + len};
    case 4: { const out = []; for (let i = 0; i < len; i++) { const r = decodeCbor(bytes, pos, depth + 1); out.push(r.value); pos = r.end; } return {value: out, end: pos}; }
    case 5: { const m = new Map(); for (let i = 0; i < len; i++) { const k = decodeCbor(bytes, pos, depth + 1); const v = decodeCbor(bytes, k.end, depth + 1); if (m.has(k.value)) fail("Duplicate CBOR key", "malformed"); m.set(k.value, v.value); pos = v.end; } return {value: m, end: pos}; }
    case 7: if (info === 20) return {value: false, end: pos}; if (info === 21) return {value: true, end: pos}; if (info === 22) return {value: null, end: pos}; fail("Unsupported CBOR simple value", "malformed"); break;
    default: fail("Unsupported CBOR type", "malformed");
  }
}
const cbor = bytes => { const r = decodeCbor(bytes); if (r.end !== bytes.length) fail("Trailing CBOR bytes", "malformed"); return r.value; };

export const FLAG_UP = 0x01, FLAG_UV = 0x04, FLAG_AT = 0x40, FLAG_ED = 0x80;
export function parseAuthenticatorData(raw) {
  const d = asBytes(raw); if (d.length < 37) fail("Authenticator data too short", "malformed");
  const out = {rpIdHash: d.slice(0, 32), flags: d[32], signCount: new DataView(d.buffer, d.byteOffset + 33, 4).getUint32(0), attested: null};
  if (out.flags & FLAG_AT) {
    if (d.length < 55) fail("Attested data truncated", "malformed");
    const idLen = (d[53] << 8) | d[54]; if (idLen < 1 || idLen > 1023 || d.length < 55 + idLen) fail("Credential id length invalid", "malformed");
    const credentialId = d.slice(55, 55 + idLen), key = decodeCbor(d, 55 + idLen);
    out.attested = {aaguid: d.slice(37, 53), credentialId, coseKey: key.value};
    if (!(out.flags & FLAG_ED) && key.end !== d.length) fail("Trailing bytes after the public key", "malformed");
  }
  return out;
}

/** COSE EC2 / ES256 -> JWK. Anything else is refused. */
export function coseToJwk(cose) {
  if (!(cose instanceof Map) || cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) fail("Only ES256 (P-256) keys are supported", "unsupported-key");
  const x = cose.get(-2), y = cose.get(-3);
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) fail("Malformed public key", "unsupported-key");
  return {kty: "EC", crv: "P-256", x: b64uEncode(x), y: b64uEncode(y), ext: true};
}

/** DER ECDSA signature -> raw r||s (what WebCrypto verifies). Also accepts an already raw 64-byte signature. */
export function derToRaw(sig) {
  const s = asBytes(sig); if (s.length === 64) return s;
  if (s[0] !== 0x30) fail("Bad signature", "bad-signature");
  let p = 2; if (s[1] & 0x80) { const n = s[1] & 0x7f; if (n > 2) fail("Bad signature", "bad-signature"); p = 2 + n; }
  const int = () => { if (s[p] !== 0x02) fail("Bad signature", "bad-signature"); const l = s[p + 1]; let v = s.slice(p + 2, p + 2 + l); p += 2 + l; while (v.length > 32 && v[0] === 0) v = v.slice(1); if (v.length > 32) fail("Bad signature", "bad-signature"); const o = new Uint8Array(32); o.set(v, 32 - v.length); return o; };
  const r = int(), t = int(); const out = new Uint8Array(64); out.set(r, 0); out.set(t, 32); return out;
}

const parseClientData = (raw, type, challenge, origin) => {
  let cd; try { cd = JSON.parse(td.decode(asBytes(raw))); } catch { fail("Bad client data", "malformed"); }
  if (cd.type !== type) fail("Wrong ceremony type", "wrong-type");
  if (cd.challenge !== challenge) fail("Challenge mismatch", "challenge-mismatch");
  if (cd.origin !== origin) fail("Origin mismatch", "origin-mismatch");
  if (cd.crossOrigin === true) fail("Cross-origin ceremony refused", "origin-mismatch");
  return cd;
};

export async function verifyRegistration({clientDataJSON, attestationObject, expectedChallenge, expectedOrigin, rpId, requireUserVerification = true}) {
  parseClientData(clientDataJSON, "webauthn.create", expectedChallenge, expectedOrigin);
  const att = cbor(asBytes(attestationObject));
  if (!(att instanceof Map) || att.get("fmt") !== "none") fail("Only attestation 'none' is accepted", "unsupported-attestation");
  const ad = parseAuthenticatorData(att.get("authData"));
  if (!eq(ad.rpIdHash, await sha256(te.encode(rpId)))) fail("Relying party mismatch", "rp-mismatch");
  if (!(ad.flags & FLAG_UP)) fail("User presence required", "no-user-presence");
  if (requireUserVerification && !(ad.flags & FLAG_UV)) fail("User verification required", "no-user-verification");
  if (!ad.attested) fail("No credential in the response", "malformed");
  const publicKeyJwk = coseToJwk(ad.attested.coseKey);
  return {credentialId: b64uEncode(ad.attested.credentialId), publicKeyJwk, signCount: ad.signCount};
}

/** credential: {credentialId, publicKeyJwk, signCount}. Returns the new sign count to store. */
export async function verifyAssertion({credential, credentialId, clientDataJSON, authenticatorData, signature, expectedChallenge, expectedOrigin, rpId, requireUserVerification = true}) {
  if (!credential || credential.credentialId !== credentialId) fail("Unknown security key", "unknown-credential");
  parseClientData(clientDataJSON, "webauthn.get", expectedChallenge, expectedOrigin);
  const adBytes = asBytes(authenticatorData), ad = parseAuthenticatorData(adBytes);
  if (!eq(ad.rpIdHash, await sha256(te.encode(rpId)))) fail("Relying party mismatch", "rp-mismatch");
  if (!(ad.flags & FLAG_UP)) fail("User presence required", "no-user-presence");
  if (requireUserVerification && !(ad.flags & FLAG_UV)) fail("User verification required", "no-user-verification");
  const key = await crypto.subtle.importKey("jwk", credential.publicKeyJwk, {name: "ECDSA", namedCurve: "P-256"}, false, ["verify"]);
  const hash = await sha256(asBytes(clientDataJSON)); const signed = new Uint8Array(adBytes.length + 32); signed.set(adBytes, 0); signed.set(hash, adBytes.length);
  if (!(await crypto.subtle.verify({name: "ECDSA", hash: "SHA-256"}, key, derToRaw(signature), signed))) fail("Signature check failed", "bad-signature");
  // A counter that does not advance suggests a cloned key. Authenticators that never count (always 0) are tolerated.
  if ((ad.signCount !== 0 || credential.signCount !== 0) && ad.signCount <= credential.signCount) fail("Security key counter did not advance (possible clone)", "clone-suspected");
  return {ok: true, signCount: ad.signCount, userVerified: !!(ad.flags & FLAG_UV)};
}

/** Single-use, expiring challenges. */
export function createChallengeStore({ttlMs = 120_000, clock = Date.now} = {}) {
  const live = new Map();
  return Object.freeze({
    issue(purpose) { const c = b64uEncode(crypto.getRandomValues(new Uint8Array(32))); live.set(c, {purpose, at: clock()}); for (const [k, v] of live) if (clock() - v.at > ttlMs) live.delete(k); return c; },
    consume(challenge, purpose) { const e = live.get(challenge); live.delete(challenge); if (!e || e.purpose !== purpose || clock() - e.at > ttlMs) fail("Challenge expired or already used", "challenge-invalid"); return true; },
    size: () => live.size,
  });
}

/** ---- policy (lockout-proof) ----
 *  state: {credentials:[{credentialId,...}], requireForSensitive:boolean, recoveryCodeConfigured:boolean, passphraseConfigured:boolean}
 *  A key may be REQUIRED for sensitive operations only while at least one other way to authenticate remains
 *  (a second key, or the recovery code). */
export function canRequireSecurityKey(state) {
  if (!state.credentials?.length) return {ok: false, reason: "Register a security key first."};
  if (state.credentials.length < 2 && !state.recoveryCodeConfigured) return {ok: false, reason: "Register a second key or confirm your recovery code first, so a lost key cannot lock you out."};
  return {ok: true};
}
export function removeCredential(state, credentialId) {
  const credentials = (state.credentials ?? []).filter(c => c.credentialId !== credentialId);
  if (credentials.length === (state.credentials ?? []).length) return {state, changed: false};
  let requireForSensitive = state.requireForSensitive;
  if (requireForSensitive && !canRequireSecurityKey({...state, credentials}).ok) requireForSensitive = false; // never leave an unsatisfiable requirement behind
  return {state: {...state, credentials, requireForSensitive}, changed: true, requirementDropped: state.requireForSensitive && !requireForSensitive};
}
/** Decide whether a sensitive operation may proceed. proofs: {pin:boolean (owner already unlocked), keyAssertion:boolean, recoveryCode:boolean} */
export function evaluateStepUp({operation, state, proofs}) {
  if (!SENSITIVE_OPERATIONS.includes(operation)) return {allowed: true, reason: "not a sensitive operation", via: "none"};
  if (!proofs?.pin) return {allowed: false, reason: "Owner sign-in required.", via: null};
  if (!state.requireForSensitive || !state.credentials?.length) return {allowed: true, reason: "security key not required", via: "pin"};
  if (proofs.keyAssertion) return {allowed: true, reason: "security key verified", via: "security-key"};
  if (proofs.recoveryCode && state.recoveryCodeConfigured) return {allowed: true, reason: "recovery code used instead of the key", via: "recovery-code", audit: "key-bypass-with-recovery-code"};
  return {allowed: false, reason: "Touch your security key (or use your recovery code).", via: null};
}
