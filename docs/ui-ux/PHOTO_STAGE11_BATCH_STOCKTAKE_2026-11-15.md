# Photo 11 — atomic multi-product stocktake engineering (2026-11-15)

This increment covers the missing part of the 29-photo audit: a real multi-SKU count session, rather than visually grouping separate single-item counts. The existing single-product stocktake UI and backend remain unchanged.

## Source architecture
- Owner-only, session-bound Supabase RPC public.tallybook_shop_stocktake_batches, isolated from the existing shop_ops API.
- A batch has a store, immutable snapshot of 2–50 distinct active stock-tracked product IDs, and an open/applied/cancelled state. Each line captures authoritative store quantity at creation.
- The apply request must include exactly the original products, each once, with integers 0–2,147,483,647. A company-ledger lock serializes with sales, purchases, stock and transfers.
- All stock comparisons, changes, movement records and session completion run under one PostgreSQL transaction. Any stale count rejects and rolls back the whole batch, not just the changed row.
- Batch IDs are client-generated UUIDs. Duplicate start with identical IDs/products/store returns replay; any different reuse fails. Duplicate apply with identical quantities returns replay; different counts fail. Movements use session/product-derived operation IDs.
- All table writes are revoked from public/anon/authenticated roles. Security-definer function verifies active membership and canonical owner role. History is owner-only, bounded to the latest 30 sessions; a failed read never looks like zero.
- Browser persists unresolved start ID and the original selection in sessionStorage. A dropped response cannot create a replacement batch silently.
- Existing per-SKU POS, refunds, procurement, stock transfer and historical sale tables have not been rewritten.

## Existing functionality deliberately preserved
Single-product counts and history, per-business refund policy, owner/staff controls, multi-store stock isolation and authentic stock quantities. No retail sales or money are synthesized. No migration has been applied to an external database by this branch.

## Required verification / release order
1. Latest PR head: complete pinned Node24 / semantic TypeScript / Vitest / Chromium / macOS WebKit / Windows Edge / visual CI green.
2. Independent SQL semantic review (not just regex policy checks), isolated/disposable PostgreSQL migration and tests: 2-SKU apply, stale 1-of-2 rollback, unchanged-stock apply, exact and changed replay, tenant and staff rejection, nullable stock row creation, MAXINT, concurrent transaction lock, rollback refusal with data.
3. Review and explicitly authorize applying additive migration to the correctly identified Supabase project (not a test project), following the already merged #94 migration.
4. Verify grants, indexes, RLS, active-session check, owner/attendant permissions and transaction integrity on isolated records, with no existing customer or financial writes.
5. Release exact accepted build only with owner approval; conduct real mobile/store acceptance.

Until tests and schema checks are complete this is implemented-unverified, not a live-accepted or production-ready feature. No production deployment, reset, provider action or payment is authorized by this document.
