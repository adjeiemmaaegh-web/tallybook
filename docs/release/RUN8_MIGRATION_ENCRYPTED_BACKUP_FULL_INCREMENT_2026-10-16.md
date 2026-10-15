# Tallybook V19 — Run 8 full development increment: Migration, encrypted backup and restore assurance

**Date:** 2026-10-16  
**Starting source:** V19 Run 7 draft PR #19, SHA `ccb03e864d24917f6f1edcaeb322b8ebb9bd3e0e`  
**Development branch:** `v19/run8-migration-backup-recovery-20261016`  
**Status:** Run 8 **source-development increment delivered for review**. Run 8 acceptance **NOT PASSED**; V19 commercial **NO-GO / INCOMPLETE**.

## Owner's operating constraints

Complete one full V19 run's source development each increment, logging unavailable native/browser acceptance instead of blocking future code. This changes development pacing, **not** acceptance or release standards. No live Supabase changes, payment/provider integration, remote sync, cloud data movement, installed customer program mutation, `main` merge, staging or deployment were authorized or performed.

## Prior code inspected and retained

Portable v1 Tallybook local backup had schema version 28, size-limited plain JSON import, extensive sale/stock/currency/receivable/supplier reconciliation, opt-in PBKDF2-SHA256 AES-256-GCM encrypted-v1 exports, and assistant preimage crash recovery using an exclusive origin Web Lock. Run 7 added cross-database backup locking, exact-company export attribution, and transaction-level recovery barriers. All current business data still lives offline in IndexedDB.

## Delivered Run 8 source

1. **Historical schema migration without invented financial records.** `run8BackupCompatibility.mjs` centralizes the exact introduction thresholds for the 39 portable record tables, preserving old-version absence only **before** each table existed. At/after introduction, an omitted table fails preflight; unknown future tables fail rather than being silently dropped. `backup.ts` verifies alignment with the actual active record table order and applies the normalizer before financial relationship checks. Existing v28 ledger format and `DATABASE_SCHEMA_VERSION=28` are unchanged; no upgrade transaction or mass data rewrite was added.
2. **Ambiguous/malformed JSON fails closed.** `run8JSONPreflight.mjs` adds a linear lexical validation ahead of `JSON.parse` to reject duplicate money/company keys (including escaped-equivalent field names), unsafe object property names, trailing/malformed JSON, nesting beyond 48 and more than 1,500,000 JSON values. The existing 64 MiB plain and 96 MiB encrypted file ceilings remain. Unknown top-level fields and missing/unknown assistant tables also fail, instead of entering a partial restore.
3. **Encrypted v2 for all new exports.** `backupCrypto.ts` now generates `tallybook-encrypted-v2` envelopes with AES-256-GCM, random 16-byte salt and 12-byte IV, fixed PBKDF2-SHA256 **310,000** iterations, and authenticated v2 format/KDF/cipher header as AES-GCM additional authenticated data. `run8EncryptedEnvelope.mjs` enforces fixed parameters, exact metadata keys, fixed nonce/salt lengths, canonical base64 ciphertext, bounded tag/length, no unknown encrypted future kind or plaintext downgrade. Historical genuine encrypted-v1 remains **readable** with its original decryption profile, not produced by new export. PBKDF2 and 12-character minimum are not independent password strength assurance; offline brute-force risk and low-spec CPU timing need security/hardware review.
4. **No optional readable new backup.** `BackupPage.tsx` requires a passphrase for every new export, even businesses without enrolled staff; older readable JSON files still import only following an explicit privacy warning. Decrypted files are schema/reconciliation-validated before being offered for destructive restore. Starting a second import clears any earlier pending restore candidate, including cancel/failure paths.
5. **Verified file receipt rather than click-only backup status.** A new SHA-256 receipt is constructed from the locally prepared encrypted file. The user must reselect that exact downloaded file, re-enter the passphrase, successfully decrypt and validate the complete backup, and match company and creation time **before** `recordBackupExportedAt` records an authorized receipt. `run8BackupFileReceipt.mjs` never stores decrypted data or passphrase in the receipt. App metadata `verifiedBackupReceiptV2` holds the canonical company, SHA-256 fingerprint, export creation date and verification date. Legacy `lastBackupAt`/`lastBackupCompanyId` timestamps alone are now **untrusted for readiness**; getters validate the new exact-shape receipt. No IndexedDB table upgrade is required because appMeta already keys arbitrary metadata rows; the AppMeta TypeScript key union was extended.
6. **Invalidate old proof after replacement/clear.** Successful retail backup restore atomically deletes the verified receipt, preventing prior data from being represented as an already verified backup of the restored ledger. Company deletion atomically deletes a receipt for that company, preventing a recreated company ID from inheriting stale proof. The integrity-checked receipt is **not a cryptographic signature of all subsequent device mutations**; after a later new sale/purchase it does not establish a fresh full-ledger backup. Company clear recency and a reliable off-device retention/recovery gate remain explicit acceptance blockers.
7. **Retain Run 7 atomicity.** Restore still uses the exclusive origin lock, assistant snapshot journal preimage and postimage, compare-and-swap rollback, and main-ledger transaction commit marker. New decrypt/JSON/compatibility checks happen **before** the journal and before any financial mutation. The record replacement and untrusted/legacy sync consent behavior remain as before.

