# Continued implementation — 9 November 2026

The owner rejected an audit-only stopping point. Development continued on the same review branch. This file records executable changes, not a stakeholder handover or a declaration that all V19 requirements are finished.

## Integrated behavior

- Local store inventory and transfers are enabled. Opening allocations must exactly reconcile to company quantities and cannot strand active unscoped customer holds. Dispatch reserves stock; receipt atomically posts both store legs; returned undelivered stock releases its reservation. Distinct source/destination supervisors operate only within their respective assignments. Store-mode purchases reject new expiry-batch receipts until store-specific batch provenance exists; sales also reject ambiguous pre-existing tracked batches. These guards preserve stock rather than inventing locations.
- Merchant order reservations and fulfilment are available in Commerce. A background sales refresh preserves the selected reservation identity; an unavailable reservation remains explicit and cannot silently become an ordinary sale. A matching POS checkout consumes the holds and links the saved sale atomically. Packing, dispatch and delivery require that sale and explicit human evidence. Malformed hold expiry rejects checkout without partial financial writes.
- Returns can choose a physical receiving store without rewriting the original sale's location. This includes sales made before store allocation. Backup relationship validation and operational-event scope include the receiving location.
- Assistant reversal confirmation is bound to the reviewed sale and company. A newer sale invalidates the preview. Store-mode confirmations explicitly identify the receiving store.
- Store sales contribution is reconstructed from the existing full financial and cost evidence. Every store plus a historical-unattributed bucket reconciles to company revenue, tax and COGS. Returns affect the original selling store's revenue even when received elsewhere. Unknown tax/cost evidence remains unavailable; pooled inventory assets and company expenses are not arbitrarily assigned to stores.
- Owner-approved daily/weekly advisory schedules persist in the company profile. They run only while the app is open with the consenting owner unlocked, make one bounded catch-up snapshot, serialize concurrent executions, and atomically audit the result. Pause/cancel are explicit. Restore pauses the schedule. No external messages, money, stock or order mutations are scheduled.
- Node and Vercel now enforce CSP. The bundled-app offline suite uses the actual compiled Node server, verifies offline checkout/receipts, and confirms injected inline scripts are blocked. Missing API/asset routes and unsupported write methods return errors instead of SPA HTML; startup failure exits unsuccessfully.

## Verification sources

`client/src/features/stores/storeOperations.integration.test.ts` executes real services against isolated IndexedDB with actual owner/supervisor/cashier authorization. It covers transfer conservation, assignment denial, rollback after audit-write failure, reservation races, POS linkage, malformed holds, historical returns and financial reconciliation. It does not replace those services with success stubs.

`client/src/features/insights/advisorySchedule.test.ts` covers opt-in, concurrent execution, overdue catch-up, pause/cancel, locked/cashier denial, audit-failure rollback and portable restore. `phase1Services.test.ts` exercises stale reversal confirmation.

`qa/browser-release.spec.mjs` adds a complete store → transfer → reserved order → POS → delivery → financial report journey and a persisted advisory schedule journey. `qa/browser-offline.spec.mjs` adds actual HTTP/CSP negative assertions. The complete regression run and final source commit are recorded in the evidence manifest after verification.

## Boundaries still requiring completion

Full financial replication, active local-ledger encryption/recovery, per-store batch provenance and the other unclosed acceptance units are not made complete by these changes. The local contribution report is not full multi-device consolidated accounting. Hosted publication, online payments and automatic financial replication remain gated.

The original eight canonical migrations and the new customer-commerce migration remain unapplied to the hosted project. No external deployment, provider account, charge/refund, hosted migration, merge to main or customer-data modification was performed. Provider selection, actual sandbox integration and authorized hosted acceptance cannot be represented by local mock results. REVIEW.md and the original 82-unit register retain those distinctions.

## Browser-discovered regression

An order-to-POS journey intermittently saved an ordinary sale while leaving its reservation unconsumed. An early Chromium failure was initially suspected to involve hot reload; WebKit reproduced it on unchanged source. The cause was SalesPage clearing `saleCommerceOrderId` whenever a sales refresh completed while retaining the cart. Selection now resets only with company changes, explicit selection changes or successful checkout. The browser journey explicitly triggers focus refresh and verifies the selected order before completing payment. The same end-to-end journey passed in WebKit after the fix.

## Customer catalogue and authoritative reservations

`20261109123828_shop_public_commerce_reservations.sql` extends the existing shared-shop ledger. Owners explicitly publish an allowlisted catalogue, collection store, privacy notice/retention and tax-off confirmation. Anonymous visitors receive only the public projection. Authenticated, live-session customers reserve trusted stock/prices under the same company lock used by native POS. The catalogue digest binds current prices and return terms; changed terms require renewed review. Holds expire after 15 minutes and also constrain ordinary POS sales, adjustments and transfers. Three simultaneous holds and twenty daily requests per account/company bound abuse.

`/catalogue/:companyId` runs outside the private device database. The merchant's Online orders tab configures publication, reviews requests, records verified collection payments through the existing encrypted write-ahead queue, and records factual handling events. A linked POS sale consumes its hold atomically; tender/stock failures roll back both. Retrying a committed sale returns the same receipt. Existing receipts cannot be retroactively attached to a new hold. No online charge or provider success is invented. Expired customer contact details are excluded from RPC responses; an owner operation physically redacts up to 100 expired rows per invocation.

`qa/public-commerce.test.mjs` executes the complete migration chain and covers replay, tampering, changed price/return terms, bounded reservations, stock protection, atomic rollback, expiry, tenant isolation, revoked sessions, anonymous projection, direct-table denial and physical privacy redaction. `qa/public-commerce-browser.spec.mjs` drives customer and merchant browsers against those actual SQL functions. Only Auth/HTTP transport is synthetic: catalogue/order/POS/stock responses are generated by the canonical SQL, not success fixtures. It proves two reserved units result in one sale and exactly two fewer units, then customer-visible recorded collection.

This is local repository integration evidence, not hosted application evidence. The previously observed eight pending hosted migrations are still pending; the new commerce migration is a ninth. Public catalogue tax mode is explicitly off, consistent with the existing shared-shop till; this does not claim a tax-enabled shared catalogue or provider integration.
