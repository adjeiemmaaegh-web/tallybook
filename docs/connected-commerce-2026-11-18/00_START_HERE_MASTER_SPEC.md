# Tallybook Connected Commerce — master implementation specification
**Status:** Proposed architecture and product requirements, NOT shipped features  
**Date:** 2026-11-18  
**Repository:** `adjeiemmaaegh-web/tallybook`  
**Baseline reviewed:** `main` at `41d4bab619db1808f21471299bd7760eee1a6836`  
**Owner intent:** All FIVE initiatives have EQUAL strategic importance, engineering depth, and acceptance obligations.

> Read this file before beginning implementation. This is a *new additive growth initiative*, not a replacement for the existing release checklist, Stage 21–32 plan, or the standalone ledger. Do not treat specifications as evidence of running features.

## What is being built
Tallybook should evolve from a credible Ghana-focused business ledger/shared-shop POS into a connected **merchant + buyer + supplier ecosystem**. The strategic promise is: **"Sell more. Source smarter. Run better. Keep customers."** Do not claim that any of these outcomes exists until independently measured.

Five equal product pillars, each with its own user outcome:
| Track | Product | Merchant/user value | Canonical milestone prefix |
|---|---|---|---|
| CC-D | **Tallybook Discover** | Buyers discover real participating shop offers and merchants gain additional qualified demand | `CC-D-*` |
| CC-N | **Tallybook Business Network** | Independent merchants fulfill or refer out-of-stock demand safely | `CC-N-*` |
| CC-S | **Tallybook Supply** | Retailers obtain comparable supplier quotes and potentially better net replenishment costs | `CC-S-*` |
| CC-C | **Clementia 2.0** | Verified, explainable business recommendations and owner-reviewed actions | `CC-C-*` |
| CC-P | **Tallybook Passport** | Buyers manage opted-in receipts, claims, returns and merchant loyalty in one experience | `CC-P-*` |

### Navigate the docs
1. [01 — Product Requirements Document](01_PRODUCT_REQUIREMENTS_PRD.md): personas, jobs, detailed requirements, success criteria and exclusions.
2. [02 — Technical Architecture](02_TECHNICAL_ARCHITECTURE.md): domain boundaries, storage, events, API/RPC contracts, security and safe rollout.
3. [03 — UI/UX Interface Design](03_UI_UX_INTERFACE_DESIGN.md): information architecture, screen-by-screen text wireframes, states, responsive and accessibility rules.
4. [04 — Delivery Roadmap and Agent Playbook](04_IMPLEMENTATION_ROADMAP_AGENT_PLAYBOOK.md): equally resourced delivery tracks, dependencies, test gates, PR format and definition of done.

## Source-of-truth boundaries (checked against the repository)
- Current `README.md`: **two distinct authorities** — local IndexedDB standalone-device ledger, and Supabase/PostgreSQL **shared shop** with session-scoped server operations. Neither is transparently merged with the other. Do not upload/migrate a device ledger into the shared shop automatically.
- `client/src/cloud/shopPublicOrders.ts`, `client/src/pages/PublicShopOrderPage.tsx`, migration `20261115090000_shop_public_order_requests.sql`: public opt-in share permits **order REQUESTS**. It does **not** process payments, accept an order, reserve stock, deliver goods, or record a sale. Keep this contract until a separately approved transaction lifecycle exists.
- `client/src/cloud/shopAssistant.ts`: shared-shop "Ask" is **read-only**, except an owner-reviewed purchase-order DRAFT; it does not mutate ledger records.
- `client/src/cloud/SharedShopOrders.tsx`, `SharedShopPurchasingPanel.tsx`, `SharedShopReports.tsx`, `SharedShopOwnerDashboard.tsx`: reuse and extend existing merchant UI/service boundaries; avoid shadow ledgers.
- `docs/release/REMOTE_VERIFICATION_2026-11-16.md`: controlled-pilot status; physical devices, live payment integrations, hosted recovery and owner acceptance remain separate.
- `road-to-complete.md`: existing V19 Stages 21–32 are authoritative for readiness. **Do not renumber, replace or mark them done** because of these new docs.
- `docs/ui-ux/STOCKDEY_29_REFERENCE_AUDIT_2026-11-14.md`: current competitor-like screens already partially exist; design distinct value rather than imitate screenshots.

## Non-negotiables
1. **Equal priority, not a serial feature wish list.** Allocate a named lead, spec, prototype, secure service boundary, tests and pilot for every track. Shared foundational dependencies can be built once, but none of the five is a mere "future bonus".
2. **No automatic opt-in.** Merchants explicitly publish offers, share availability, join referrals, list purchasing demand, opt into assistant suggestions, and enable customer receipts/loyalty independently.
3. **No invented availability or completed orders.** "Listed", "availability unconfirmed", "merchant confirmed", "reserved", "paid", "fulfilled", "refunded" are distinct server-backed states; never infer them from a listing.
4. **No financial side effects from AI, public requests, promises or unverified callbacks.** Write actions use existing verified merchant/server authorization, explicit confirmation, durable idempotency and audit.
5. **Real payments require approved/licensed partners, live verified settlement webhooks, actual reconciliation, compliant refunds and owner permission**; until then use external/merchant-arranged payment wording with no "paid" claim.
6. **Tenant isolation:** never expose stock counts, profit, staff, customers, supplier costs, debtor identities or competitor-only data to public shoppers/other merchants.
7. **Ghana-first accessibility:** entry-level Android and low-data paths, GHS defaults, clear English, optional local language, WhatsApp-shareable links; do not force consumers to install an app.
8. **No destructive migrations, credentials, production data changes, or deployment** through this planning work. Each implementation phase requires code review, isolated test database, rollback and owner approval.

## Team execution rule
Create five workstreams `CC-D`, `CC-N`, `CC-S`, `CC-C`, `CC-P` from the same gated baseline; a shared platform workstream `CC-X` serves all five. Engineers must document exact existing code reuse vs proposed/new files. All designs, prototypes, policies, tests and pilot metrics must be completed for ALL FIVE before declaring this program complete.

## Investor and adoption proof
This program seeks tangible **net business value**, not just downloads: incremental paid orders (Discover), completed partner fulfillments (Network), savings after all charges (Supply), accepted accurate recommendations that demonstrably help (Clementia), and repeat opted-in customers with resolved requests (Passport). Hypothesis thresholds are provided in the PRD and need approval before pilot; they are NOT measured market facts.
