# Mission GO Package 1 continuation — 2026-10-31

Baseline: `9b3bd64dfd22acfd033dbbe210a557fbb947ef90`, fetched and verified on the development branch before editing. Main remains `ea165a5`. No customer records, production configuration, Supabase schema or live deployment changed.

## Implemented

`client/src/auth/workspaceKeyVault.ts` implements a separate IndexedDB store for password-wrapped random AES-256 data keys. A 16-byte random salt and fixed PBKDF2-SHA256 work factor (600,000 iterations) derive the wrapping key; AES-GCM uses a fresh 12-byte IV and a 128-bit authentication tag. Account, cloud/local company, device and protected database identity are authenticated additional data. Creation uses `add`, never replacement, and does not unlock or grant access. Only the wrapped key is persisted. Unwrapped operational keys are non-extractable and retained only in memory.

The module also encrypts/decrypts bounded record payloads with identity and record-ID authenticated data. It DOES NOT persist business records, replace the existing Dexie ledger, encrypt its indexes or perform a migration. It is the cryptographic dependency for that adapter, not a completed encrypted database.

`workspaceBoundary.ts` now requires a device ID and a successfully unlocked matching local key in addition to the online grant. A server `storageProtection` string alone cannot satisfy that prerequisite. Every workspace lock drops key references and aborts pending vault transactions. Generation checks reject cryptographic operations finishing after signout, and decrypted output from a cancelled read is zeroed before rejection. JavaScript cannot guarantee physical memory erasure; no such claim is made. Key creation/unlock does not authenticate cloud membership or install a grant by itself.

The optional internal passphrase parameter is not yet exposed as a finished onboarding flow. Calling the existing workspace button still fails closed. No bypass has been added to make an incomplete workspace appear usable.

## Verification scope

`workspaceKeyVault.test.ts` uses real Node Web Crypto with disposable fake IndexedDB. It checks wrapped-only persistence, no authority from creation, wrong password, duplicate key preservation, restart, fresh IVs, ciphertext tampering, cross-record and cross-account substitution, malformed KDF parameters, legacy-name/PIN rejection, signout races, and integration with the real workspace boundary. State-machine contract tests in `workspaceBoundary.test.ts` mock the vault explicitly; they are not encryption acceptance. The vault integration suite does not mock its encryption or local key checks.

Initial test execution: 13 boundary tests passed, but the forks worker for the vault suite timed out before executing that file. The isolated threads retry ran the encryption tests and exposed a cross-realm typed-array assertion mismatch; the test now compares every decrypted byte using arrays. Initial TypeScript found generic Uint8Array syntax unsupported by the pinned compiler; annotations were corrected without changing the runtime algorithm. Both initial logs are preserved alongside final verification evidence.

Commands (from repository root; TEMP/TMP set to `artifacts/qa-temp`):

```powershell
node --test qa/milestone1-supabase-preservation.test.mjs qa/stage9-auth-shell-contract.test.mjs
& .\node_modules\.bin\tsc.cmd --noEmit
& .\node_modules\.bin\vitest.cmd run client/src/auth/workspaceKeyVault.test.ts client/src/auth/workspaceBoundary.test.ts client/src/auth/workspaceDatabaseBoundary.test.ts client/src/auth/AuthGate.test.tsx client/src/auth/auth.test.tsx client/src/pages/CloudAccountRecovery.test.tsx client/src/pages/GoogleSignInPage.test.tsx client/src/cloud/CloudBusinessPanel.test.tsx --pool=threads --maxWorkers=1 --no-file-parallelism --testTimeout=45000 --reporter=verbose
npm run build
```

## Still incomplete; not deployable

Package 1 is still incomplete. The protected ledger adapter, durable ciphertext transactions/index design, trusted provisioning endpoint/device proof, signed bounded offline authorization, complete owner/employee onboarding and legacy-data migration/recovery remain to be implemented. Unlocking an encryption key is not an offline permission grant. The prior failing staff regression and wider fixture compatibility remain unresolved. No full-suite, hosted RLS, real browser or customer-backup acceptance is claimed here. Packages 2–6 remain governed by the original Mission GO requirements.

Continue by implementing and testing the protected record adapter and its crash-safe atomic persistence without copying decrypted records into plaintext IndexedDB. Connect the verified provisioning service and explicit owner-approved setup/migration only after that path is real. Reuse existing staff and device identities; never treat creation of a new key vault as proof of ownership. Preserve the existing local database unchanged until an approved, backed-up migration is available.

Crypto API reference reviewed: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey and https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/unwrapKey . These document the standard primitives; they do not constitute an independent security audit of this implementation.
Verified logs: 63 focused tests and 10 native checks passed. The additional final session-recheck case passed separately. The full build completed. Earlier failing attempts are retained in evidence/key-vault.
