# Tallybook V19 — Run 16 Public Commerce — Consolidated Source-Development Increment

**Date:** 2026-10-16 (Asia/Dubai)  
**Branch:** `v19/run16-public-commerce-development-20261016`  
**Run 15 source parent:** `v19/run15-payment-sandbox-development-20261016` at `f94aa45d8a99803f60c68be267b3bd9a915a16f8`.  
**Final reviewed source head before this documentation update:** `08fd18460cc912130ba52b2ff13792ad6acae1e6`.  
**Delivery status:** **RUN 16 SOURCE-DEVELOPMENT INCREMENT DELIVERED — NOT EXECUTED / NOT ACCEPTED**.  
**Commercial release:** **NO-GO**. The owner's instruction suspends executable QA; no Node/Vitest, browser, semantic TypeScript, build, GitHub Actions, live provider, external deployment, remote tenant, public site or staging tests were run. Do not describe this as a working public store until those checks and approvals occur.

## Purpose and trust boundaries

Run 16 stages owner-reviewed customer order requests, exact local-stock reservations, existing-POS linkage, pickup/delivery handling and tenant-safe cancellation/return requests. No order request, physical stock hold or delivery note becomes a payment, invoice, external settlement, receivable, supplier liability, tax movement or inventory deduction by itself. **Only the authorized existing company POS transaction** can issue a receipt and deduct inventory for a reserved order, under existing staff, stock, tax, loyalty, credit and per-company return-policy rules.

An anonymously accessible production public storefront requires separate owner-approved hosting, canonical server-side tenant identity and request journal, abuse controls, rate limiting, privacy/consent controls and customer identity/recovery. This run has **not** published the site or registered any public HTTP route. The public request boundary is authored as a fail-closed unmounted adapter to avoid unapproved exposure. Owner approval and deferred security QA remain necessary for activation; no live public order acceptance is implied.

## Planned source components now committed

1. **v32 additive Dexie schema** — `client/src/db/TallybookDB.ts` declares `commerceHolds` (unique company/order/product, submission identity; expiry/status) and `commerceDeliveryEvents` (unique company-submission key and order-event sequence). Existing v1–31 retail, store and payment tables remain unchanged. No historical sale/store attribution or reservations are invented.
2. **Pure merchant commerce invariants** — `client/src/features/commerce/run16Rules.mjs` and `.d.mts` define strict company/store/quantity/currency-minor evidence boundaries, 5-minute to 7-day physical holds, released/consumed transitions, validation of ordered delivery events and portable backup cross-links. A hold is explicitly not an inventory movement, payment or public order acceptance.
3. **Atomically confirmed store reservations** — `client/src/features/commerce/run16Orders.ts` requires active company, unlocked company owner, recovery barrier, coordinated retail-write lock, unchanged item price and permitted store assignment. It checks physical stock less already dispatched transfer reservations and other active customer holds within the same IndexedDB transaction. Service lines may be planned without inventing stock units. Owner confirmation creates separate immutable holds and a full delivery audit event; exact same-key retry is only accepted with identical unexpired evidence. Expired or conflicting requests are rejected.
4. **Cancellation and expiration** — Unpaid draft, prepared, ready, reserved or packed requests may be cancelled with a recorded explanation; active holds become immutable released evidence. Manually confirmed expiry uses the saved reservation timestamp. A sale-linked, dispatched or delivered order cannot be cancelled to undo a financial sale; it requires the existing company-authorized refund/reversal system and human-reviewed return workflow.
5. **Existing-POS consumption** — `client/src/features/sales/sales.ts` now permits optional `commerceOrderId` and stores the reference in the sale. One same-company, unexpired, exact-store order with exactly matching product quantities and original unit-price snapshot is linked inside the **same transaction** that posts existing POS money, tax, stock and receipt evidence. Its stock holds become `consumed`, and the immutable order-event journal records the sale link. Existing submission-key replay cannot silently switch the referenced order. Any mismatch fails closed without changing retail data.
6. **Reserved physical stock across retail write paths** — `run16Availability.ts`, `storeStockLedger.ts`, `storeTransfers.ts`, `inventory.ts`, `advancedInventory.ts` and `stage2Inventory.ts` recognize nonexpired customer commitments, prevent competing sale/store transfer/stock decrease, prohibit bulk stock-count/import bypass, and restrict archiving stocked products with outstanding holds. For existing Run 13 store mode, store-specific POS reads show only unreserved available units and assignment checks remain intact.
7. **Auditable delivery lifecycle** — `recordRun16Delivery` defines reserved → packed → dispatched → delivered → return-requested, each with staff permission, original sale link, unique submission key and factual note. Physical fulfillment never occurs merely because the order was reserved, and a return-request status never issues money. Return requests require active company policy and original sale return-policy permission; no hidden override of company no-refund settings. The existing financial refund and credit correction paths remain separate.
8. **Merchant-facing local ordering and POS UI** — `CommercePage.tsx` stores customer name, optional contact, pickup/delivery preference and local instructions. `Run16OrderOperations.tsx` renders reservation, cancellation, expiration, dispatch/delivery and return review, with release-gated controls and explicit no-payment language. `SalesPage.tsx` can select an eligible reserved order and submit its exact cart through the existing POS instead of accepting a second payment or decrementing stock twice. `pendingCheckout.ts` validates the optional immutable commerce order ID for crash/timeout recovery. No customer information is sent to a public server by these local UI components.
9. **Portable local backup and restore** — `run8BackupCompatibility.mjs` and `backup.ts` include v32 reservation and delivery tables only at/after their introduction, reject missing required tables, forged/lost audit events, reservation/product mismatch and bidirectional saved order/receipt identity mismatch. Earlier version backups default these tables to empty; their historical orders remain drafts and are never credited with imaginary holds or deliveries. Existing assistant recovery, Run 13 store ledgers, Run 14 encrypted remote-cache reset and Run 15 nonportable sandbox separation remain unchanged.
10. **Disabled public-customer contract** — `server/run16PublicCommerceBoundary.mjs` and `.d.mts` project *only explicitly published* server-owned product name, safe price, availability and currency; compute canonical SHA-256 catalogue revision digests; create HMAC-signed 10-minute tenant/revision-limited catalogue grants; validate canonical guest customer requests, distinct lines, safe quantities, contact, pickup/delivery and expected company; and define server-only durable staging interface with idempotency, rate limit and server-side prices. `RUN16_PUBLIC_COMMERCE_ENABLED=false`; **no route, database-backed guest-order sink, real public storefront or customer-facing deployment was activated**. Server adapter staging can only be activated after a trusted durable tenant journal, consent/abuse protections and external deployment are approved.
11. **All existing commercial gates remain closed** — `COMMERCE_RELEASE_SCOPE.publicStorefront=false`, `onlinePayments=false`, `reserveStock=false`, `fulfillOrders=false`, `automaticSync=false`. Run 13 authoritative store activation/transfer release flags remain separate and disabled, Run 14 encrypted network off, Run 15 real gateway disabled.

