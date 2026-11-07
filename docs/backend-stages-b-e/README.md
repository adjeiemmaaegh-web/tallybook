# Tallybook — Backend-only upgrade, Stages B–E

**Branch:** `backend-b-e-20261106` (based on audited main `0314873`)  
**Review:** [Draft PR #28](https://github.com/adjeiemmaaegh-web/tallybook/pull/28)  
**Scope:** SQL migrations and native/PGlite backend regression tests only. **No frontend, application routes, production database, staging database, payments or deployment changes.**

## Purpose and source of truth

Tallybook already operates a device-local IndexedDB ledger and a separate Supabase cloud-authoritative shared shop. This branch **extends only the cloud shared-shop backend**. It must never be confused with encrypting or synchronizing the separate device-local ledger. Existing POS `public.tallybook_shop` and prior sales/credit/membership RPCs remain unchanged. New capabilities use `public.tallybook_shop_ops(p_action text,p_input jsonb)` and current server-side membership/session checks.

All business mutation operations require current owner status verified inside Postgres. An assigned attendant may read limited Stage C data only for stores currently assigned. Anonymous requests, cross-company IDs, expired sessions, and direct browser SQL table access are denied. Store/product/supplier IDs and financial amounts are checked against company ownership. Financial and stock records are immutable where applicable.

## Stage B — finance/refund policy security

- `supabase/migrations/20261106120000_shared_shop_return_policies.sql` is ported from the existing Stage B draft with its isolated tests.
- Company policy is **default disabled**, with owner-only configuration, append-only revisions and sale-time snapshots; compliant statutory consumer rules remain the company's responsibility and require jurisdiction-specific review.
- A recorded refund adjusts the cloud ledger; it **does not initiate any cash, MoMo or card-provider payout**.

## Stage C — onboarding/readiness and scoped dashboard data

- `supabase/migrations/20261106130000_shop_stage_c_read_models.sql`
- New `readiness` returns authenticated role, configured ledger, store/product/stock/sale counts and actionable first-sale checklist (no new account registration; Supabase Auth and existing business membership remain authoritative).
- `salesSummary` filters to the owner's stores or currently assigned attendant stores, accepts a bounded 1–31 day window, and returns **string** minor-unit sums to prevent browser integer precision loss. Company-wide credit exposure is visible to the owner only.

## Stage D — stock, supplier, and order operations

- `20261106140000_shop_stage_d_stock_workflows.sql`: owner-initiated stock counts with captured expected stock and stale-count refusal; atomic application with one audited movement; inter-store transfers requested/in-transit/received/cancelled with dispatch decrement and receipt increment, exactly-once idempotency and zero unaccounted units.
- `20261106150000_shop_stage_d_purchase_payables.sql`: supplier registry, immutable purchase orders, partial received-goods postings, stock increments **only on receipt**, closure of unreceived remainder, outstanding supplier payable derived from receipts minus settlement history, and overpayment refusal. Payment postings are ledger-only acknowledgements of a separately completed external payment. No payment gateway call.
- `20261106160000_shop_stage_d_online_orders.sql`: owner-entered online order queue, optional customer reference, explicit acceptance, cancellation/closure, and sold status linked only to an actual preexisting matching POS sale. **Acceptance never reserves stock and linking a sale never books stock or money twice**. This is not an internet storefront, checkout API, webshop, webhook or autonomous fulfillment service.

## Stage E — backend source verification

- `.github/workflows/backend-b-e-qa.yml` runs exact lockfile dependencies in Node 24.19, PGlite migrations and finance/authorization test suites, existing shared-shop ledger regressions and repository TypeScript checks. No network or production database access is required for tests.
- `qa/backend-stage-b-e.test.mjs` covers new modules against real PostgreSQL logic in process: isolation, active sessions, current role assignment, idempotency, count and transfer conservation, supplier payable calculations, and online-order anti-double-booking.
- Existing `qa/shared-shop-refunds-import.test.mjs` and `qa/shared-shop-full-till.test.mjs` were carried forward with the Stage B policy migration.

### Acceptance status and explicit limitations

**Passing isolated QA does not establish production or commercial release readiness.** The following remain owner-approved, externally unexecuted acceptance work:

1. Review migration SQL on a cloned staging database with realistic multi-business data, locks, high concurrency, audit and rollback/failure injection.
2. Independently security-review each `SECURITY DEFINER` path, grants, RLS, active-session logic, membership revocation, malicious input and foreign keys. Supabase leaked-password protection status must be resolved before release.
3. Validate stockcount/transfer, partial purchases and online order flows against actual owner/attendant devices, mobile browsers, offline boundaries and the existing POS.
4. Assess country-specific tax, refunds, supplier settlements, privacy and legal data retention. No regulated payment or consumer return policy claim.
5. Full combined frontend+backend integration and non-destructive migration rehearsal, plus a documented owner GO decision.
6. The separate device-local `tallybook-db` live ledger is **not encrypted at rest** by this branch; Stage B's dedicated vault is a distinct development branch and not included here.

### Change-management rules

- Migrations are **forward-only drafts**, not applied to any project. Because they create financial history, rollback after receiving real records requires an owner-reviewed recovery plan, not unsafe dropping of tables.
- Do not merge with Stage B or frontend PRs automatically; handle potential deployment/typing/API integration conflicts in a later explicitly authorized integration branch.
- No backend source in this branch should be deployed, used for live financial transactions, or marked accepted merely because CI is green.

See `API_CONTRACT.md` for the new action request/response boundary and `STAGE_E_EXIT_GATES.md` for the remaining acceptance checklist.
