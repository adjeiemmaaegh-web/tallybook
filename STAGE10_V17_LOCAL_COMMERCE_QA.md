# Stage 10 — V17 Local Commerce Foundation QA

Stage 10 is INCOMPLETE. Implemented: company-scoped read-only catalogue derived from local products; device-local order drafts (IndexedDB migration 25); cancel draft; numeric validation and price snapshot; visibly disabled public store, payments, stock reservation, fulfillment and sync. Orders are NOT sales and do NOT post payments or stock changes.

Evidence: `node qa/stage10-commerce-check.cjs` (8/8); TypeScript syntax parser (5/5); `node --test server/tests/*.test.mjs` (109/109); `npm run build` fails `vite: not found`. Full TypeScript semantic checks, Vitest, IndexedDB/browser migrations, backup/restore and production deployment are NOT verified.

**Known blockers:** existing backup/restore formats must be reviewed and extended to include `commerceOrders` before drafts are treated as recoverable. This local screen is not a public storefront. Secure publication, pricing authorization, payments (MoMo/card), webhook idempotency, order lifecycle, stock reservation, settlement reconciliation, delivery/fulfillment, fraud/privacy controls and E2E tests remain Stage 10 work. Do not enable payment or inventory writes before security and financial certification. Stage 9 cross-device scope remains disabled.
