# Deferred tests master list
Preserve throughout Stage 5–12 development. Before any public production deployment run all deferred checks in a full dependency-enabled environment (Work or equivalent).
1. All project automated Vitest tests and type checker.
2. Full Vite production build.
3. IndexedDB migration/backup/restore across historical schema versions (especially 14–17).
4. Payment, credit, wallet, loyalty, quotation and reversal ledger reconciliation and rollback.
5. App offline navigation, reload/recovery, scanner, printer and mobile-device journeys.
6. Company isolation, authorization, security and malicious import tests.
7. Stage 2 Manus output integration with Stage 3 and Stage 4 costing/pricing/stock semantics.
8. Connected-device multi-store sync and online ordering when Stages 8–10 are implemented.
Do not treat isolated smoke tests or syntax validation as production certification.

## Stage 6 — V13 staff and local security (not release-verified)
- Staff module and device PIN locking introduced in schema V18; independent real IndexedDB migration / integration tests not run.
- Five new Vitest integration test scenarios written but not executed (`vitest` missing).
- Full TypeScript semantic type check and Vite production build blocked by missing dependencies.
- Physical biometric/WebAuthn unlock remains unimplemented; browser/mobile device and cross-tab security checks remain unexecuted.
- Audit all mutation endpoints, staff/shift attribution and company-management permission boundaries prior to signing off Stage 6.
- Stage 6 is **INCOMPLETE**, not merely a final QA deferral.

### Stage 6 security hardening follow-up
- Run new company-administration permission regression tests against IndexedDB.
- Verify staff role enforcement on every company-management and financial entry path.
- Validate WebAuthn/biometric capability or formally change the product acceptance requirement (still an implementation blocker).
- Execute Vitest, TypeScript semantic checks, Vite build, browser/device tests, and migration restore tests.

### Stage 6 follow-up: shift cash journal validation
- Direct mock-backed cash entry checks passed (12/12 staff harness). New Vitest assertions were written but not executed.
- Still must run full Vitest, TypeScript type check, Vite build, browser/WebAuthn and real IndexedDB permission/shift scenarios in a dependency-enabled environment.

### Stage 6 additional QA — duplicate-product reversal
- Execute the new duplicate-line reversal integration test in `client/src/features/assistant/phase1Services.test.ts` using Vitest/fake-indexeddb. Check actual stock, movement ledger, staff attribution and rollback behavior.
- Complete Stage 6 authorization/attribution cross-feature audit; run full type check, production build, WebAuthn browser verification, backup/restore migration suite. NOT EXECUTED in this environment.

### Stage 6 expense-attribution hardening follow-up
Execute `client/src/features/expenses/expenses.test.ts` (including changed-payload retry rejection), staff permission/shift attribution integration checks, semantic typecheck, full suite and production build in dependency-enabled environment. Current source-only syntax checks are not a substitute.

### Stage 6 purchase/repayment follow-up (10 October 2026)
- Execute `purchases.test.ts` changed-key replay and `credit.test.ts` changed-key repayment scenarios in Vitest against fake IndexedDB; currently **not executed**.
- Confirm staff/shift attribution on completed purchases and validate purchase/repayment duplicate submissions in actual browser IndexedDB.

- Stage 6 staff directory credential minimization: execute newly added `staff.test.ts` regression test; full suite unavailable (Vitest missing). Production build unavailable (Vite missing). Re-check directory usage in browser and WebAuthn enrollment/unlock on devices.

## Stage 7 carry-forward at Stage 8 start (10 October 2026)
- 7.2 verify customer-facing cart across physical mobile/tablet browsers; preview must never mutate ledger.
- 7.3 verify browser printing and receipt recovery, printer compatibility; direct ESC/POS adapter is not implemented.
- 7.4 validate browser notification permission/foreground behavior, denial and unsupported browsers.
- 7.5 run encrypted backup, restore, company isolation, staff data, and schema migration tests using real IndexedDB.
- 7.6 run keyboard/screen-reader accessibility, performance under realistic data volumes, PWA offline navigation, integrated POS tests.
- Stage 7 remains INCOMPLETE; do not count syntax checks or isolated mocks as end-to-end passes.

## Stage 8 V15 foundation blockers
- V19 database migration and local sync consent/outbox require IndexedDB tests, migration/backup/deletion review.
- No remote server, organization authentication, authenticated sync, encrypted cloud recovery, transport encryption/key management, device registration or conflict resolution implemented.
- Do not call an outbox entry synchronized or acknowledged. No automatic upload is enabled.
- Before any connected release, enforce staff/owner permission in the actual server and user interface, secure consent flow, authorization, deduplication and remote receipts.
