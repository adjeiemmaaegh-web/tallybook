# Tallybook V19 — Durable cross-database company-clear continuation

**Date:** 11 October 2026. **Baseline:** `TALLYBOOK_V19_RESTORE_JOURNAL_CONTINUATION_2026-10-11_SOURCE.zip`; verified SHA-256 `3cbeab379c1901730290aa1fb0c55a30db106ff10d7305cfc34b82b510faff69`. **Release decision: NO-GO / INCOMPLETE.**

## Problem and implemented change

`clearCompanyData` previously removed scoped main-ledger data but did not remove the separate IndexedDB assistant workflow, alias and history tables. Deletion after a process interruption could leave orphaned assistant records. This increment extends the bounded `appMeta` assistant-preimage recovery journal from backup restore to company clear, using explicit operation `company-clear`; older version-one restore records without an `operation` remain compatible. Unknown operations fail closed.

The delete sequence now authorizes the actor and validates company existence; captures the scoped assistant preimage and stores the journal in the main DB **before** mutating the assistant DB; empties that company's assistant tables; then rechecks staff permission, active business, company existence and the exact journal marker in a single main IndexedDB write transaction. That transaction removes the company's records, its main assistant audit entries, profile, and stale active-company/last-backup metadata, **then deletes the marker atomically**. On failure, in-process recovery restores the assistant preimage; on restart, `DatabaseProvider` runs the same pending-journal recovery before reporting database readiness. Other companies' assistant and retail records are not intentionally modified. Company clear is destructive only when explicitly invoked with appropriate local authorization; no real customer data was touched during development.

Main-ledger historical financial records deleted by an approved company-clear action are not recoverable from the assistant preimage. An owner should export and separately verify a backup **before** authorizing a clear. The presence of a pending marker indicates the retail clear did **not** commit; marker absence after a successful commit indicates it did. The journal is bounded to 32 MiB serialized content and uses the existing schema 27; no migration is introduced.

## Verification and honest limitations

- Linux Node 22.16.0 / OpenSSL **259/259 native tests passed**, zero failures/skips; adds **four** pure tests (operation compatibility, rejection and resource/ownership constraints). Command and output retained in `artifacts/continuation-2026-10-11-company-clear/native-full.log`.
- Isolated mock payment gateway **4/4 passed**. TypeScript syntax parse of the modified `.ts` files passed.
- **Four Dexie/Vitest client integration tests were added but NOT EXECUTED**: interrupted clear/reopen rollback, successful cross-company clear/assist audit isolation, active journal blocking, and failed main-ledger deletion rollback. Existing client restore tests also remain unexecuted. Pinned Node 24/pnpm, dependencies, semantic TypeScript checks, client tests, bundle builds and Playwright were not available in the isolated environment. These are not claimed as passing.
- Cross-tab assistant writes are not blocked by a global mutual-exclusion protocol, so a write concurrently racing journal capture/restore remains an open data-loss risk. Multi-tab, quota pressure, actual process termination, partial journal recovery, and complete historical migration matrix remain unverified.
- Main `assistantAudit` records remain intentionally omitted from backups and removed during company clear; no owner-approved audit retention/export policy exists. **DATA-002 remains open. DATA-004 is only implemented-unverified.**

## Next execution priorities

Run pinned client Vitest, semantic TS and production/browser tests. Verify actual interruption at every phase and multi-tab coordination, choose and implement assistant audit retention rules, exhaustively verify authorization, then implement real partial refunds with provable FIFO/batch/receipt/tax/debt/tender conservation. No payment provider, hosting, staging, external deployment or release approval is inferred from this local continuation.
