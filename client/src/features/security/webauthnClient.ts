/** Browser side of the optional security-key step-up. Talks to navigator.credentials and verifies every response with the
 *  pure verifier in webauthnStepUp.mjs. Credentials (public keys only) are kept per business in `storage`.
 *  The key is OPTIONAL and ADDITIONAL: nothing here removes the PIN/passphrase or recovery code. */
import {
  b64uDecode, b64uEncode, canRequireSecurityKey, createChallengeStore, removeCredential, verifyAssertion, verifyRegistration, StepUpError,
  type StepUpState, type StoredCredential,
} from "./webauthnStepUp.mjs";

const challenges = createChallengeStore();
const KEY = (businessId: string) => `tallybook:security-keys:v1:${businessId}`;
const empty = (): StepUpState => ({ credentials: [], requireForSensitive: false, recoveryCodeConfigured: false, passphraseConfigured: true });

export function loadStepUpState(businessId: string, storage: Pick<Storage, "getItem"> = localStorage): StepUpState {
  try {
    const raw = storage.getItem(KEY(businessId)); if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<StepUpState>;
    return { credentials: Array.isArray(p.credentials) ? p.credentials.filter(c => typeof c?.credentialId === "string" && c.publicKeyJwk) : [], requireForSensitive: p.requireForSensitive === true, recoveryCodeConfigured: p.recoveryCodeConfigured === true, passphraseConfigured: p.passphraseConfigured !== false };
  } catch { return empty(); } // unreadable settings never lock anyone out: they read as "no key enrolled"
}
export function saveStepUpState(businessId: string, state: StepUpState, storage: Pick<Storage, "setItem"> = localStorage): void { storage.setItem(KEY(businessId), JSON.stringify(state)); }
export const webauthnSupported = () => typeof window !== "undefined" && !!window.PublicKeyCredential && !!navigator.credentials;

interface Ctx { businessId: string; rpId?: string; origin?: string; storage?: Storage }
const ctx = (c: Ctx) => ({ rpId: c.rpId ?? location.hostname, origin: c.origin ?? location.origin, storage: c.storage ?? localStorage });
const buf = (v: ArrayBuffer) => new Uint8Array(v);

export async function registerSecurityKey(c: Ctx & { ownerId: string; ownerName: string; label?: string }): Promise<StoredCredential> {
  if (!webauthnSupported()) throw new StepUpError("This browser does not support security keys.", "unsupported");
  const { rpId, origin, storage } = ctx(c); const state = loadStepUpState(c.businessId, storage);
  const challenge = challenges.issue("register");
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: b64uDecode(challenge), rp: { id: rpId, name: "Tallybook" },
    user: { id: new TextEncoder().encode(c.ownerId).slice(0, 64), name: c.ownerName, displayName: c.ownerName },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], timeout: 60_000, attestation: "none",
    authenticatorSelection: { userVerification: "required", residentKey: "discouraged" },
    excludeCredentials: state.credentials.map(k => ({ type: "public-key" as const, id: b64uDecode(k.credentialId) })),
  } }) as PublicKeyCredential | null;
  if (!cred) throw new StepUpError("No security key was registered.", "cancelled");
  challenges.consume(challenge, "register"); // burned even if verification then fails
  const r = cred.response as AuthenticatorAttestationResponse;
  const v = await verifyRegistration({ clientDataJSON: buf(r.clientDataJSON), attestationObject: buf(r.attestationObject), expectedChallenge: challenge, expectedOrigin: origin, rpId });
  if (state.credentials.some(k => k.credentialId === v.credentialId)) throw new StepUpError("This security key is already registered.", "duplicate");
  const stored: StoredCredential = { ...v, label: (c.label ?? "Security key").slice(0, 40), addedAt: new Date().toISOString() };
  saveStepUpState(c.businessId, { ...state, credentials: [...state.credentials, stored] }, storage);
  return stored;
}

/** Returns true only after a verified user-present, user-verified assertion from an enrolled key. Throws StepUpError otherwise. */
export async function confirmWithSecurityKey(c: Ctx): Promise<true> {
  if (!webauthnSupported()) throw new StepUpError("This browser does not support security keys.", "unsupported");
  const { rpId, origin, storage } = ctx(c); const state = loadStepUpState(c.businessId, storage);
  if (!state.credentials.length) throw new StepUpError("No security key is registered.", "no-credentials");
  const challenge = challenges.issue("assert");
  const got = await navigator.credentials.get({ publicKey: {
    challenge: b64uDecode(challenge), rpId, timeout: 60_000, userVerification: "required",
    allowCredentials: state.credentials.map(k => ({ type: "public-key" as const, id: b64uDecode(k.credentialId) })),
  } }) as PublicKeyCredential | null;
  if (!got) throw new StepUpError("No security key response.", "cancelled");
  challenges.consume(challenge, "assert");
  const r = got.response as AuthenticatorAssertionResponse, id = b64uEncode(buf(got.rawId));
  const res = await verifyAssertion({ credential: state.credentials.find(k => k.credentialId === id), credentialId: id, clientDataJSON: buf(r.clientDataJSON),
    authenticatorData: buf(r.authenticatorData), signature: buf(r.signature), expectedChallenge: challenge, expectedOrigin: origin, rpId });
  saveStepUpState(c.businessId, { ...state, credentials: state.credentials.map(k => k.credentialId === id ? { ...k, signCount: res.signCount } : k) }, storage);
  return true;
}

export function setRequireSecurityKey(c: Ctx, on: boolean, recoveryCodeConfigured: boolean): { ok: boolean; reason?: string } {
  const { storage } = ctx(c); const state = { ...loadStepUpState(c.businessId, storage), recoveryCodeConfigured };
  if (on) { const g = canRequireSecurityKey(state); if (!g.ok) return g; }
  saveStepUpState(c.businessId, { ...state, requireForSensitive: on }, storage); return { ok: true };
}
export function forgetSecurityKey(c: Ctx, credentialId: string) {
  const { storage } = ctx(c); const r = removeCredential(loadStepUpState(c.businessId, storage), credentialId);
  if (r.changed) saveStepUpState(c.businessId, r.state, storage); return r;
}
