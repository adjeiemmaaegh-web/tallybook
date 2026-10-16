# Tallybook V19 — Run 13 complete source-development increment

**Date:** 2026-10-16 (Asia/Dubai)  
**Development branch:** `v19/run13-multistore-development-20261016`  
**Reviewed source head immediately before this handover:** `02f13c6be1dc24cedc40793252f3fd3c3c32ef88`  
**Delivery classification:** **SOURCE DEVELOPMENT DELIVERED — UNCOMPILED / UNTESTED / NOT ACCEPTED**  
**Commercial release:** **NO-GO**. The owner explicitly deferred every executable test, typecheck, build, CI, browser and real-device acceptance gate. No production merge, live database changes, deployed sync, payment or staging operations were authorized.

## Scope and implementation

Run 13 (M, multi-store) is the offline-first, local-device store-scoped inventory and transaction increment. The scheduled **Run 14 (N)** contains optional secure inter-device replication; Run 13 makes **no** multi-device synchronization claim.

1. **IndexedDB migration v29** — `client/src/db/TallybookDB.ts` declares opt-in store-stock activation and immutable per-product store quantity events; unique submission/sequence keys and transfer request dispatch, receipt, return and reverse-request indexes. The v28 tables and historical records are preserved without inventing store origins.
2. **Opening allocation and cost conservation** — `client/src/features/stores/storeStockLedger.ts` requires owner permission, exact physical opening allocation covering every non-service company stock balance, verifies historical company inventory cost quantities and refuses ambiguous batch provenance. Company-level product quantity and financial/FIFO costing remain the authoritative total. Store quantity events partition it.
3. **Atomic store stock movements** — Sale, purchase, new product opening, manual increase/decrease and restockable cash-partial/full sale reversals post store quantity effects inside the same Dexie write transaction as their existing company inventory and finance postings. All are fail-closed if company and per-store balances do not reconcile.
4. **Attendant and store authorization** — At posting time, verify active company, current staff session, relevant staff permission, active store and assignment for non-owners. Direct checkout also validates a selling store even for service-only invoices. Store read views are separately authorized. Earlier read-only planning and journal modules remain available for offline review.
5. **Transfer lifecycle** — `storeTransfers.ts` now includes immutable request intent keys, source-assignment checks, dispatch reservation, destination receipt, two-leg atomic movement, idempotent submission replay checks, explicit returned-undelivered cancellation, and a new reverse-direction request rather than deleting an original completed transfer. Source reservations participate in stock-writing transactions and are subtracted from attendant available-to-sell quantities. Transfers do not create or destroy company-wide inventory quantities or FIFO financial value.
6. **Backup and restore compatibility** — `client/src/features/backup/backup.ts`, `run8BackupCompatibility.mjs`, `run13BackupAudit.mjs` and its declaration include the v29 journals in portable exports, accept older backups only where new tables did not exist, and reject duplicate/out-of-sequence/cross-company journal entries, mismatched company stock, unmatched transfer legs, fabricated movement links, deficient dispatch/receipt/return evidence, duplicate reversal identity and over-reserved source inventory. This is a source preflight, **not a completed restore test**.
7. **Application surfaces** — `SalesPage.tsx`, `PurchasesPage.tsx`, `InventoryPage.tsx`, `QuotationsPage.tsx`, `StoresPage.tsx`, and the saved pending-checkout intent now include relevant store selection, source-scoped sale availability, purchase receipt location, inventory adjustments, quotation conversion, owner-confirmed opening allocations, local balances, transfer lifecycle and read-only transaction activity.
8. **Reporting** — `run13StoreTransactionActivity.ts` describes local source-linked invoice, procurement, full reversal and cash-partial return counts and gross values with unattributed historical activity separately. This is **not** confirmed cash settlement, tax reporting, margin/profit or authoritative multi-device consolidated financials.

## Source review findings and corrections made during this increment

- Added deterministic per-product event sequence, unique v29 indexes, serialized Dexie stock writes, fail-closed negative-stock/quantity/cost checks and checked reservation arithmetic.
- Preserved original sale idempotency: a committed receipt may be recovered using its original store submission even if the store later closes or the operator's assignment changes, subject to the pre-existing staff auth.
- Strengthened transfer completion replay to verify the original two journal legs rather than acknowledging a possibly damaged saved request.
- Fixed the v29 backup validator to accept company-keyed activation rows without a generic `id`; made transfer checks understand completed and dispatched states.
- Fixed portable journal replay ordering and permitted outbound transfer after a verified prior inbound transfer; bound owner opening records to their actual company, store, product and activation timestamp.
- Disabled the old company-wide stock count and bulk stock CSV posting paths after per-store activation, blocked new ambiguous batch registrations, rejected archiving physical stock with remaining units and disallowed global `correction` in store-scoped mode. The read-only CSV export remains available.
- Integrated the quotation-to-sale path so conversion cannot silently bypass required store selection.
- Connected active source reservations to every recognized stock-moving transaction and attendant stock availability reads to prevent local dispatch/checkout oversells, including concurrent attempts.
- Kept separate company-configurable return/refund policy checks, original sale return-policy snapshots, tax evidence, receivable/reward corrections and inventory cost evidence; source changes do not override a company's no-refund policy.

## Explicit safety and release gates

- `STAGE9_RELEASE_SCOPE.authoritativeStoreStock = false` and `executeStoreTransfer = false`. They **remain false** while formal QA is deferred. Staged UI activation and execution controls are disabled. Do **not** override these on live customer data.
- `multiDeviceAttendantCheckout = false`, `remoteEventReplication = false`, `consolidatedStoreFinancials = false`. Run 14 and later release/analytics stages own the approved device/cloud and consolidated-finance work.
- Source review is neither typecheck nor executable verification. A real browser may still reveal code or migration defects; no claim of pass, error-free code, working deployment, data conversion or simultaneous-device correctness is made.
- Historical store origin for old sales/purchases is **not invented**. Refund restock into a different store, true per-store batch/FIFO cost provenance, external multi-device transfer acknowledgements and complex historical data repairs remain restricted until evidence-based designs and QA exist. If a transaction cannot demonstrate correct stock ownership, it fails closed.
- No client or server test executed, no local Windows/Android/Browser assessment, no GitHub Actions rerun, no production/remote database write, no merge into `main`.

## Deferred exact-head acceptance (not performed)

Later owner-authorized QA must compile/typecheck/build the exact final SHA, execute full Node/Vitest and real IndexedDB migrations from v28, verify encrypted portable backup export/restore including malicious and damaged store journals, cross-tab concurrent sales versus dispatch reservations, crashes during dispatch/receipt/refund, duplicate and mixed submission keys, partial/full company-configured returns, historical costing, store ledger conservation, staff revocation, cash/credit tax/accounting reconcilation, browser restart and Windows/Android low-spec performance. Real remote sync, if approved in Run 14, needs distinct multi-device/server identity, RLS and replay coverage.

## Handover policy

This is the **single consolidated Run 13 source-development handover**. The feature code and interface paths are staged together on this Run 13 branch. QA acceptance is deliberately deferred by the owner, not claimed. Keep historic blocker/traceability acceptance statuses unchanged until actual evidence exists. Future source work may progress to Run 14 under the owner's explicit *development-before-testing* instruction, while commercial release stays NO-GO.
