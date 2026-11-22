import test from "node:test";
import assert from "node:assert/strict";
import {generateKeyPairSync, sign, createHash, randomBytes} from "node:crypto";
import * as W from "../client/src/features/security/webauthnStepUp.mjs";

const RP = "tallybook.example", ORIGIN = "https://tallybook.example";
const enc = new TextEncoder();
// ---- tiny CBOR encoder + simulated authenticator (test only)
const hdr = (m, n) => n < 24 ? [m << 5 | n] : n < 256 ? [m << 5 | 24, n] : [m << 5 | 25, n >> 8, n & 255];
const cb = v => v instanceof Uint8Array ? Buffer.from([...hdr(2, v.length), ...v]) : typeof v === "string" ? Buffer.concat([Buffer.from(hdr(3, Buffer.byteLength(v))), Buffer.from(v)])
  : typeof v === "number" ? Buffer.from(v >= 0 ? hdr(0, v) : hdr(1, -1 - v)) : v instanceof Map ? Buffer.concat([Buffer.from(hdr(5, v.size)), ...[...v].flatMap(([k, x]) => [cb(k), cb(x)])]) : (() => { throw new Error("enc"); })();
const sha = s => createHash("sha256").update(s).digest();
function authenticator({signCount = 0} = {}) {
  const {publicKey, privateKey} = generateKeyPairSync("ec", {namedCurve: "P-256"});
  const jwk = publicKey.export({format: "jwk"}); const credId = randomBytes(32); let counter = signCount;
  const cose = cb(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, "base64url")], [-3, Buffer.from(jwk.y, "base64url")]]));
  const authData = (flags, count, attested) => Buffer.concat([sha(RP), Buffer.from([flags]), Buffer.from([count >>> 24, count >>> 16 & 255, count >>> 8 & 255, count & 255]),
    ...(attested ? [Buffer.alloc(16), Buffer.from([credId.length >> 8, credId.length & 255]), credId, cose] : [])]);
  const cd = (type, challenge, origin = ORIGIN, extra = {}) => Buffer.from(JSON.stringify({type, challenge, origin, crossOrigin: false, ...extra}));
  return {credId, jwk,
    create(challenge, {flags = 0x45, origin = ORIGIN, fmt = "none"} = {}) {
      const att = cb(new Map([["fmt", fmt], ["attStmt", new Map()], ["authData", authData(flags, counter, true)]]));
      return {clientDataJSON: cd("webauthn.create", challenge, origin), attestationObject: att};
    },
    get(challenge, {flags = 0x05, origin = ORIGIN, type = "webauthn.get", bump = true, derSig = true} = {}) {
      if (bump) counter++;
      const ad = authData(flags, counter, false), c = cd(type, challenge, origin);
      const signature = sign("sha256", Buffer.concat([ad, sha(c)]), derSig ? privateKey : {key: privateKey, dsaEncoding: "ieee-p1363"});
      return {credentialId: W.b64uEncode(credId), clientDataJSON: c, authenticatorData: ad, signature};
    }};
}
const store = () => W.createChallengeStore();
async function enroll(a = authenticator()) {
  const cs = store(), ch = cs.issue("register");
  const reg = await W.verifyRegistration({...a.create(ch), expectedChallenge: ch, expectedOrigin: ORIGIN, rpId: RP});
  return {a, reg, credential: {credentialId: reg.credentialId, publicKeyJwk: reg.publicKeyJwk, signCount: reg.signCount}};
}
const rejects = (p, code) => assert.rejects(p, e => e instanceof W.StepUpError && e.code === code, code);

