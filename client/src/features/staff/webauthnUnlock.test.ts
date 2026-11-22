// S6-04: WebAuthn enrollment/unlock verified against a software authenticator (real ECDSA P-256 signatures).
import Dexie from "dexie";
import {webcrypto, createHash} from "node:crypto";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {TallybookDB, initializeDatabase} from "@/db/TallybookDB";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {createStaff, unlockStaff, lockStaff, currentStaffId, enrollStaffAuthenticator, unlockStaffWithAuthenticator, revokeStaffAuthenticator, changeStaffStatus} from "./staff";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {configurable: true, value: webcrypto});
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const sha256 = (data: Uint8Array | string) => new Uint8Array(createHash("sha256").update(data).digest());
const toDer = (p1363: Uint8Array) => {
  const part = (b: Uint8Array) => { let i = 0; while (i < b.length - 1 && b[i] === 0) i++; let r = b.slice(i); if (r[0] & 0x80) r = Uint8Array.from([0, ...r]); return Uint8Array.from([0x02, r.length, ...r]); };
  const body = Uint8Array.from([...part(p1363.slice(0, 32)), ...part(p1363.slice(32))]);
  return Uint8Array.from([0x30, body.length, ...body]);
};

class FakeAttestation { constructor(public clientDataJSON: ArrayBuffer, private spki: ArrayBuffer, private alg: number) {} getPublicKey() { return this.spki; } getPublicKeyAlgorithm() { return this.alg; } }
class FakeAssertion { constructor(public clientDataJSON: ArrayBuffer, public authenticatorData: ArrayBuffer, public signature: ArrayBuffer) {} }

interface Knobs { flags: number; rpHostname: string; signCount: number; origin: string; type: string; crossOrigin: boolean; tamperSignature: boolean; wrongKey: boolean; alg: number; rawId?: Uint8Array; challengeOverride?: Uint8Array; cancel: boolean; beforeReturn?: () => Promise<void> }
let knobs: Knobs; let keyPair: CryptoKeyPair; let otherKey: CryptoKeyPair; let credId: Uint8Array;
const fresh = (): Knobs => ({flags: 0x05, rpHostname: location.hostname, signCount: 1, origin: location.origin, type: "", crossOrigin: false, tamperSignature: false, wrongKey: false, alg: -7, cancel: false});

beforeEach(async () => {
  keyPair = await webcrypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]) as CryptoKeyPair;
  otherKey = await webcrypto.subtle.generateKey({name: "ECDSA", namedCurve: "P-256"}, true, ["sign", "verify"]) as CryptoKeyPair;
  credId = webcrypto.getRandomValues(new Uint8Array(16)); knobs = fresh();
  Object.defineProperty(window, "isSecureContext", {configurable: true, value: true});
  (globalThis as any).PublicKeyCredential = class {};
  (globalThis as any).AuthenticatorAttestationResponse = FakeAttestation;
  (globalThis as any).AuthenticatorAssertionResponse = FakeAssertion;
  Object.defineProperty(navigator, "credentials", {configurable: true, value: {
    async create({publicKey}: any) {
      if (knobs.cancel) return null;
      const cd = new TextEncoder().encode(JSON.stringify({type: knobs.type || "webauthn.create", challenge: b64url(knobs.challengeOverride ?? new Uint8Array(publicKey.challenge)), origin: knobs.origin, crossOrigin: knobs.crossOrigin}));
      const spki = new Uint8Array(await webcrypto.subtle.exportKey("spki", keyPair.publicKey));
      return {rawId: (knobs.rawId ?? credId).buffer, response: new FakeAttestation(cd.buffer as ArrayBuffer, spki.buffer as ArrayBuffer, knobs.alg)};
    },
    async get({publicKey}: any) {
      if (knobs.cancel) return null;
      if (knobs.beforeReturn) await knobs.beforeReturn();
      const cd = new TextEncoder().encode(JSON.stringify({type: knobs.type || "webauthn.get", challenge: b64url(knobs.challengeOverride ?? new Uint8Array(publicKey.challenge)), origin: knobs.origin, crossOrigin: knobs.crossOrigin}));
      const counter = new Uint8Array(4); new DataView(counter.buffer).setUint32(0, knobs.signCount, false);
      const authData = Uint8Array.from([...sha256(knobs.rpHostname), knobs.flags, ...counter]);
      const signed = Uint8Array.from([...authData, ...sha256(cd)]);
      const sig = new Uint8Array(await webcrypto.subtle.sign({name: "ECDSA", hash: "SHA-256"}, (knobs.wrongKey ? otherKey : keyPair).privateKey, signed));
      const der = toDer(sig); if (knobs.tamperSignature) der[der.length - 1] ^= 0xff;
      return {rawId: (knobs.rawId ?? credId).buffer, response: new FakeAssertion(cd.buffer as ArrayBuffer, authData.buffer as ArrayBuffer, der.buffer as ArrayBuffer)};
    },
  }});
});