## Test additions and actual evidence

**Executed against the committed source in the isolated V8 compatibility runner: 62/62 passed**, comprising:
- `run8BackupCompatibility.test.mjs`: **12** version/table migration cases.
- `run8EncryptedEnvelope.test.mjs`: **10** strict v1/v2 envelope cases.
- `run8BackupFileReceipt.test.mjs`: **9** file-reselection identity/hash cases (synthetic digest).
- `run8JSONPreflight.test.mjs`: **10** duplicate/corrupt/depth cases.
- `run8VerifiedReceipt.test.mjs`: **8** receipt parsing/legacy rejection cases.
- `server/tests/run8BackupIntegrationAudit.test.mjs`: **13** static source-contract cases.

These checks used fetched GitHub source blobs and simulated assertions, digest and filesystem reads. **They are NOT native Node `node --test`, real browser WebCrypto, live IndexedDB, Windows, semantic TypeScript, Vite build, Playwright, genuine file download, full CI or hardware fault testing**.

**Authored but UNEXECUTED browser/IndexedDB/Vitest: 20 new cases:**
- `run8CryptoPortability.test.ts` **6**: WebCrypto authenticated v2, tampering, genuine v1 backward decryption, SHA-256 reselect.
- `run8MigrationRestore.test.ts` **8**: v9/v27 compatibility, missing v28 records, unknown money/root/assistant tables, foreign-company child and simulated retail rollback.
- `run8VerifiedMetadata.test.ts` **6**: legacy old timestamp ignored, valid receipt, corrupt proof, proof revoked on restore and company clear.
Existing `backupCrypto.test.ts`, `backup.test.ts`, `restoreRecovery.test.ts`, Run 7 consistency and crash tests require full rerun. Existing backup and Run 7 expectation fixtures were updated to supply explicit test-only receipt hashes in positive verification paths; no native tests were executed.

**Windows QA materials (UNEXECUTED):**
- `scripts/RUN8_WINDOWS_READONLY_QA.cmd` checks for existing Node **24.19.0** and pnpm dependencies, runs Run 8 native source contracts, selected Vitest, `pnpm check` and local build; captures logs under `run8_qa_logs`. It does **not** install dependencies, delete live data, launch browser profiles, change Supabase or deploy.
- `docs/release/RUN8_WINDOWS_BROWSER_RECOVERY_DRILL_2026-10-16.md`: exact 24-scenario disposable Windows/browser matrix for v1/v2/legacy/unknown imports, file-reselect, cross-company attribution, missing/foreign/duplicate records, corrupt/enormous JSON, cross-tab locks, crash stages, quota failures, profile reinstall, saved-ledger reconciliation and independent restore.

## Mandatory open blockers before Run 8 acceptance and commercial release

1. Run pinned Node 24/pnpm native 62 cases, all 20 new real IndexedDB/WebCrypto tests and existing full test suite, semantic TypeScript `pnpm check`, Vite production build, Playwright, true supported browsers, low-RAM Windows and exact-final-SHA GitHub Actions. CI on Run 7 repeatedly failed pre-execution with zero job steps; no green CI proof carries forward.
2. **Independent real-file validation:** verify an actual retained encrypted file outside the source browser, passphrase recovery and restoration into a second *disposable* Windows/browser profile. Re-selecting a file in the original browser proves only byte-matched local verification, not survival of disk loss, off-device retention, or recovery after hardware theft.
3. **Data freshness:** a previously verified file may predate subsequent retail mutations, and current company-clear permission checks do not derive a live full-ledger revision or retained-file freshness guarantee. Before commercial release add an authoritative full-ledger revision/digest and require a fresh independent restore rehearsal, rather than treating a historical verified receipt as current-data coverage.
4. **Exhaustive write locks and power loss:** Run 7 advisory lock participation remains incomplete across raw/legacy IndexedDB writers. Verify real multi-tab races, journal crashes before/after assistant and retail commit, storage quota aborts and failure of corrupted recovery evidence. Never overwrite unknown third-state edits or delete recovery markers automatically.
5. **Security review:** offline passphrase guessing, PBKDF2 310k work factor on 8 GB low-spec CPU-only Windows baseline, large 64/96 MiB allocations, multiple files, Unicode/surrogate edge cases, duplicate-key parser conformance and crypto metadata tampering. No external independent cryptographic review was executed.
6. Historical 47 blocker statuses and 82 acceptance units remain unchanged pending exact-head evidence. V19 Run 1 remains historically accepted only at its pinned original SHA. V19 Runs **2–8 NOT PASSED**, Stage 9/overall release **NO-GO**.
7. No live application/customer data, payment gateways, cloud finance sync, deployment, original `main`, or Supabase production schema were modified.

## Next authorized *development* increment

V19 **Run 9 — inventory costing and reconciliation**, continuing from the exact Run 8 review head if the owner says `Proceed`. Do not conflate this with passing Run 8 acceptance.