test("registration: a correct response yields the credential id, ES256 key and counter", async () => {
  const {a, reg} = await enroll();
  assert.equal(reg.credentialId, W.b64uEncode(a.credId)); assert.equal(reg.publicKeyJwk.crv, "P-256"); assert.equal(reg.signCount, 0);
});
test("registration attacks: wrong challenge/origin/rp, no presence, no user verification, wrong ceremony, attestation formats, other algorithms", async () => {
  const a = authenticator(), ok = {expectedChallenge: "C", expectedOrigin: ORIGIN, rpId: RP};
  await W.verifyRegistration({...a.create("C"), ...ok});
  await rejects(W.verifyRegistration({...a.create("C"), ...ok, expectedChallenge: "D"}), "challenge-mismatch");
  await rejects(W.verifyRegistration({...a.create("C", {origin: "https://evil.example"}), ...ok}), "origin-mismatch");
  await rejects(W.verifyRegistration({...a.create("C"), ...ok, rpId: "other.example"}), "rp-mismatch");
  await rejects(W.verifyRegistration({...a.create("C", {flags: 0x44}), ...ok}), "no-user-presence");
  await rejects(W.verifyRegistration({...a.create("C", {flags: 0x41}), ...ok}), "no-user-verification");
  await W.verifyRegistration({...a.create("C", {flags: 0x41}), ...ok, requireUserVerification: false});
  await rejects(W.verifyRegistration({...a.create("C", {fmt: "packed"}), ...ok}), "unsupported-attestation");
  const wrongType = a.create("C"); wrongType.clientDataJSON = Buffer.from(JSON.stringify({type: "webauthn.get", challenge: "C", origin: ORIGIN})); await rejects(W.verifyRegistration({...wrongType, ...ok}), "wrong-type");
  await rejects(W.verifyRegistration({clientDataJSON: Buffer.from("x"), attestationObject: Buffer.from("y"), ...ok}), "malformed");
  await rejects(W.verifyRegistration({...a.create("C"), attestationObject: Buffer.from([0xa1]), ...ok}), "malformed");
  assert.throws(() => W.coseToJwk(new Map([[1, 3], [3, -257]])), W.StepUpError);
});
test("assertion: valid signature passes (DER and raw); counter advances and is returned", async () => {
  const {a, credential} = await enroll(); const cs = store();
  const ch = cs.issue("assert"); const r = await W.verifyAssertion({credential, ...a.get(ch), expectedChallenge: ch, expectedOrigin: ORIGIN, rpId: RP});
  assert.deepEqual([r.ok, r.signCount, r.userVerified], [true, 1, true]);
  const ch2 = "c2"; const r2 = await W.verifyAssertion({credential: {...credential, signCount: 1}, ...a.get(ch2, {derSig: false}), expectedChallenge: ch2, expectedOrigin: ORIGIN, rpId: RP}); assert.equal(r2.signCount, 2);
});
test("assertion attacks: tampered data/signature, wrong key, replay, clone, wrong challenge/origin/rp/type, no UV, unknown credential", async () => {
  const {a, credential} = await enroll(), other = authenticator(); const base = {credential, expectedChallenge: "X", expectedOrigin: ORIGIN, rpId: RP};
  const good = a.get("X"); await W.verifyAssertion({...base, ...good});
  const flip = b => { const c = Buffer.from(b); c[c.length - 1] ^= 1; return c; };
  await rejects(W.verifyAssertion({...base, ...a.get("X"), signature: flip(a.get("X").signature)}), "bad-signature");
  const t = a.get("X"); await rejects(W.verifyAssertion({...base, ...t, authenticatorData: flip(t.authenticatorData)}), "bad-signature");
  const o = other.get("X"); await rejects(W.verifyAssertion({...base, ...o, credentialId: W.b64uEncode(a.credId)}), "bad-signature");
  await rejects(W.verifyAssertion({...base, ...o}), "unknown-credential");
  await rejects(W.verifyAssertion({...base, ...a.get("Y")}), "challenge-mismatch");
  await rejects(W.verifyAssertion({...base, ...a.get("X", {origin: "https://evil.example"})}), "origin-mismatch");
  await rejects(W.verifyAssertion({...base, ...a.get("X", {type: "webauthn.create"})}), "wrong-type");
  await rejects(W.verifyAssertion({...base, ...a.get("X", {flags: 0x04})}), "no-user-presence");
  await rejects(W.verifyAssertion({...base, ...a.get("X", {flags: 0x01})}), "no-user-verification");
  await rejects(W.verifyAssertion({...base, rpId: "other.example", ...a.get("X")}), "rp-mismatch");
  await rejects(W.verifyAssertion({...base, credential: {...credential, signCount: 99}, ...a.get("X")}), "clone-suspected");
  const fresh = await enroll(), once = fresh.a.get("X"), fb = {expectedChallenge: "X", expectedOrigin: ORIGIN, rpId: RP};
  const first = await W.verifyAssertion({credential: fresh.credential, ...once, ...fb});                       // counter 0 -> 1
  await rejects(W.verifyAssertion({credential: {...fresh.credential, signCount: first.signCount}, ...once, ...fb}), "clone-suspected"); // replay of the same response
  const zero = authenticator(); const z = await enroll(zero); // authenticators that never count (always 0) are tolerated
  const zc = zero.get("X", {bump: false}); assert.equal((await W.verifyAssertion({credential: z.credential, ...zc, expectedChallenge: "X", expectedOrigin: ORIGIN, rpId: RP})).signCount, 0);
});
test("CBOR/authData parsing refuses malformed input without crashing", () => {
  for (const bad of [[], [0xa1], [0x5f], [0x1b, 0, 0, 0, 0, 0, 0, 0, 1], [0xbf], [0xa2, 0x01, 0x01, 0x01, 0x02]]) assert.throws(() => W.decodeCbor(Uint8Array.from(bad)), W.StepUpError);
  assert.throws(() => W.parseAuthenticatorData(new Uint8Array(10)), W.StepUpError);
  const ad = Buffer.concat([sha(RP), Buffer.from([0x45, 0, 0, 0, 0]), Buffer.alloc(16), Buffer.from([0xff, 0xff])]);
  assert.throws(() => W.parseAuthenticatorData(ad), W.StepUpError);
  assert.throws(() => W.derToRaw(Uint8Array.from([1, 2, 3])), W.StepUpError);
});
test("challenges are single use, purpose-bound and expire", () => {
  let t = 0; const cs = W.createChallengeStore({ttlMs: 1000, clock: () => t});
  const c = cs.issue("assert"); assert.throws(() => cs.consume(c, "register"), W.StepUpError);
  assert.throws(() => cs.consume(c, "assert"), W.StepUpError, "a wrong-purpose attempt burns it");
  const d = cs.issue("assert"); assert.equal(cs.consume(d, "assert"), true); assert.throws(() => cs.consume(d, "assert"), W.StepUpError);
  const e = cs.issue("assert"); t = 1001; assert.throws(() => cs.consume(e, "assert"), W.StepUpError);
  assert.notEqual(cs.issue("x"), cs.issue("x"));
});