let n = 0; const dbs: TallybookDB[] = [];
async function setup() {
  setActiveBusinessProfileId("primary");
  const d = new TallybookDB(`webauthn-${Date.now()}-${++n}`); dbs.push(d);
  await initializeDatabase(d);
  await saveBusinessProfile({name: "WebAuthn Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: ""}, d);
  const owner = await createStaff("Owner", "owner", "123456", d);
  await unlockStaff(owner.id, "123456", d);
  const cashier = await createStaff("Cashier", "cashier", "654321", d);
  return {d, owner, cashier};
}
afterEach(async () => {
  lockStaff("primary");
  for (const d of dbs.splice(0)) { const name = d.name; d.close(); await new Dexie(name).delete(); }
  setActiveBusinessProfileId("primary");
});
async function enrolled() {
  const s = await setup();
  await enrollStaffAuthenticator(s.d);        // owner enrols their own key
  lockStaff("primary");
  return s;
}

describe("enrollment", () => {
  it("stores the credential id, ES256 public key and a zero counter, and audits it", async () => {
    const {d, owner} = await setup();
    await enrollStaffAuthenticator(d);
    const m = (await d.staffMembers.get(owner.id))!;
    expect(m.webAuthn).toMatchObject({credentialId: b64url(credId), algorithm: -7, signCount: 0});
    expect((await d.staffAudits.toArray()).some(a => a.action === "staff.authenticator.enrolled" && a.staffId === owner.id)).toBe(true);
    expect(JSON.stringify(await d.staffAudits.toArray())).not.toContain(m.webAuthn!.publicKey); // no key material in audit
  });
  it("refuses a mismatched challenge, wrong type, foreign origin, cross-origin frame, unsupported algorithm and a cancelled prompt", async () => {
    const {d, owner} = await setup();
    for (const patch of [{challengeOverride: new Uint8Array(32)}, {type: "webauthn.get"}, {origin: "https://evil.example"}, {crossOrigin: true}] as Partial<Knobs>[]) {
      knobs = {...fresh(), ...patch};
      await expect(enrollStaffAuthenticator(d)).rejects.toThrow(/did not match this session/);
    }
    knobs = {...fresh(), alg: -257}; await expect(enrollStaffAuthenticator(d)).rejects.toThrow(/not supported; use PIN/);
    knobs = {...fresh(), cancel: true}; await expect(enrollStaffAuthenticator(d)).rejects.toThrow(/cancelled/);
    expect((await d.staffMembers.get(owner.id))!.webAuthn).toBeUndefined();
  });
  it("needs a verified staff session and a secure, supported browser (PIN remains the fallback)", async () => {
    const {d} = await setup();
    lockStaff("primary");
    await expect(enrollStaffAuthenticator(d)).rejects.toThrow(/permission|unlock|locked|staff/i);
    Object.defineProperty(window, "isSecureContext", {configurable: true, value: false});
    await expect(unlockStaffWithAuthenticator("x", d)).rejects.toThrow(/Use your PIN/);
  });
});

describe("unlock", () => {
  it("accepts a genuine assertion, starts a verified session and persists the counter", async () => {
    const {d, owner} = await enrolled();
    expect(currentStaffId()).toBeNull();
    knobs = {...fresh(), signCount: 5};
    await unlockStaffWithAuthenticator(owner.id, d);
    expect(currentStaffId()).toBe(owner.id);
    expect((await d.staffMembers.get(owner.id))!.webAuthn!.signCount).toBe(5);
  });
  it("rejects a replayed or cloned authenticator (counter must increase once it is above zero)", async () => {
    const {d, owner} = await enrolled();
    knobs = {...fresh(), signCount: 5}; await unlockStaffWithAuthenticator(owner.id, d); lockStaff("primary");
    for (const c of [5, 4, 1]) { knobs = {...fresh(), signCount: c}; await expect(unlockStaffWithAuthenticator(owner.id, d)).rejects.toThrow(/credentials changed during unlock/); expect(currentStaffId()).toBeNull(); }
    knobs = {...fresh(), signCount: 6}; await unlockStaffWithAuthenticator(owner.id, d); expect(currentStaffId()).toBe(owner.id);
  });
  it("refuses every kind of forged or incomplete assertion and never starts a session", async () => {
    const {d, owner} = await enrolled();
    const cases: [Partial<Knobs>, RegExp][] = [
      [{wrongKey: true}, /signature verification failed/],
      [{tamperSignature: true}, /signature|integer|verification/i],
      [{flags: 0x01}, /did not verify the user/],            // present, not user-verified
      [{flags: 0x04}, /did not verify the user/],            // verified flag without presence
      [{rpHostname: "evil.example"}, /not registered for this website/],
      [{challengeOverride: new Uint8Array(32)}, /did not match this session/],
      [{type: "webauthn.create"}, /did not match this session/],
      [{origin: "https://evil.example"}, /did not match this session/],
      [{crossOrigin: true}, /did not match this session/],
      [{rawId: webcrypto.getRandomValues(new Uint8Array(16))}, /cancelled or mismatched/],
      [{cancel: true}, /cancelled or mismatched/],
    ];
    for (const [patch, re] of cases) { knobs = {...fresh(), ...patch}; await expect(unlockStaffWithAuthenticator(owner.id, d), JSON.stringify(Object.keys(patch))).rejects.toThrow(re); expect(currentStaffId()).toBeNull(); }
  });
  it("refuses staff with no authenticator, a disabled member, and another company's id", async () => {
    const {d, owner, cashier} = await enrolled();
    await expect(unlockStaffWithAuthenticator(cashier.id, d)).rejects.toThrow(/No registered authenticator/);
    await expect(unlockStaffWithAuthenticator("missing", d)).rejects.toThrow(/No registered authenticator/);
    await unlockStaff(owner.id, "123456", d); await changeStaffStatus(cashier.id, true, d);
    await d.staffMembers.update(owner.id, {disabledAt: new Date().toISOString()}); lockStaff("primary");
    await expect(unlockStaffWithAuthenticator(owner.id, d)).rejects.toThrow(/No registered authenticator/);
  });
});

describe("revocation and PIN fallback", () => {
  it("after revocation the authenticator no longer unlocks, the PIN still does, and revocation is audited", async () => {
    const {d, owner} = await enrolled();
    await unlockStaff(owner.id, "123456", d);
    await revokeStaffAuthenticator(owner.id, d);
    expect((await d.staffMembers.get(owner.id))!.webAuthn).toBeUndefined();
    expect((await d.staffAudits.toArray()).some(a => a.action === "staff.authenticator.revoked")).toBe(true);
    lockStaff("primary");
    await expect(unlockStaffWithAuthenticator(owner.id, d)).rejects.toThrow(/No registered authenticator/);
    await unlockStaff(owner.id, "123456", d);
    expect(currentStaffId()).toBe(owner.id);
  });
  it("revocation or disabling DURING the browser prompt blocks the unlock", async () => {
    const {d, owner} = await enrolled();
    knobs = {...fresh(), signCount: 9, beforeReturn: async () => { await d.staffMembers.update(owner.id, {webAuthn: undefined}); }};
    await expect(unlockStaffWithAuthenticator(owner.id, d)).rejects.toThrow(/credentials changed during unlock/);
    expect(currentStaffId()).toBeNull();
  });
  it("only a staff manager can revoke", async () => {
    const {d, owner, cashier} = await enrolled();
    await unlockStaff(cashier.id, "654321", d);
    await expect(revokeStaffAuthenticator(owner.id, d)).rejects.toThrow(/permission denied/);
    expect((await d.staffMembers.get(owner.id))!.webAuthn).toBeDefined();
  });
});
