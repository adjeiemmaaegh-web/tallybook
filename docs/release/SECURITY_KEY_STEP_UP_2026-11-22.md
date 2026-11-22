# Optional security-key step-up (WebAuthn / FIDO2)

**Status: implemented and tested with a simulated authenticator and a Chromium virtual authenticator. NOT yet tested with a physical key. NOT yet wired into any screen** (no owner/admin operation currently asks for it, so existing behaviour is unchanged).

## Design
- A key is an **additional** factor for sensitive operations (`SENSITIVE_OPERATIONS`: disable encryption, rotate data key, change refund policy, export/restore backup, change retention, manage staff admin, approve payment provider). It never replaces the PIN/passphrase, and the **recovery code always remains an alternative** (`evaluateStepUp` allows it, flags `key-bypass-with-recovery-code` for the audit log).
- **Lockout-proof:** requiring a key is refused unless a second key is registered or the recovery code is confirmed (`canRequireSecurityKey`). Removing a credential that would leave the requirement unsatisfiable automatically drops the requirement (`removeCredential`). Unreadable key settings read as "no key enrolled", so they can never lock anyone out. A key with no owner sign-in is never enough.
- Verification is local and offline-capable: no server round trip. Scope: ES256 (P-256) only, attestation `none` (no manufacturer allow-list), user verification **required**. Verifies origin, RP id hash, challenge (single-use, 120 s, purpose-bound), user presence/verification flags, signature, and a **counter that must advance** (clone suspicion), tolerating authenticators that always report 0.
- Files: `client/src/features/security/webauthnStepUp.mjs` (+ `.d.mts`) pure verifier/policy; `webauthnClient.ts` browser wrapper; `playwright.webauthn.config.mjs` + `qa/webauthn-virtual-authenticator.spec.mjs`; `qa/webauthn-step-up.test.mjs`.

## Evidence
- 8 unit tests with a simulated authenticator that builds real CBOR/authenticator data and signs with ES256: registration and assertion happy paths; attacks on challenge, origin, RP, presence, UV, ceremony type, attestation format, other algorithms, tampered data/signature, wrong key, unknown credential, replay, cloned counter; malformed CBOR/authData; challenge reuse/expiry; the lockout policy.
- 12 deliberate-break checks of the verifier and policy: every one made a test fail.
- 2 Chromium specs through a **virtual** CTAP2 authenticator: register, confirm twice, duplicate refused, the lockout rule, a different authenticator cannot satisfy the step-up, a key without user verification is refused.
- Run: `PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome path> pnpm exec playwright test --config playwright.webauthn.config.mjs` (the executable override is only for sandboxes whose Chromium build differs from Playwright's pin; CI does not run this spec yet).

## Known limits / next
1. Credentials (public keys, counters) are stored per business in `localStorage`. They are not secret, but someone with local storage write access could add their own key; they should move into the encrypted ledger/keyring (PR #111) once merged.
2. UI: an owner security-keys panel (register, rename, remove, "require for sensitive operations" toggle) and gating of the listed operations. Not built.
3. Safari/iOS, Windows Hello and Android platform authenticators, and real USB/NFC keys: **owner-scheduled device tests** (see acceptance procedures section D).
4. RS256/EdDSA keys are not supported (some older keys); ES256 covers current FIDO2 keys and platform authenticators.
