# Phase B — stage 14 SKU variants, 2026-11-15

**Dependency:** branch `feat/phase-b-product-variants-20261115` is based on business-type PR #94, not yet merged/accepted when authored. Do not deploy or migrate variants until #94 is accepted and the variant PR passes all final CI gates.

## Design choice: immutable stock identity
Each size/colour is a **distinct `shop_products.id` SKU** with its own barcode, price, cost, active state, stock-per-store, purchase receipts, refund quantities and historical sales. The variant feature groups already-created goods under a family name with size and/or colour metadata; it **does not divide one SKU's stock among several options** or pretend that separate stock exists.

- Unique tenant-scoped index prevents two SKUs in the same company from having the same normalized family/size/colour combination.
- Owner-only `set` action uses existing verified session and company-ledger lock. The `list` action is member-scoped, excludes inactive SKUs from attendant views, and never includes private costs.
- Assigning a group requires a tracked good. Turning it into an untracked good/service fails until the variant grouping is explicitly removed. A metadata change never edits prices, on-hand counts or existing transactions.
- The product manager has a collapsible, responsive grouping workspace. The till now has a separate opt-in family-first picker that retrieves grouping only when opened and adds a real SKU through the existing cart/stock check; it does not replace barcode scan, offline lookup, or the original checkout.
- Offline or failed reads cannot imply an empty variant matrix.
- A dropped save response does not permit a **changed** payload until the operator refreshes the saved group from the server. Exact repeats remain idempotent.
- Removing grouping is a confirmed, two-step metadata action; the SKU and stock remain.

## Release and user acceptance
1. Independently review migration `supabase/migrations/20261115033500_shop_product_variants.sql` and its no-data-loss rollback, and validate existing RLS/owner policy.
2. Source must pass Node 24, TypeScript, browser and Windows/macOS tests.
3. Apply migration to authorized Supabase project and verify unique index, RPC grants and no write access to `shop_products` for attendees.
4. Merge and deploy the exact commit. Conduct live owner/attendant and two-store SKU tests without moving actual money.
5. Until these gates complete, Stage 14 is **implemented-unverified**, not released.

## Known limitations
Existing product/SKU creation remains a separate form; the owner creates multiple distinct products before grouping them. A one-click bulk variant generator, image-upload gallery and omnichannel sync are **not** implemented here. The optional POS family picker is implemented at source level but not externally verified or accepted. Financial integrity takes precedence over superficial visual parity.
