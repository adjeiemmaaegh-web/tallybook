# Tallybook V19 — Run 7 whole-run development: Cross-IndexedDB atomicity, crash journals and cross-tab recovery

**Date:** 2026-10-16  
**Base:** V19 Run 6 draft PR #18 head `23b06f9f6fb5b94cc4441f3ce83f7ca3037d7bab`  
**Development branch:** `v19/run7-cross-db-recovery-20261016`  
**Disposition:** Run 7 source increment authored and committed for review; **ACCEPTANCE NOT PASSED**, V19 release **NO-GO / INCOMPLETE**.

## Owner cadence and release boundary

Follow the owner's explicit full-run development cadence: develop the entire run's source as one increment without blocking further code on unavailable external runners, but preserve true acceptance and risk evidence. Do not deploy, merge `main`, enable payments/cloud sync, mutate live Supabase or claim Windows/browser crash-proof operation.

## Pre-existing foundation confirmed

- Durable `restoreRecoveryJournal` stored in the main ledger **before** assistant changes, with recorded assistant preimage and exact allowed postimage.
- Company clear and restore use an origin-wide **exclusive** Web Lock; cooperating assistant and many retail writers use the matching **shared** lock.
- The assistant rewrite uses a compare-and-swap check **inside its IndexedDB write transaction**; retail restore/clear removes the durable marker atomically with the main-ledger commit.
- `DatabaseProvider` calls `recoverPendingBackupRestore()` before it declares local database readiness. Unknown assistant postimages fail closed and leave the journal for manual reconciliation.

These mechanisms existed before this increment and are not misrepresented as newly invented or independently verified.

## Run 7 changes committed

1. `client/src/features/backup/run7RecoveryDecision.mjs` is a deterministic state classifier incorporated into the actual `restoreRecovery.ts` startup path. Exact preimage means clear the durable marker; exact authorized postimage means restore its preimage under existing assistant transaction CAS before removing marker; any other third-state, invalid operation or legacy marker without sufficient postimage evidence **fails closed**, leaving both stored data and journal intact. Existing `unexpected assistant edits` diagnostic wording preserved.
2. `createBackup()` now holds the **exclusive** two-DB origin Web Lock across the main retail read transaction and all assistant workflow/alias/history queries. It also checks the company after reads, revalidates staff authority and checks the recovery marker before returning. Backups are now refused without browser Web Locks rather than silently asserting consistency across two mutable databases. The source-only/isolated test runs do **not** prove true cross-browser atomicity or that all existing writers observe this advisory lock.
3. Export bookkeeping `recordBackupExportedAt()` now runs under a shared Web Lock and atomic local metadata transaction. It validates the **exact business ID from the exported file**, checks company still selected/existing, staff authority and absence of a sticky recovery marker, and rejects a switched-company or conflicting restore. `BackupPage.tsx` explicitly supplies that captured exported-company ID rather than attributing an earlier file to the currently active company. The saved timestamp remains an **export-attempt receipt, not proof that a file was actually retained off-device or can be restored**.
4. `run7RetailWriteBarrier.mjs` adds a strict, typed, read-only check for `restoreRecoveryJournal`. Added `appMeta` to the same IndexedDB `rw` scope and fail-closed marker check **before mutation/idempotency replay** for: complete sale, purchase, expense, customer repayment, prepaid wallet transfer, full-sale reversal, cash partial return, supplier payable recognition/settlement, three supplier-master writes, all five base inventory catalogue/stock writes and five Stage 2 inventory/catalogue/count writes. This transaction-bound read serializes with recovery-marker writes even for some existing legacy writers that do not acquire the shared Web Lock.
5. All existing financial and stock event semantics, receipt numbers, posted balances, ownership rules and persisted schema are unchanged. `DATABASE_SCHEMA_VERSION` remains 28; no schema migration, extra database, payment action or cloud replication.

## Regression tests authored