const st = (o = {}) => ({credentials: [{credentialId: "k1"}], requireForSensitive: true, recoveryCodeConfigured: true, passphraseConfigured: true, ...o});
test("policy: a key can be required only while another way in exists; removing the last way drops the requirement instead of locking out", () => {
  assert.equal(W.canRequireSecurityKey(st({credentials: []})).ok, false);
  assert.equal(W.canRequireSecurityKey(st({recoveryCodeConfigured: false})).ok, false, "one key and no recovery code is a lockout risk");
  assert.equal(W.canRequireSecurityKey(st({recoveryCodeConfigured: false, credentials: [{credentialId: "a"}, {credentialId: "b"}]})).ok, true);
  assert.equal(W.canRequireSecurityKey(st()).ok, true);
  let r = W.removeCredential(st({recoveryCodeConfigured: false, credentials: [{credentialId: "a"}, {credentialId: "b"}]}), "a");
  assert.equal(r.state.requireForSensitive, false); assert.equal(r.requirementDropped, true);
  r = W.removeCredential(st(), "k1"); assert.equal(r.state.credentials.length, 0); assert.equal(r.state.requireForSensitive, false);
  r = W.removeCredential(st({credentials: [{credentialId: "a"}, {credentialId: "b"}]}), "a"); assert.equal(r.state.requireForSensitive, true);
  assert.equal(W.removeCredential(st(), "nope").changed, false);
});
test("policy: sensitive operations need the key when required, with PIN/recovery alternatives; non-sensitive and unenrolled are unchanged", () => {
  const ev = (operation, state, proofs) => W.evaluateStepUp({operation, state, proofs});
  assert.equal(ev("sell", st(), {pin: true}).allowed, true);
  for (const op of W.SENSITIVE_OPERATIONS) {
    assert.equal(ev(op, st(), {pin: false, keyAssertion: true}).allowed, false, "key without sign-in is never enough");
    assert.equal(ev(op, st(), {pin: true}).allowed, false);
    assert.equal(ev(op, st(), {pin: true, keyAssertion: true}).via, "security-key");
    const rc = ev(op, st(), {pin: true, recoveryCode: true}); assert.deepEqual([rc.allowed, rc.via, rc.audit], [true, "recovery-code", "key-bypass-with-recovery-code"]);
    assert.equal(ev(op, st({recoveryCodeConfigured: false}), {pin: true, recoveryCode: true}).allowed, false, "an unconfigured recovery code is not an alternative");
    assert.equal(ev(op, st({requireForSensitive: false}), {pin: true}).allowed, true, "optional: off means off");
    assert.equal(ev(op, st({credentials: []}), {pin: true}).allowed, true, "no key enrolled: unchanged behaviour");
  }
});
