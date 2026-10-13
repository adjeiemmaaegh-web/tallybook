# Stage 11 V18 – Build 1: Local Evidence-Backed Insights

Status: DEVELOPMENT IN PROGRESS, NOT CERTIFIED.

## Implemented
- `/insights` read-only page linked from Reports.
- Reuses existing permission-checked, active-company-scoped `getReportsSnapshot()`.
- Rule-based observations for low stock, positive outstanding customer debt and completed-sale counts.
- Evidence and a link to supporting records for each observation; selected period applied to sales, current inventory/debt shown as current.
- No automated purchase, inventory mutation, prediction, payment or ledger write.

## Checks executed
- `node --test qa/stage11-local-insights.test.mjs`: 4 passed, 0 failed.
- `node --test server/tests/*.test.mjs`: 109 passed, 0 failed.
- TypeScript syntax parse of changed TS/TSX: passed.
- `npm run build`: blocked because Vite is not installed.
- `npm run check`: blocked because Node/Vite type definitions are absent.
- Full Vitest and real IndexedDB/browser checks: not executed.

## Open Stage 11 implementation units
- Reliable demand/reorder recommendations based on full costed historical records.
- Expiry alerts grounded in batch-level expiry and stock records.
- Evidence-backed debt ageing and repayment prioritization where due dates are validated.
- Automated briefing scheduling and permissions with robust offline lifecycle.
- Full integration and security QA, migration regression and production certification.

## Prior-stage blockers carried forward
Stages 2/3 cost and atomic inventory allocation; Stage 5 assistant workflow; Stage 6 permissions; Stage 7 device QA; Stage 8 cloud auth/sync/recovery; Stage 9 multi-device inventory/sales; Stage 10 public storefront, online checkout, MoMo/card payments, webhook verification, reservations, fulfillment and end-to-end QA. Do not enable financial automation before these are resolved and tested.
