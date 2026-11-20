# ST24-05 — Local-ledger encryption: key and recovery decision

**Date:** 20 November 2026. **Status:** SOURCE FOUNDATION ONLY / NO-GO for active-ledger encryption or production. Branch: development/st24-05-local-ledger-keyring-20261120. Base: main at c2792d17. All existing customer data and environments remain unchanged.

## Decision: key custody and recovery

- Each local workspace + business ledger has an independent random 256-bit data-encryption key (DEK).
- The ledger DEK is wrapped twice using AES-256-GCM with authenticated workspace/business scope and distinct random 96-bit IVs.
- **Owner passphrase:** minimum 12 characters; recommend five or more randomly selected words. A distinct 128-bit salt and fixed PBKDF2-HMAC-SHA-256 (310,000 iterations) derive a nonextractable AES-GCM wrapping key. Authentication uses the GCM tag. The passphrase is never stored. A weak chosen passphrase is vulnerable to offline guessing if an attacker steals the keyring.
- **Recovery code:** a generated 256-bit random, printable 43-character base64url code shown once. Derive its wrapping key with HKDF-SHA-256 and a distinct random salt and domain info. The code is NOT stored; only its AES-GCM wrapped DEK is stored. Store the code off-device (ideally print or in a trusted password manager), separately from the device. Never send it to a server or analytics.
- **At runtime:** raw DEK is imported into a nonextractable WebCrypto key and held through a revocable, in-memory per-tab handle. The input byte array is overwritten best-effort, but JavaScript cannot guarantee wiping every heap copy; compromised scripts and an unlocked computer remain threats. The handle is explicitly revoked on lock/sign-out by the caller.
- **Lost passphrase with intact keyring:** recovery code unwraps DEK without the old passphrase, then re-wraps it under a new passphrase. Replace the current recovery code after owner reauthenticates; neither operation re-encrypts every stored record. Copies of a previous keyring remain unlockable using old credentials: full response to credential compromise requires generating a new DEK and re-encrypting all records under an independently verified migration. Recovering a **lost device** also requires surviving encrypted ledger records AND the associated keyring; a recovery code alone reconstructs neither. The existing portable encrypted backup is a separate format protected by its **backup passphrase**, not by the ST24-05 recovery code.
- **Both credentials lost:** no backdoor, no default password and no silent reset. If an independent verified backup exists, it can be restored under its own credentials and validation rules; otherwise the sealed ledger is irrecoverable.

## Implemented in this branch

