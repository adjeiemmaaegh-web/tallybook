# Stage 1 Increment 8 — Dexie Integration & Transaction Isolation

**Date:** 2026-10-23  
**Engineering status:** Requested sandbox engineering work completed; automated gates pass.  
**Stage 1 acceptance:** **NO-GO / NOT ACCEPTED** until Windows 11 browser recovery is executed and signed off.

## What changed

- Added automated integration coverage for the Stage 1 candidate audit against the actual application `TallybookDB` schema (schema v28) using Dexie and the configured IndexedDB test adapter. The tests verify a readonly Dexie transaction, a clean ledger, corrupt references/unsafe money, repeatability, no data mutation, and fail-closed behavior on an unreadable table.
- Added production-path company-isolation integration tests for scoped customer, sale, inventory, supplier, purchase, expense, and staff reads; foreign-company sale/customer/stock/purchase/repayment/refund/staff operations; and transaction rollback when company context changes during expense, sale, purchase, repayment, or refund posting.
- Fixed expense posting to capture one company ID and use it consistently for the record, permissions, shift, and audit context inside a single Dexie transaction. Previously, it could tag an expense using the newly selected company after asynchronous work while retaining the old staff/shift context.
- Added stale-company checks at transaction entry and before/after critical writes in sales, partial cash returns, repayments, purchases, supplier mutations, and customer archival. A company change now throws inside the write transaction so Dexie rolls back the whole operation.
- Updated the Stage 1 runner to execute the two new integrations and account for their evidence separately from Windows recovery. Added gate-policy regression tests and prepared a Windows manual acceptance checklist.

The candidate audit remains a diagnostic/test module, not a new user-facing feature or an automated repair path. No remote systems, payments, deployment, commits, or pushes were used.

## Verification

Toolchain: Node `24.19.0`, pnpm `10.34.0`, Vitest `4.1.11`, TypeScript `5.6.3`.

| Check | Result |
|---|---|
| Full Vitest | **PASS** — 98 files, 784 tests |
| TypeScript no-emit check | **PASS** |
| Production Vite frontend build | **PASS** |
| Production esbuild server bundle | **PASS** |
| Final Stage 1 runner | **9 PASS / 0 FAIL / 0 BLOCKED**; automated Dexie and transaction-isolation evidence present |
| Dexie integration | **3/3 PASS** |
| Transaction company-isolation integration | **8/8 PASS** |
| Gate-policy tests | **10/10 PASS** |
| Local production server smoke | **PASS** — root page and built JavaScript asset returned HTTP 200 |
| Windows 11 Chrome/Edge offline, backup/restore, corruption, interruption, multi-tab recovery | **NOT RUN** — required manual gate remains open |

The automated Dexie integration uses the actual `TallybookDB`/Dexie schema and transactions with the configured IndexedDB test adapter; it is **not** real-browser or Windows persistence evidence. The Vite build reports a large JavaScript chunk and non-fatal dependency annotation warnings; both frontend and server builds completed successfully.

## Remaining acceptance work

1. Run and document each case in [STAGE1_INCREMENT8_WINDOWS_ACCEPTANCE.md](STAGE1_INCREMENT8_WINDOWS_ACCEPTANCE.md) on Windows 11 Chrome or Edge using an isolated profile and synthetic data.
2. Do not change Stage 1 status to accepted until all Windows recovery cases pass with retained evidence. A blocked/unavailable case is not a pass.
3. Before any future GitHub integration, compare this working copy with the then-current remote branch; no branch or HEAD was verified and no commit/push is authorized here.

## Source provenance note

The uploaded archive's SHA-256 is `56b0002e5c9f3976a4d5cea01de1a14bcf6ea1969acb7844c5eefb5a5fd52366`. The archive's 857 files match every entry in its embedded `HANDOVER_PACKAGE_SHA256.json`, but that embedded manifest names a different input archive and records SHA-256 `2ab92e687d8f7409780527b7221f5cbb98bebdda5651e30d94ad5be08f008f92`; the root `HANDOVER.md` also names a distinct earlier archive/hash. Increment 8 records the exact uploaded archive hash as its baseline and preserves the discrepancy rather than rewriting historical provenance.
