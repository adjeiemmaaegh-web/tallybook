# Stage 12 V19 — Checkout Monetary Arithmetic Hardening

Status: INCOMPLETE; production certification not authorized.

## Change
- Added `client/src/features/sales/checkoutMoney.mjs` and `.d.mts` with safe-integer checks on unit prices, line totals and the summed subtotal.
- `completeSale` now computes monetary line totals once using the verified helper and uses the same figures for sale-line persistence. The check occurs before writes inside the existing atomic checkout transaction.
- Combined manual + loyalty discount now rejects unsafe integer overflow.
- No inventory costing, multi-device sync, provider payment or authorization changes were made.

## Executed tests
- `node --test qa/stage12-money-integrity.test.mjs server/tests/*.test.mjs qa/stage11-advanced-insights.test.mjs qa/stage11-local-insights.test.mjs qa/stage12-schema-gate.test.mjs`: 128 passed, 0 failed (includes five new money-integrity tests).
- `node --test qa/stage12-checkout-quantity.test.cjs`: 5 passed, 0 failed.
- `npm run build`: blocked; `vite: not found`.
- `npm run check`: blocked; missing Node and Vite type definitions.
- Full Vitest/browser IndexedDB/device tests: not executed.

## Mandatory outstanding blockers
All previous Stage 2/3 historical cost and authoritative FIFO allocation, Stage 5 assistant workflow, Stage 6 service authorization/attribution, Stage 7 hardware/backup, Stage 8 authentication/remote sync, Stage 9 store inventory/multi-device checkout, Stage 10 payments/storefront/fulfillment, Stage 11 analytics integration and full release QA remain open. Monetary input conversion and end-to-end saved-sale behavior require tests in a fully installed app environment.