## Manual source review, corrections and design constraints

- Corrected hold validation so optional `storeId` is not required for unscoped single-company stock; where a store is selected, unscoped reservation evidence is rejected rather than silently allocated.
- Added exact owner attestation and selected-store staff/ownership validation in the same coordinated transaction; refused cross-tenant or wrong-product hold query results.
- Linked checkout intent and replay to the original reserved order; inspected the POS requirement for exact item quantities and original unit prices, and added live reservation subtraction to the legacy company-wide POS availability display as well as store-scoped POS. Both views fail closed when commitment totals cannot be read, while authoritative validation remains inside the write transaction.
- Prevented transfer dispatch, manual stock decreases, bulk import/stock-count posting and archiving from bypassing active customer reservations.
- Added persistent ordered delivery sequence and unique per-company/order/sequence index; restore preflight rejects missing or forked delivery records, unresolved sale links and order states without history.
- Corrected service-only reservation expiry (no physical hold rows) and same-key expired-replay acceptance.
- Preserved return restrictions at **both** company current policy and original sale snapshot; a return request is only a reviewed workflow, never an automatic cash refund.
- Tightened source-only public proposal: HMAC tenant/revision grants, server-owned offer digest and currency, immutable server-derived prices and refusal of unapproved public-facing endpoints.
- Reviewed v32 backup field order against the versioned compatibility registry and ensured merchant events, holds, sales and stocks are tracked separately.

This is **source inspection, not validation by compiler, database runtime or automated QA**. Passing tests or guaranteed defect freedom has NOT been established.

## Deferred acceptance matrix — no checks executed

| Gate | Evidence required on exact release SHA | Status |
| --- | --- | --- |
| R16-01 | TypeScript, client/server build and full client/native checks | Deferred |
| R16-02 | Real v31→32 IndexedDB migration, restart, rollback, restore | Deferred |
| R16-03 | Cross-tab atomic holds versus POS/adjustment/transfer dispatch and races | Deferred |
| R16-04 | Full/partial sale, tax/credit/loyalty, source quotation and price drift | Deferred |
| R16-05 | Same-key retries, conflicting/idempotent submission, expired physical holds | Deferred |
| R16-06 | Company/store/staff authorization, revoked sessions, wrong tenant | Deferred |
| R16-07 | Store-stock reconciliation with Run 13 multi-store and Run 14 offline devices | Deferred |
| R16-08 | Tampered backup (hold forgery, missing delivery event, orphan sale link) | Deferred |
| R16-09 | Company opt-out refunds and snapshot policy, return requests without cash posting | Deferred |
| R16-10 | Delivery evidence, address/privacy retention and customer withdrawal | Deferred |
| R16-11 | Hostile guest order input, signed catalogue replay, HMAC and rate limits | Deferred |
| R16-12 | Trusted server-side company directory, durable guest journal, hosted HTTPS/RLS/security assessment | Blocked pending owner approval |
| R16-13 | Public storefront, real merchant and customer UAT, Ghana/Windows/Android/browser | Blocked / not deployed |
| R16-14 | Commercial readiness and production release signoff | NO-GO |

Historic V19 82 acceptance units and 47 blocker statuses remain unmodified because no new executable evidence exists. No CI runners, local checks, browser sessions, database migrations, public endpoints, live payments or deployments were executed.

## Development handover and next run

**Run 16 source-development increment is delivered and documented as a single stage.** External public launch remains deliberately inactive; do not conflate source work with a live public commerce platform. Continue with **Run 17 — Assistant and Analytics** under the owner's development-only workflow. Test, acceptance and release activities remain deferred and required before production. Nothing in Run 16 authorizes external publishing, data export, real transactions, cloud operation or merging to `main`.
