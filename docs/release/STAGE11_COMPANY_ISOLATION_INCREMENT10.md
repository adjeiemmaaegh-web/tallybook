# Stage 11 company-isolation correction — Increment 10

**Date:** 2026-10-24 00:32 +04:00  
**Baseline:** verified Increment 9 source snapshot  
**Status:** source remediation in progress; release remains **NO-GO / INCOMPLETE**.

## Scope and evidence boundary

The review continued the approved owner direction to develop locally through Stages 2–12 while deferring Windows, macOS, Android, iOS and browser-specific acceptance until the end. It did not publish or deploy the changes and did not perform payments, provider configuration, customer communication, or any other external action.

A read-only, 11-domain audit considered company identity at service read/write boundaries and the UI refresh path. The exact race tests added in this increment use the production `TallybookDB` schema and Dexie transactions with the configured IndexedDB test adapter. These tests are not real-browser or physical-device evidence. The audit did not prove every path safe and does not certify security.

## Implemented in this increment

- Customer debt, repayment-target and retention reads reject results when the active company changes while Dexie reads are pending; loyalty policy/points writes revalidate company identity inside their transactions.
- Sale reversal preparation and posting reject stale-company work. The assistant period-sales reader now checks the captured company around its awaited reads.
- Supplier payable reads, recognition and settlement revalidate company scope; idempotent returns are covered by the existing service integration suite.
- Inventory catalogue option updates, stock-count preview/session/post paths, CSV import and batch registration now revalidate company scope before/after awaited reads and writes. `InventoryPage` clears and render-gates stock-count state, rejects stale async count results, and avoids installing a snapshot returned for a company that is no longer active.
- Store creation/assignment, transfer request/cancellation and physical-count observation paths now assert the captured company around transaction boundaries. Two-company Dexie regressions verify transfer and observation rollback on a mid-read switch.
- Mobile Money provider service reads and writes reject stale-company results/commits; a Dexie hook test covers a switch during provider enumeration.

## Verification

Pinned environment: Node 24.19.0, pnpm 10.34.0, Vitest 4.1.11, Linux x86_64.

- Focused regression batch: **32 tests passed across 6 files**; later profile/isolation rerun: **22/22 across 2 files**.
- Additional store and company-isolation batch: **19 tests passed across 2 files**.
- TypeScript `pnpm check`: passed.
- Full Vitest suite after the profile-save change: **808 tests passed across 99 files**.
- Production PWA/frontend and server build: passed. Existing warnings remain for dependency annotation comments and the >500 kB main JS chunk.
- Native Stage 1 policy/schema tests: **13/13 passed**.
- Stage 1 gate runner: **9 PASS, 0 FAIL, 0 BLOCKED** executable gates; `stageAccepted` remains **false** because Windows browser-recovery evidence is absent.
- Full runner JSON and runtime record are under `artifacts/stage11-company-isolation-increment10/`.

## Findings still open

This increment is deliberately partial. Do not close `SEC-001`, `SEC-004`, `DATA-001`, `DATA-002`, `DATA-011`, or `DATA-012` based on these tests.

1. The wider Stage 11 audit and regression matrix is incomplete. Expenses, purchasing, reports, staff, backup/integrity pages and several assistant/customer screens still need stale-result fencing or company-tagged UI state and direct service-boundary review. Company-settings now has a fail-closed expected-company service contract with Dexie stale-target and transaction-switch tests; a page-level UI timing test and adjacent settings/provider flows remain open.
2. `clearCompanyData`, recovery-journal coordination, assistant/main database crash atomicity and origin-wide multi-tab behavior need failure/reopen tests in real browsers. This increment does not expand DATA-002 coverage.
3. Store and inventory mutation coverage is selective. New race tests cover stock-count/catalogue/batch operations and store transfer/count writes, not every role/session transition, cross-tab lock contention, UI page or direct/raw IndexedDB writer.
4. Run migration, backup/restore, offline/reopen, responsive/browser, dependency/license, and device checks in the owner-deferred final verification phase. None is claimed passed here.
5. Remaining Stage 2–12 finance, recovery, authorization, cloud/store, assistant, payments/public-commerce and operations requirements remain governed by `blockers.json`, `traceability.json`, and the approved continuation plan.

## Next local work

Continue Phase B’s manual service-boundary and UI refresh audit, prioritizing stale Company-settings writes, report/staff/backup/integrity result fencing, and transaction-level coverage for every mutation family. Keep statuses open until their full acceptance criteria—not just a selected race regression—are evidenced. Then continue the dependency-ordered source work in `STAGE2_12_CONTINUATION_PLAN_2026-10-23.md`.
