# Tallybook V13 — Stage 6 Staff & Local Security Audit

**Status: INCOMPLETE — development candidate only. Stage 7 not started.**

Baseline: Tallybook V12 Stage 5 finalization incomplete archive. Stage 5 blockers are retained and not resolved by this branch.

## Unit checklist

| Unit | Acceptance requirement | Result |
|---|---|---|
| S6-1 Local staff identity | Company-scoped owner/cashier/supervisor identities, PIN verification, role changes | Implemented in source; 11 targeted mock-backed checks cover core identity flows; real browser/IndexedDB checks pending |
| S6-2 Service-enforced permissions | Sell, refund, discounts, inventory, reporting and staff controls enforced in business services | Implemented across principal paths; full route/API bypass audit and integration tests pending |
| S6-3 Cashier shifts | Persist opening float, track cash movements, close and record variance | Implemented; close calculations include attributable cash sales, repayments and prepaid transfers, excluding unrecorded movements; complete ledger tests pending |
| S6-4 Device lock and biometric | Locked sessions, automatic expiry, supported biometric unlock | In-memory PIN session/expiry and lock implemented; **WebAuthn/biometric unlock not implemented**, and local database cannot withstand direct device compromise |
| S6-5 Attribution and audit | Actor/shift references on sales, audit staff changes and significant mutations, company isolation | Implemented for key flows; comprehensive audit-coverage check pending |
| S6-6 Recoverability and QA | Database migration, encrypted backups, regression tests, full type check/build/browser verification | IndexedDB schema V18 and backup handling implemented; full tests/build unavailable and browser testing not executed |

## Implemented files (principal)

- `client/src/features/staff/staff.ts` (new), `client/src/pages/StaffPage.tsx` (new)
- `client/src/features/staff/staff.test.ts` (new, Vitest integration tests **not executed**)
- `client/src/db/TallybookDB.ts`, `client/src/App.tsx`, `client/src/components/AppShell.tsx`
- `client/src/features/sales/sales.ts`, `client/src/pages/SalesPage.tsx`
- `client/src/features/inventory/{inventory,stage2Inventory}.ts`, `client/src/features/purchases/purchases.ts`
- Customer, credit, reversals, expenses, backup, reports, and company-isolation services updated with role gates/audit attribution.

## Verification evidence

From the development environment:

- `node /mnt/data/stage6_work/staff_runtime_smoke.cjs` — **11/11 PASS**. Tests run against a mocked database rather than a real IndexedDB engine.
- `node /mnt/data/stage6_work/syntaxcheck.cjs` — **243 TypeScript/TSX files parsed; 0 syntax errors**. This is NOT semantic TypeScript checking.
- `npm test` — blocked: `vitest: not found`.
- `npm run build` — blocked: `vite: not found`.
- `npm run check` — blocked: missing `node` and `vite/client` types.
- Browser, biometric, physical mobile and migration/restore tests — not executed.

## Concrete known limits and next actions

1. Provide/install the repository's full dependencies in a network-capable environment and execute full Vitest, `tsc --noEmit`, production Vite build, and actual IndexedDB/browser tests. Fix all failures before marking completion.
2. Complete supported platform biometric/WebAuthn unlock, with explicit fallback to PIN and registration/revocation requirements; test on eligible devices, or explicitly formally drop biometric from Stage 6's acceptance scope.
3. Review all mutating transaction entry points (including multi-company creation/editing) for service-level enforcement and complete user/shift attribution of credit repayment, prepaid transfers, return flows and stock adjustments.
4. Run backup/restore migration tests on old schema versions and security boundary reviews. Local PIN unlock is an operational control, not encryption against people who can manipulate the device's IndexedDB.
5. Preserve deferred Stage 5 coding/testing blockers. Do not start Stage 7 before the Stage 6 gate is met.

## Follow-up hardening (current build)

- `businessProfile.ts`: protected business profile creation and editing with the existing staff-management permission check. Legacy mode (no staff provisioned) retains setup behavior.
- `activeCompany.ts`: cross-company deletion requires switching into the target company before staff permission check; avoids authorizing deletion of unrelated company via the active company's session.
- `staff.test.ts`: added regression case for cashier-denied create/edit/clear and target-company deletion check. **Written but not run** because Vitest is missing.
- Targeted mock staff smoke harness: 11/11 passed. 243 TS/TSX files parsed. These do not verify the new integration test.
- Missing biometric/WebAuthn unlock, comprehensive permission and attribution coverage verification, and real IndexedDB/browser validation prevent Stage 6 completion. Typecheck, Vitest, and Vite build remain blocked on missing dependencies.
- Stage 7 remains locked.

