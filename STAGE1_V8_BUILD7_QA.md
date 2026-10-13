# Tallybook V8 Stage 1 — Build 7

## Scope
Strengthen read-only recovery of interrupted checkout, requiring saved sale receipt number, item lines, arithmetic totals, payment method, and exact payment amount to reconcile before displaying a recovered receipt. A recovery mismatch blocks retry and directs the operator to sales history; the function does not write records.

## Changes
- `client/src/features/sales/recoverSavedCheckout.ts`: exact ledger verification, including zero-payment credit sales and cross-company isolation.
- `client/src/features/sales/recoverSavedCheckout.test.ts`: regression scenarios for partial payment, duplicate/missing payments, broken sale lines, receipts, and duplicate keys.

## Verification
- TypeScript syntax parsing for both changed files: passed.
- Seven isolated JavaScript smoke scenarios against transpiled recovery logic: passed.
- Full Vitest execution: blocked (`vitest: not found`, dependencies not installed).
- Production build: blocked (`vite: not found`, dependencies not installed).
- Browser/real IndexedDB, offline checkout, mobile scanning, and printer tests: not executed.

## Release decision
Development candidate only. Run `npm ci` (or the project's pinned package manager), `npm test`, `npm run check`, `npm run build`, and end-to-end offline checkout tests in a configured development environment before production release.
