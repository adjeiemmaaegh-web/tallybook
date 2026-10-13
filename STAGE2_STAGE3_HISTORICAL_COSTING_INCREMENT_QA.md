# Stage 2/3 historical costing boundary — incremental QA

Status: **INCOMPLETE**, not approved to post COGS.

## Scope
Added a pure, deterministic `previewFifoCost` routine in `client/src/features/inventory/historicalCosting.ts` and seven targeted Node tests in `scripts/historical-costing-check.mjs`. Validates company/product isolation, layer identity, nonnegative safe-integer unit costs and quantities, strict missing-layer flagging, deterministic FIFO ordering, and arithmetic overflow. Caller inventory layers are not mutated. This is a *preview* only; no financial statement or checkout path uses it and no migration was introduced.

## Executed checks (October 10, 2026)
- `node --experimental-strip-types --test scripts/historical-costing-check.mjs`: 7 passed, 0 failed.
- `node --test server/tests/*.test.mjs`: 109 passed, 0 failed.
- `npm run check`: blocked (`tsc` unavailable / missing dependencies).
- `npm run build`: blocked (`vite` unavailable / missing dependencies).
- Full Vitest, IndexedDB migration, browser and checkout integration: not run.

## Blocking requirements
1. Design immutable historical per-unit purchase-cost receipt entries, returns/corrections and company-scoped migrations.
2. Integrate atomic sale-line FIFO allocation and prevent overselling/races; persist applied historical unit costs and support reversal.
3. Reconcile returns, refunds, cancellations, wholesale/unit conversion and batch expiry.
4. Only then connect verified COGS and gross profit to reporting, with consistency controls; do not infer missing costs as zero.
5. Run full dependency-install, Vitest, semantic TypeScript, production build, real IndexedDB migrations and end-to-end financial reconciliation in configured QA environment.

Stage 8 baseline code and prior wallet-integrity changes retained. Stages 9–12 untouched.
