# Tallybook V19 — Durable backup-restore preimage increment

**Date:** 11 October 2026. **Source baseline:** `TALLYBOOK_V19_RECEIVABLE_AUDIT_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `1a32b49d9077942be209c746e3a96ab8d8f7723f13470f33fc5f1150599bf607`. **Decision:** **NO-GO / INCOMPLETE**.

## Problem, design and local change

The existing backup restore applies assistant workflow, alias, and history records in a *different IndexedDB database* from the retail ledger. The previous in-memory compensation attempts to restore the assistant records when the ledger transaction fails, but does nothing after browser/process termination between these commits.

This continuation adds a **durable assistant preimage journal in the main database's existing `appMeta` table**. Before writing the assistant snapshot, restore captures the existing assistant rows and stores an ownership-validated, bounded, versioned journal record. An assistant-only commit followed by a crash leaves the journal pending. The retail restore transaction includes deletion of that exact journal record **in the same IndexedDB transaction** as the ledger changes; a durable absence indicates the retail restore committed. During app startup, `DatabaseProvider` checks and replays a pending preimage before announcing database readiness. Retry after a second interruption is idempotent. Corrupt, oversized, cross-company or clashing records **stop recovery** rather than fabricating a completed restore. Restore, backup export and company clear are blocked while the journal is pending; backup imports cannot inject a journal marker.

The marker's supported phase is `assistant-preimage-durable`, followed by **atomic removal on ledger commit**. The marker has a conservative 32 MiB maximum serialized size. Restore will reject an assistant preimage over this bound without first editing assistant data. No change to schema version 27 or backup format version 1 is needed because `appMeta` already stores keyed metadata. No historical records are backfilled or rewritten except during explicitly requested restore/recovery.

## Verification performed

- Native Node 22.16.0 / Linux OpenSSL QA **255/255 passed**, zero failures or skips, including five new pure journal validation tests. See `artifacts/continuation-2026-10-11-restore/native-full.log`.
- Separate mock gateway **4/4 passed**. See `artifacts/continuation-2026-10-11-restore/mock-gateway.log`.
- Changed TypeScript/TSX files syntax-parsed with available TypeScript compiler API. This is **not** semantic type-checking, a bundled build, or a client test pass.
- Four Dexie/IndexedDB restore/reopen/invalid journal tests were **written but NOT EXECUTED**, because package dependencies and pinned Node24/pnpm remain unavailable. Real-process interruption, low-quota conditions, browser lifecycle, complete app migration and multi-tab races were also **NOT RUN**.

## Explicit scope limits and next work

This increment is a safety improvement **only for cross-database backup restore**; it is not completed full data recovery. `clearCompanyData` is now *guarded* against a pending journal but still lacks its own coordinated assistant-data deletion/recovery protocol. Other assistant writes can race across tabs with snapshot capture and have not been exhaustively locked. Historical assistant audit retention and inclusion in backups remain unresolved. The marker provides ordinary IndexedDB durability, not a cryptographically tamper-proof audit. A device with a corrupt journal must preserve its data for support and must not delete the marker manually. A quota-limited 32 MiB preimage cannot be auto-restored under this design.

Before closing `DATA-002`, run the full pinned client suite, test real IndexedDB crash/reload at each journal phase and after ledger commit, include multi-tab and quota failure cases, define and implement clear + audit retention, run the browser/migration matrix, and independently reconcile every affected table. Partial refunds and external gates remain open. **No external deployment, staging, real payments, provider provisioning or device changes were authorized or executed.**
