# Tallybook Stage B — Offline Integrity, Privacy and Finance

**Date:** 2026-11-06  
**Source base:** `0314873bf0f7e30ad8612b51be77f0a5107612d0`  
**Draft branch:** `stage-b-offline-integrity-20261106`  
**Review:** [PR #26](https://github.com/adjeiemmaaegh-web/tallybook/pull/26)  
**Release status:** **NO-GO / NOT ACCEPTED. NO MERGE, SQL MIGRATION OR DEPLOYMENT.**

## Engineering work on the draft branch

1. **Transactionally durable shared-shop outbox** — Dexie/IndexedDB per-sale writes, account/company scoping, preserved idempotency keys, no-network-before-durable-write, atomic queue operations, quarantined unsafe legacy entries, detected corruption/blocked storage, and safe duplicate-key reconciliation.
2. **Protected shared-shop pending sales (opt-in)** — `client/src/cloud/shopOutbox.ts` integrated with `shopVaultCrypto.mjs`. An empty queue can be protected by a user passphrase. New pending sales are AES-256-GCM encrypted with account/business/submission-key binding, a randomly generated nonce, and memory-only nonextractable keys. Locked queues cannot send or reveal saved sales. Leaving the Sell panel clears the key.
3. **Encrypted recovery** — portable encrypted-only JSON export and same-account/company import into an **empty** target; passphrase and every ciphertext validated before a single atomic IndexedDB restore. No silent merge or deletion. See [Stage B vault recovery protocol](STAGE_B_VAULT_RECOVERY_PROTOCOL.md).
4. **Privacy controls** — strict allowlist of offline product/store/stock display fields, no cached customer/staff/payment references or persisted owner privileges; discard cached private data when redaction cannot be written.
5. **Company-specific refund rules** — **UNAPPLIED** `supabase/migrations/20261106120000_shared_shop_return_policies.sql` with default OFF, per-company append-only revisions, original sale-time rules, server-side owner policy enforcement and refund evidence. Refund UI clarifies card/MoMo payout is external, not automatic.
6. **Test coverage** — Vitest/fake IndexedDB, PGlite/PostgreSQL-in-process refund/financial tests, native WebCrypto, typed client/build, and real Chromium IndexedDB/reload/two-tab verification.

## Verified evidence

- **Stage B focused QA SUCCESS:** [GitHub Actions run 42177920338](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42177920338), commit `3ac1a17a87ac095bc07fdc7413553175dd9373dc`. Successful queue/privacy UI tests, native vault crypto, PGlite finance/refund-policy tests, TypeScript check, Vite/server build, and **real Chromium** reload, unlock, original-key resend, two-tab distinct-sale persistence and same-key tampering refusal.
- Earlier focused run [42176962972](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42176962972) also passed. One earlier browser attempt timed out starting its test web server; corrected to launch Vite directly with diagnostics before the passing run.
- Production Supabase migration list checked on 2026-11-06 still ends at `20261105120712`, so the Stage B policy migration is **not live**.
- Supabase advisors: leaked-password protection OFF; two security-definer RPC warnings requiring independent authorization audit; 22 RLS-enabled/no-direct-policy notices (may reflect deliberate RPC-only access). No production security setting changed.
- Broader historical release validation still reports browser/auth/offline fixture failures and dependency advisories; the focused Stage B workflow does **not** establish full release readiness.

## Stage B acceptance register

| Gate | Source state | Evidence status |
|---|---|---|
| B1 Durable offline sale submission/retries | Implemented for cloud shared shop | Focused Vitest and real Chromium pass. Crash/quota/hardware QA open |
| B2 Encryption, migration and recovery | Opt-in encrypted shared-shop queue + portable encrypted restore implemented | Browser recovery pass; **local device ledger/catalogue encryption absent**, backup-first atomic legacy nonempty plaintext queue migration implemented on draft branch; physical crash/quota/restore acceptance pending |
| B3 Company-level refund policy | SQL migration/UI and PGlite tests authored | Isolated SQL tests pass; **production migration unapplied** and owner staging review required |
| B4 Financial conservation and rollback | Existing code + focused refund/PGlite regressions | Focused pass, comprehensive independent finance/payables/reversal audit open |
| B5 Security/authorization | Scoped keys, role-safe cache and server checks | Security definer/RLS/Auth and physical cross-account revocation QA open |
| B6 Full acceptance | Focused pinned CI and real Chromium pass | Broad browser, dependency, two-device and physical acceptance **NOT PASSED** |

## Additional draft engineering, 2026-11-06

- `client/src/cloud/shopOutbox.ts`: explicit existing-plaintext-queue encryption, with *required* encrypted-only pre-migration recovery file, account/company/passphrase authentication, record-for-record snapshot checks, pre-commit encryption self-check, and atomic IndexedDB replacement plus vault-descriptor installation. New sales recorded after the backup invalidate migration rather than being silently omitted.
- `client/src/cloud/ShopOutboxVaultPanel.tsx`: owner-facing two-step workflow requiring download and re-upload of the encrypted recovery file. Ordinary checkout and new vault setup do not automatically migrate preexisting financial records.
- `client/src/cloud/shopOutbox.test.ts` and `qa/browser-stage-b-vault.spec.mjs`: new migration, rejected-transaction retention, stale backup refusal and Chromium offline reload replay regressions.
- The separate device-local ledger remains unencrypted at rest. Existing outstanding sales are not touched by merely installing this branch; the conversion requires explicit user action.
- **Acceptance still requires passing exact-head CI, simulated crash/quota failures, real-device backup restore, independent security and financial review.**

## Safety and next development requirements

- Design and implement safe **encryption of the separate device-local business ledger and other sensitive offline working data**. No unsupported transparent rewrite of existing financial records.
- Provide owner-reviewed migration/recovery from nonempty plaintext queues, with backup integrity, rollback, storage pressure, browser eviction and power-loss drills. Present vault encryption clearly in first-time setup rather than burying it in POS.
- Independently audit all sale/refund/stock/credit/tender/repayment/payable paths and their company-staff authorization.
- Resolve external production security and dependency advisors through authorized procedures.
- Complete full repository browser acceptance and physical two-device shop validation before commercial release or production adoption.
- Keep PR #26 draft; **no production DB migration, payments, merge or deployment without owner authorization**.

**Conclusion:** The focused encrypted-queue source increment is implemented and tested, including real Chromium. **Stage B as a whole remains OPEN / NO-GO**, particularly the separate local ledger encryption and full acceptance gates.
