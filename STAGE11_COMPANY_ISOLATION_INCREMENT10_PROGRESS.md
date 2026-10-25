# Stage 11 company-isolation Increment 10 — progress

## Result

Increment 10 adds selective active-company identity checks across customer debt/retention reads, loyalty writes, sale reversal, supplier payables, assistant period sales, inventory count/catalogue/batch workflows, store directory/transfer/count operations, and Mobile Money provider service calls. Inventory UI stale count/snapshot state is fenced. Business settings now pass the company identity that populated the form to a service-level save contract; stale expected-company submissions are rejected, and a transaction-time company switch aborts the update. Tax settings likewise submit the profile identity.

This remains a partial Stage 11 correction, not completion or security certification. Overall release stays **NO-GO / INCOMPLETE**.

## Verification

Toolchain: Node 24.19.0, pnpm 10.34.0, Vitest 4.1.11, Linux x86_64.

- Business profile and company isolation: **22/22 tests across 2 files**, including stale expected-company rejection and a Dexie updating-hook company-switch rollback.
- Full client suite: **808/808 tests across 99 files**.
- TypeScript semantic check: passed.
- Production PWA/frontend and server build: passed. Existing warnings remain for dependency annotation comments and the >500 kB main JS chunk.
- Stage 1 gate runner: **9 PASS, 0 FAIL, 0 BLOCKED** executable checks; `stageAccepted: false` because Windows browser-recovery evidence is missing.
- Gate result JSON and runtime record are under `artifacts/stage11-company-isolation-increment10/`.

## Remaining

The Company-settings service contract now fails closed, but a page-level UI race test and a wider review of provider/settings flows remain. Other stale-result/UI paths in expenses, purchasing, reporting, staff, backup/integrity and assistant/customer screens remain open, as do full role/session and direct-writer reviews. Multi-tab, crash/reopen, migration/restore, offline, and final browser/device acceptance are outstanding. Platform checks remain owner-deferred until the end, not passed. Keep SEC-001, SEC-004, DATA-001, DATA-002, DATA-011 and DATA-012 open.

## Source snapshot integrity

The final source ZIP contains **887 files**; its unified patch applies cleanly to the verified Increment 9 baseline and recreates all source files byte-for-byte. Every ZIP member matches its per-file SHA-256 entry. Delivery files are in `/home/ubuntu/project_review/`: `TALLYBOOK_V19_STAGE11_COMPANY_ISOLATION_INCREMENT10_2026-10-24.zip`, `.patch`, and `_SHA256.json`.
