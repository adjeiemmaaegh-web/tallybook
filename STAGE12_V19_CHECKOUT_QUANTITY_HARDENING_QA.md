# Stage 12 V19 — Checkout Quantity Integrity Increment

Status: INCOMPLETE — release blocked. This increment fixes a real pre-transaction input validation gap; it does not certify inventory, financial, cloud, or security integration.

## Finding and correction

Previously `completeSale` validated each cart line quantity <= 9,999,999 but merged repeated product IDs by addition without revalidating the aggregate. Multiple individually valid lines could therefore exceed the intended per-product checkout quantity ceiling. A dedicated pure helper now validates the merged quantity before entering the sale's IndexedDB read/write transaction. The checkout retains its existing single-transaction persistence path and authoritative stock checks.

Changed files:
- `client/src/features/sales/checkoutQuantities.ts` (new)
- `client/src/features/sales/sales.ts` (uses helper)
- `qa/stage12-checkout-quantity.test.cjs` (five new executable checks)

## Execution evidence

From project root:
`node --test qa/stage12-checkout-quantity.test.cjs qa/stage12-schema-gate.test.mjs qa/stage11-*.test.mjs server/tests/*.test.mjs`
Result: 128/128 passing, 0 failing (five new checks plus 123 previously available).
TypeScript parser diagnostics: 0 for both changed source files.
`npm run build`: blocked (`vite: not found`, exit 127).
Client Vitest, semantic TypeScript, real IndexedDB migrations, browser/device, end-to-end finance/stock and payment/sync testing remain unverified.

## Mandatory gates before release

Finish prior-stage unresolved coding and security gaps (Stages 2/3 inventory costs/atomic allocation, Stage 5 assistant, Stage 6 authorization/attribution, Stage 7 real-device/backup, Stage 8/9 secure sync/attendant checkout, Stage 10 payment/inventory/fulfillment, Stage 11 data-backed analytics/automation); restore app dependencies, run Vitest, semantic tsc, production build, migration tests, browser and hardware security/integration QA. No production sign-off.