## Optional WebAuthn device-unlock development increment
- Added authenticator enrollment for an actively unlocked staff member and optional sign-in through `navigator.credentials.get` with fresh cryptographic challenge, origin/RP verification, user-presence/user-verification bits, ECDSA P-256 signature verification, sign-counter checking and local credential revocation.
- Added PIN fallback and Staff page controls. WebAuthn availability depends on a secure context and supported platform; it is not guaranteed to be biometric (security keys may use PINs). Credentials stored in IndexedDB remain vulnerable to direct local database tampering; this is NOT server-backed authentication.
- Device/browser/WebAuthn integration, full test suite, type checking and production build are NOT verified. Stage 6 remains incomplete pending those checks and comprehensive authorization/attribution audit.

## Cash-journal validation hardening (next development pass)
- `staff.ts`: shift cash calculation rejects negative/unsafe payment, repayment and wallet-transfer amounts, unexpected wallet-transfer kinds, positive/unsafe reversal amounts, invalid opening floats, and duplicate sale IDs before aggregation. This prevents malformed cash records from cancelling each other and yielding plausible shift balances.
- `staff.test.ts`: added four failure assertions covering negative cash records, invalid transfer kinds, positive reversal amounts and duplicate sales.
- Direct mock-backed staff harness: **12/12 passed**, including new cash-validation scenario. `node /mnt/data/stage6_next/staff_runtime_smoke.cjs` (harness external to source distribution).
- TypeScript syntax scan: **243 files parsed with zero syntax errors** using global TypeScript transpile.
- `npm test`: **NOT EXECUTED**, `vitest: not found`. `npm run build`: **NOT EXECUTED**, `vite: not found`. Semantic typecheck, actual browser/WebAuthn and IndexedDB integration remain unverified.
- Stage 6 remains **INCOMPLETE**, pending full permission/attribution audit, real WebAuthn device verification, full suite, typecheck and production build. Stage 7 remains locked.

## Reversal and staff-attribution audit hardening
- Found a correctness defect in historical sale reversals where multiple lines using the same product each computed a restored quantity from the same pre-reversal stock. Changed reversal processing to aggregate quantities by product, write one stock movement per product, and validate safe integer results. Reversal staff/shift attribution and audit logging remain in the same database transaction.
- Added `phase1Services.test.ts` regression scenario splitting one historical sale line into two for the same product and requiring the exact combined restock and a single reversal movement. Test written but NOT executed because Vitest is unavailable.
- Stage 6 stays INCOMPLETE pending a complete service-level authorization and attribution audit, browser WebAuthn testing, TypeScript semantic checking, Vitest execution, production build and IndexedDB migration checks.

## Expense attribution and idempotency hardening (latest pass)
- `features/expenses/expenses.ts`: records the current authorized staff ID and active shift ID on each newly saved expense; retains legacy owner-only mode when staff has not been configured.
- Expense retries with an existing `submissionKey` now compare category, date, amount, and note and reject changed payloads rather than silently returning a different saved expense.
- `features/expenses/expenses.test.ts`: updated existing idempotency assertion and added rejection of changed-payload retries. Regression written but NOT EXECUTED because Vitest is unavailable.
- Global TypeScript transpile syntax check: 2 changed source/test files parsed successfully. `npm test`: `vitest: not found`. `npm run build`: `vite: not found`.
- Remaining Stage 6 blockers: holistic permission/attribution service audit, device WebAuthn verification, real IndexedDB tests, semantic typecheck, full regression suite and production build. Stage 7 NOT STARTED.

## Follow-up purchase and repayment audit — 10 October 2026
- Purchase completion now rejects repeated submission keys if supplier, purchase date, note, products, quantities, or unit costs differ from the originally recorded purchase. This avoids accepting an earlier purchase for a changed stock-restocking request.
- Purchase records now retain the authorized staff ID and active shift ID (when applicable) in addition to their existing staff audit event.
- Customer debt repayment submission keys now reject changed customer, amount, payment method or note instead of returning an unrelated earlier repayment.
- Added focused IndexedDB regression cases to `purchases.test.ts` and `credit.test.ts`; **written but not executed** because Vitest dependencies are not installed.
- Actual updated-tree TypeScript/TSX syntax scan: 243 files parsed, 0 syntax errors. Existing mock-backed staff runtime harness: 11/11 pass. Neither verifies the new database tests.
- Stage 6 remains incomplete: exhaustive authorization and attribution audit, browser WebAuthn tests, full Vitest, TypeScript semantic check, production build and real IndexedDB integration remain outstanding. Stage 7 has not started.

## Directory credential-minimization audit (2026-10-10)
- Fixed: `listStaff()` no longer returns PIN verifier hashes, salts, or WebAuthn public keys to routine UI callers. Directory callers receive a narrow `StaffDirectoryEntry` and a boolean `hasAuthenticator` for device-unlock controls.
- Updated Staff screen to consume safe directory entries. Added staff regression test for absence of credential material.
- Verified: 3 changed TypeScript/TSX files have zero TypeScript parser diagnostics.
- Blocked: `npm run test -- --run` (Vitest unavailable), `npm run build` (Vite unavailable). No passing execution claim for new regression test.
- Stage 6 remains incomplete: service-level attribution/authorization audit, real WebAuthn and IndexedDB tests, complete suite and build are outstanding.