- client/src/features/security/st24LedgerKeyring.mjs and .d.mts: WebCrypto random DEK, isolated credential wraps, strict version/salt/IV/ciphertext and KDF bounds, authenticated scope, bound record envelopes, credential rotation/reset, explicit in-memory handle revocation. No account dependency or cloud calls.
- qa/st24-ledger-keyring.test.mjs: native tests for creation, both unlock methods, loss recovery, invalid passphrase, tampering, cross-company identity, wrong record/primary key, rotation, malicious KDF sizes, encoding bounds, lossy JSON and explicit lock. Native suites discover qa/*.test.mjs.
- **No production app entrypoint imports this module yet.** It does not make Dexie records encrypted. It is deliberately impossible to mistake importing this helper for enabling secure storage.

## Remaining blockers before ST24-05 can be called complete

1. **Record schemas and indexes:** current Dexie schema v39 has plaintext sales, payments, customer identity, staff, stock and many sensitive indexed properties. Review every indexed/query field; replace exposed PII indexes with a documented minimal public metadata schema or a consciously scoped encrypted search design. Validate behavior and accept explicitly documented metadata leakage. A per-record envelope alone does not encrypt primary keys, table names, row counts or any indexes that remain clear.
2. **Serialization:** current records may contain Date, typed arrays, undefined and other IndexedDB structured-clone values. The prototype intentionally rejects nonlossless JSON rather than silently dropping values. Inventory all tables and implement round-trip-safe codecs for every field with deterministic domain and financial validation. Data with unknown types fails closed.
3. **Read/write integration:** do not add async WebCrypto into live IndexedDB transactions; WebCrypto promises can cause auto-commit. Stage ciphertext before a short atomic write and use optimistic version/revision CAS plus Web Locks; decrypt after read. Rework all Dexie callers, migrations, staff operations, exports, sync and assistant reads so no old plaintext path bypasses enforcement.
4. **Migration:** on a disposable populated copy only, require a reselected and independently restore-verified encrypted backup. Freeze cooperating tabs and use an origin-wide exclusive lock. Encrypt into a **shadow** database; check counts, IDs, totals, per-table checksums and financial conservation after decrypting; journal source and target versions; atomically switch the active-storage marker only after full verification. On crash, leave original readable data intact under recovery control; never delete or overwrite it in a failed pass. Explicitly inspect old localStorage, assistant DB, caches and service-worker storage for residual plaintext. Demonstrate rollback; do not delete original plaintext until separate owner-approved evidence confirms recoverability.
5. **Keyring durability:** store wrapped keyring metadata transactionally with version/CAS, encrypted ledgers and recovery/backup metadata; test corruption, duplicate setup, interrupted key rewrap and recovery-code rotation. A reset must not orphan active ciphertext. Historical backup copies of the old wrapped keyring must be treated as credential-compromise exposures; replacing credentials only updates the current keyring. Test clean-device import from a verified package and every recovery path.
6. **Real-browser concurrency:** two-tab, tab killed during write, simultaneous sale/refund/inventory, refresh, browser storage eviction/quota, offline restart, Windows Chrome/Edge, macOS Safari, mobile PWA, and actual devices. No bypass via background POS, backup restore, login/logout, staff role change, multiple businesses or account switching.
7. **Independent security and release acceptance:** real CSP/XSS review, app permissions/tenant checks, export format compatibility, performance on low-spec Windows, full Node/pnpm/TS/browser/migration/regression CI, external backup restore and owner QA. Production databases, Vercel deployment, remote sync, payments and destructive data reset need separate approval.

## Proof and limits

Local Node 22 WebCrypto prototype: **8 focused test cases passed** for the equivalent local source before branch publication (including a lossless JSON guard and explicit handle revocation). The GitHub branch has its own tests and must pass exact-commit GitHub Actions independently; local results are **not** a claim of CI, IndexedDB integration, migration, browser UAT, or production readiness.

**Release decision:** ST24-05 OPEN. Do not auto-merge this PR merely because its isolated crypto tests pass. Data encryption is not active; current ledger remains plaintext at rest.


## Second development increment: encrypted inactive shadow copy

Added an independently named IndexedDB database, tallybook-st24-shadow-v1, **not** the active tallybook-db. The new library client/src/features/security/st24ShadowSnapshot.mjs:

- Accepts a bounded, already validated backup JSON text, an in-memory key handle, its matching wrapped keyring and owner passphrase. Challenges the wrapped key to prevent persisting ciphertext under the wrong DEK.
- Splits a maximum 8 MiB **pilot** backup into 192 KiB segments; encrypts each with AES-GCM and authenticated sequence; stores no plaintext record ID, customer data or raw file bytes in the shadow database. The encrypted manifest contains total length, hash and chunk count. The keyring and random snapshot identifiers are stored in unencrypted metadata (scope IDs and chunk counts may still be inferred).
- Stores all chunks plus a "prepared" snapshot record in one IndexedDB transaction. An interrupted transaction must leave no partial snapshot. After commit, reopens the shadow, authenticates and reconstructs every chunk and compares its exact JSON with the source in memory; only afterward marks the snapshot "verified". An interruption between preparation and verification is recoverable by explicitly supplying the original verified backup text again.
- Never deletes, alters or switches the source TallybookDB, the assistant store or active-storage markers. No automatic app startup or migration action calls this code.
- The bridge st24VerifiedBackupBridge.ts requires the currently selected company, a current staff permission check, a previously recorded verified backup receipt, byte-identical reselected v2 encrypted file, successful decryption, strict parseBackup relationship validation, and a second staff/company check. The bridge is **not connected to a UI or app entrypoint**; proof of off-device recovery is still a separate acceptance requirement.
- Pilot 8 MiB cap means large stores are explicitly rejected, not truncated. A real rollout needs streaming and device performance verification for the supported 64 MiB backup limits.
- Fake IndexedDB tests cover atomic preparation/readback, ciphertext inspection, corruption, mismatch between handle/keyring, wrong externally compared backup, recovery after the prepared state, missing Web Locks and oversize input. Browser tests cover real WebCrypto, IndexedDB persistence through reload and origin-wide two-tab lock refusal.

These are **migration rehearsals**, not active encryption. The original v39 Dexie ledger continues to store plaintext. The direct shadow API is an internal testing primitive; only the guarded bridge is a candidate for later owner-authorized UI integration. No independent customer-data migration, production key storage or clean-device recovery acceptance has occurred.

### Additional acceptance before activation

1. Add verified per-table structured-clone codecs, index and query redesign, and source/target reconciliation; an exported backup's JSON normalization is not a lossless substitute for Dexie storage semantics.
2. Demonstrate owner-reselected external backup restored on a second clean device, with shadow and main stores demonstrably isolated and count/amount conservation verified.
3. Exercise paused/crashed two-tab writers and keyboard/system interruptions; Web Locks are advisory and other retail write paths may not cooperate. Add explicit writer coordination and optimistic version checks.
4. Introduce intentional active-storage switch only after the owner has signed off on rollback, prior-data retention, multi-business authorization, Safari/mobile support and privacy review. Do not interpret an isolated shadow as signoff.

**Updated status:** ST24-05 PARTIAL SOURCE DEVELOPMENT / NO-GO. Exact-commit GitHub Actions must be inspected separately from local prototype tests. The source ledger has not been encrypted or migrated.
