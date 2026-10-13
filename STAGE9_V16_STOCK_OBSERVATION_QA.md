# Stage 9 V16 — Store physical-count foundation / handoff

Status: PARTIAL. Not a completion/certification of Stage 9.

## Implemented
- IndexedDB version 23 includes an additive `storeStockObservations` table. No modifications to sales, payments, receipts, stock quantities, inventory movements, costing or cloud outbox.
- Company-scoped, store-scoped append-only physical stock count observations with active product, store and staff validation and `staff` permission requirement.
- Physical count UI on `/stores`, listing recent observations. Counts are **not** available-to-sell inventory and cannot be used for checkout or transfers.
- Strict nonnegative integer validation with upper bound and note hygiene.

## Executed checks
- `node scripts/stage9-stock-observation-qa.cjs`: 19 passed (validation, source invariant checks, TS/TSX syntax parse, schema marker). These are isolated checks, not real IndexedDB integration.
- `node --test server/tests/*.test.mjs`: 109/109 passed.
- `npm run check`: blocked (`Cannot find type definition file for 'node'`, `'vite/client'`).
- `npm run build`: blocked (`vite: not found`).
- Complete client Vitest suite, physical device/mobile testing, real IndexedDB migration v22->v23, multi-device checkout and offline sync are NOT verified.

## Required Work/environment QA
1. Install lockfile dependencies and run `npm run check`, `npm run build`, `npm test`.
2. Test v22->v23 IndexedDB migrations with real records, including company isolation, deleted/closed stores, staff revocation and backup/restore.
3. Implement an authoritative per-store stock ledger; reconcile initial stock, receipts, transfers, returned items and FIFO costs with company-wide stock before enabling transactions.
4. Complete Stage 8 device authentication, durable sync acknowledgements, idempotent financial posting and replay/conflict policy.
5. Verify mobile attendant sales with real separate devices online/offline, revoked-device effects, concurrency, refunds and owner reports.
6. Complete security attribution audit, hardware/browser printing and cross-stage production QA.

Stage 10 has NOT started.