- `client/src/features/backup/tests/run7RecoveryDecision.test.mjs`: **12** focused cases for crash before assistant write, crash after assistant commit, company clear, legacy marker, row order, unknown/interleaving edits, corruption, cross-tenant assistant marker, serialization and deterministic replay.
- `server/tests/run7LockCoordination.test.mjs`: **11** cases exercising mocked competing-tab exclusive/shared origin locks, conflicts, unsupported browser behavior, nested Dexie calls and lock release on failure.
- `client/src/features/backup/tests/run7RetailWriteBarrier.test.mjs`: **7** cases for healthy, corrupt/present/absent markers and IndexedDB metadata read failures.
- `server/tests/run7WritePathAudit.test.mjs`: **8** static source-contract cases checking main critical financial/stock write guards, backup exclusive lock and marker checks, switched-company export metadata and recovery classifier composition.
- These **38/38** committed native-style test cases were executed using an **isolated V8 compatibility harness**, fetching source blobs from the Run 7 branch and injecting simulated Node assertions, Web Locks, source file reads and UTF-8 byte counting. **Not native Node `node --test`, real IndexedDB, Chromium, CI, Windows, or a production crash.** The 12+11 and 7+8 groups ran in separate checks.
- `client/src/features/backup/run7Consistency.test.ts`: **5 authored, unexecuted** browser/IndexedDB tests for coherent backup lock, concurrent tab, exact company export attribution and sticky journal.
- `client/src/features/backup/run7PostingBarrier.test.ts`: **6 authored, unexecuted** saved-data/IndexedDB tests for pending-journal sale/purchase/expense/repayment/stock failures and journal preservation.
- `client/src/features/backup/run7CrashStages.test.ts`: **5 authored, unexecuted** IndexedDB reopen/recovery stages, foreign intervening edits and company clear rollback.
- Existing `client/src/features/backup/restoreRecovery.test.ts` and `backup.test.ts` must be rerun; source changes preserve old fail-closed error wording. No actual IndexedDB/Chromium runs executed in this increment.

## Mandatory deferred acceptance — release blockers

1. Run pinned Node 24 and pnpm full native and client suites including all **16** new Vitest/IndexedDB cases, repository TypeScript `pnpm check`, Vite build, Playwright, audit and exact-head GitHub Actions; fix source or test failures and rerun. A mock-only 38/38 is not a PASS.
2. Real Chromium/Firefox/WebKit and low-spec Windows: multiple tabs, simultaneous assistant and retail writers, Web Locks contention and tab suspension, tab crash after marker/before assistant write, after assistant commit/before main commit, after main commit, power loss, corrupt/stale/legacy markers, virtual-cloned data, storage full/quota, interrupted browser update and failed local reset. Verify no data loss across companies and proof of preserved journal on ambiguity.
3. **Advisory-lock coverage remains incomplete.** Raw IndexedDB writes and any retail path not explicitly checked/locked can still interfere; exhaustively audit all actual write paths (e.g. direct backup metadata, sync, commerce, assistant internals, staff permissions and auxiliary stores), add guards and exercise cross-tab races. Do not claim complete multi-DB serialization until independently verified.
4. **No-Web-Locks browsers:** ordinary offline ledger use is preserved where existing logic allowed, but two-DB restore/clear and now backup export refuse operations. Confirm clear supported-browser messaging and operating requirements. Unsupported device access must never silently overwrite assistant state.
5. The exported backup includes readable business records unless explicitly encrypted; credential-containing staff backups already require encryption in the UI. Review portability, backup encryption, restore acceptance and kept-file confirmation in **Run 8**. The metadata timestamp does NOT prove physical download or independent recoverability; company clear still needs an independently reviewed backup-retention policy.
6. Existing marker is a single global retail metadata key; compare-and-swap and begin protocol protect it, but unexpected external writes can still require manual owner recovery. Never auto-delete corrupt evidence, infer preimages or apply a side-effecting SQL migration.
7. Historical **47 blockers / 82 acceptance units** unchanged by this source increment. V19 Run 1 historical PASS belongs to its pinned SHA only. V19 Runs 2, 3, 4, 5, 6 and 7 **NOT PASSED**; Stage 9 and whole-release critical gates open.

## Next development increment

**V19 Run 8 — migration, encrypted backup portability, restore/rollback and Windows/browser recovery drills** under the owner's whole-run *coding* cadence, with Run 7 and earlier acceptance blockers still open. No live deployment or payment authorization granted.
