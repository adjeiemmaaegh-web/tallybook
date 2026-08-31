# Pre-Implementation Confirmation — Stage 6 Follow-up and Stage 7

**Status:** All uploaded requirements are accepted. No Stage 6 follow-up or Stage 7 implementation has started. This confirmation is a protection agreement and implementation gate, not a completion report.

## 1. Accepted requirements

I accept every listed safeguard. The existing local Dexie/IndexedDB business record remains the only source of truth. The work will extend, not replace, current atomic sales, Mobile Money provider/reference snapshots, customer debt and repayments, receipts, stock movements, Backup/Restore, read-only integrity audit, daily summary, and End of day reporting.

The Stage 6 follow-up will preserve the three distinct financial meanings exactly: **Sales recorded today** remains completed sales saved today; **Money actually received today** remains actual received sale payments and customer repayments; and **Still unpaid from today’s sales** remains the outstanding amount at the time today’s sales were created. These values will not be merged, and the unpaid daily figure will never be presented as total current customer debt.

Its only output action will be the browser-native **Print / Save as PDF** dialog. It will work from the rendered local page, including offline after an initial application load, and creates no database record, modifies no business data, uploads nothing, and adds no external or cloud dependency. The printed output will include the required local summary information and this exact disclaimer:

> **End of day summary — not a receipt, invoice, tax document, or accounting statement.**

Stage 7 will remain the concise local workflow **Supplier → Purchase → Products → Quantity → Cost → Stock increase**. Completed purchases will be immutable historical facts: no silent edit, delete, or rewrite. Each purchase will store an immutable supplier-name snapshot, so a later supplier rename does not change old purchase history. Purchase cost is historical purchase data only; it will not automatically change selling prices, product cost price, profit, tax, valuation, or any accounting calculation.

Purchase stock increases will be explicitly recorded as purchase-linked inventory movements, distinct from sale reductions, manual adjustments, corrections, opening stock, and other changes. Supplier debt/balances/payments/invoices, accounts payable, purchase orders, approvals, and all other procurement/accounting features are excluded.

## 2. Planned schema and local-record changes

The Stage 6 follow-up requires **no database/schema change**. The print and layout work is read-only.

Stage 7 will introduce one intentional Dexie migration from **schema version 8 to version 9**. It will add `suppliers`, `purchases`, and `purchaseLines` tables, and extend inventory movement values/records to support a `purchase` movement with a `purchaseId` reference. The completed purchase holds supplier and product name snapshots, date, totals, notes, and a unique submission key; purchase lines hold product snapshot, quantity, unit cost, and line total.

No existing record is rewritten. Existing v8 sales, payments, receipts, customer debt/repayments, Mobile Money provider/reference snapshots, products, quantities, and stock-movement history remain exactly as saved.

| Area | Planned treatment |
| --- | --- |
| Existing business records | Preserved unchanged by the v8→v9 migration. |
| Suppliers/purchases | New local records only; completed purchase facts become read-only. |
| Stock update | One transaction validates, writes purchase/lines/movements, and increases product stock together. |
| Duplicate attempt | The unique purchase submission key returns the existing completed purchase and prevents a second stock increase. |
| Backup/Restore | Extend export, validation, and atomic restore to the new tables; valid earlier backups restore with empty new-record arrays. |
| Integrity audit | Add read-only checks for missing/orphaned lines/relationships, incorrect totals, and missing or inconsistent purchase movements. |

## 3. Migration approach

The migration will be additive. Dexie version 9 will declare the new stores/indexes while retaining the full v8 schema declarations. There will be no transformation or write loop over historical business records. Schema metadata will be updated by the existing database initialisation behaviour only.

The backup parser will treat valid legacy files that do not contain the new arrays as empty supplier/purchase data. It will keep rejecting malformed, duplicate, or future-version backups. Restore will remain a single owner-confirmed transaction; it will not upload, merge remotely, or create a second database.

Migration tests will begin with an explicit v8 fixture containing business profile, products and movements, completed Cash/Card/Mobile Money/Credit sales, provider/reference snapshots, customer debt/repayments, receipts, reports, and End of day facts. After opening under v9, tests will compare those records and stock history before and after migration, then verify the new stores are available but empty.

## 4. Identified risks and controls

| Risk | Control |
| --- | --- |
| Confusing sales, received money, and unpaid sales | Separate headings, panel treatment, written definitions, test fixtures with part-paid/Credit sales and repayments, plus print-specific assertions. |
| Partial stock increase or orphaned history if a purchase fails | A single Dexie read-write transaction across the supplier, product, purchase, lines, and movement stores; failure-path tests verify rollback. |
| Double tap/retry creates double stock | Purchase submission key, disabled in-flight completion, and idempotency tests/browser checks. |
| Supplier rename erases historical provenance | Immutable `supplierName` snapshot on completed purchase, verified after rename/archive. |
| Cost information accidentally becomes accounting logic | Store historical line costs only; explicitly prohibit automatic product-cost/selling-price/profit/valuation updates. |
| Backup omits a new record type | Extend backup/restore tables, counts, parser, migration compatibility, and browser recovery tests before release. |
| Offline PWA shell is unavailable before first load | Continue the truthful requirement: load the app successfully first. Existing local records remain local; owners should retain an owner-controlled Backup copy. |
| Print action changes records | Browser-native `window.print` only, paired with non-mutation test counts before/after printing. |

## 5. Stage 8 and later remain blocked

**Confirmed:** Stage 8, Stage 9, Stage 10, and any other later enhancement are blocked. No expense tracking, business-health calculation, accounting, cloud service, external integration, or other later-stage function will be started while this combined work is underway or after delivery without subsequent owner testing and explicit approval.

## 6. Delivery and stop boundary

**Confirmed:** work will stop after the approved Stage 6 follow-up and Stage 7 scope have been implemented, validated, committed, deployed, and handed over for owner testing. The handover will include the implementation report, changed files/features, version-9 migration details, exact automated and browser/offline results, Backup/Restore results, known warnings, deployed link, and owner acceptance checklist.

> No Stage 8 implementation will begin until the owner has personally tested the deployed combined release and explicitly approved it.
