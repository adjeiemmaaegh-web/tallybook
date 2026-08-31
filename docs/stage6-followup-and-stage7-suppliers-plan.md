# Approval Plan — Stage 6 Follow-up and Stage 7 Suppliers & Purchases

**Status:** Proposed for owner review. **No follow-up or Stage 7 implementation has started.** Stage 6 is owner-approved. This document keeps the requested End of day improvement clearly separate from the new Stage 7 supplier-and-purchase workflow. A single explicit approval will authorize only the work described here; Stage 8 and later remain blocked.

## Part A — Stage 6 follow-up: clearer End of day separation and print/export

### A1. Purpose and scope

The current End of day page correctly distinguishes recorded sales, actual money received, and amounts still unpaid from today’s sales, but its adjacent panels can be easier to scan. The follow-up will strengthen the visual separation without changing **any amount, source record, date rule, or financial interpretation**.

It will add one owner-controlled **Print / save as PDF** action. This opens the browser’s normal print dialog; owners can print on paper or choose their browser/device’s “Save as PDF” destination. This satisfies both a print and locally-exportable copy without requiring a server, account, cloud storage, PDF service, or a new saved business record.

| Follow-up item | Proposed owner experience | Explicit safety boundary |
| --- | --- | --- |
| Recorded sales versus received money | Use two strongly separated, labelled panel families: **Sales recorded today** and **Money actually received today**. Each keeps an explanatory sentence immediately below it. | A part-paid sale remains under its chosen sale method; it is not reclassified as fully received. |
| Unpaid sales | Use a distinct warm attention panel and icon for **Still unpaid from today’s sales**, with the existing “at the time today’s sales were saved” explanation. | It remains a historical daily amount and does not become the current customer debt total. |
| Accessibility | Pair color with headings, icons, written explanations, borders, and visible keyboard focus; stack clearly at phone widths. | No meaning depends on color alone. |
| Print / save as PDF | Add a compact action in the End of day header. It invokes browser printing and is absent from the printed output. | It never saves, exports, uploads, synchronizes, locks, or changes business records. |

### A2. Print result and exclusions

The printed view will include the business name, local calendar date, core totals, recorded-sale method breakdown, actual-money-received breakdown, named-customer count, unpaid-from-today amount, and low-stock attention. It will print as a clear, single-column local summary with the navigation, buttons, status controls, and interactive chrome omitted. Its printed header will state exactly: **“End of day summary — not a receipt, invoice, tax document, or accounting statement.”** It is not a receipt, tax invoice, accounting close, bank reconciliation, payment-provider settlement, or official accounting statement.

If printing is unavailable in the current browser, the action will show a simple non-destructive notice. The button will be tested to make **no writes** to sales, payments, repayments, receipts, inventory, suppliers, purchases, or any other local table. No XLSX/CSV generation, email, share-to-cloud, PDF library, file-storage service, or automatic daily export is included.

### A3. Follow-up validation

Tests will confirm that the visual labels and explanatory statements remain visible, the print action calls `window.print` when available, an unavailable print interface shows a safe message, and neither path mutates local records. Browser checks will confirm the printed style hides controls and retains all totals. Phone, tablet, and desktop checks will verify no overlap between payment and unpaid panels and that action controls remain reachable.

## Part B — Stage 7: Suppliers & Purchases

### B1. Goal and workflow

Stage 7 adds a small-business workflow to answer two practical questions:

> **Where did I buy this product?**

> **How much am I spending to replenish stock?**

The workflow will stay deliberately short:

**Supplier → Purchase → Products → Quantity → Cost → Stock increases**

The owner creates a supplier once, records a completed purchase with one or more active products, and sees the corresponding stock increase and purchase history. The feature remains local-first, mobile-first, and appropriate for a small shop; it is not a procurement system or supplier-accounting package.

### B2. Proposed owner experience

The existing five primary destinations—Home, Stock, Customers, Sales, and Reports—remain unchanged. A non-primary **Purchases** workspace will be discoverable from Stock and a suitable Reports/End of day context link, without displacing Backup or Business controls.

The workspace will contain a short current-purchase form and a simple recent-purchase history. Supplier management appears as a dedicated, plain-language sheet or workspace reached from Purchases: add a supplier, view/edit their details, see their related purchases, and archive a supplier if the relationship ends. Archive preserves all previous purchases; permanent deletion is not offered.

| Workflow step | Required input and validation | Result |
| --- | --- | --- |
| Add supplier | Name is required; phone, email, address, and notes are optional. Names are normalised to prevent accidental duplicates. | A local supplier record is available for purchases. |
| Start purchase | Select an active supplier and a purchase date, defaulting to the device’s current date. | The purchase is associated with a truthful supplier snapshot and date. |
| Add products | Select one or more active products, each once; enter a positive whole quantity and a non-negative unit cost. | Per-line cost and total are clearly calculated before completion. |
| Complete purchase | Confirm the displayed total and complete once. Invalid/archived supplier or product, duplicate line, invalid amounts, or invalid quantity block completion. | One atomic local transaction adds history and stock. |
| Review history | Latest purchases show supplier, date, total cost, item count, and a read-only detail. Product records can surface relevant purchase history. | The owner can trace where stock came from without editing the historical purchase. |

### B3. Data model and migration proposal

Stage 7 is expected to add a deliberate Dexie schema migration from **version 8 to version 9**. Existing Stage 1–6 business data remains untouched. The migration only creates the new stores/indexes and optional purchase provenance fields; it does not alter historical stock counts, movement history, payment records, receipts, customer debt, Mobile Money providers, or Backup data.

| Local record | Proposed key fields | Purpose |
| --- | --- | --- |
| `suppliers` | `id`, `businessProfileId`, `name`, `normalizedName`, optional contact/details, `archivedAt`, `createdAt`, `updatedAt` | Local supplier directory, retaining history after archive. |
| `purchases` | `id`, `businessProfileId`, `supplierId`, immutable `supplierName` snapshot, `purchaseDate`, `totalCostMinor`, optional note, `createdAt`, unique `submissionKey` | Immutable completed replenishment event and duplicate-submission protection. |
| `purchaseLines` | `id`, `purchaseId`, `productId`, immutable `productName` snapshot, `quantity`, `unitCostMinor`, `lineTotalMinor` | Read-only item/cost history for the purchase. |
| `inventoryMovements` extension | Add the `purchase` movement type and optional `purchaseId` provenance reference. | Links each stock increase to its immutable completed purchase while retaining all existing movement types. |

The purchase completion service will use a **single Dexie read-write transaction** covering suppliers, products, purchases, purchase lines, and inventory movements. It will validate all inputs first, check the submission key before writing, add the immutable purchase/lines, increase every product quantity, and create one positive `purchase` movement per line. If anything fails, no partial purchase, line, stock change, or movement remains. Repeating the same submission key returns the already-completed purchase and does not increase stock twice.

Purchases are historical records. The initial Stage 7 scope will not edit, void, delete, return, or reverse completed purchases. Genuine count corrections continue to use the existing stock-adjustment workflow and remain visible as their own movements. A newly discovered purchasing error can be documented via an appropriate correction only; no silent rewrite of supplier/purchase history is added.

Stage 7 stores the cost paid for a purchase line but **does not** automatically change a product’s existing cost-price field, selling price, profit figure, tax treatment, or stock valuation. This avoids inventing a costing/accounting rule that the owner did not request.

### B4. Integrity, recovery, and offline contract

Backup/Restore will be extended to include suppliers, purchases, purchase lines, and purchase-linked movements. Restore remains a single owner-confirmed atomic replacement of local data. Earlier v8 and older valid backup files will continue to load with the new record arrays treated as empty, while a future-version file remains rejected. A Stage 7 backup therefore preserves the supplier/product-name snapshots needed for historical purchase traceability.

The read-only integrity audit will add checks for orphaned purchase lines, missing/archived suppliers or products where relevant to history, invalid line totals, purchase-total mismatch, duplicate relationships, and missing/inconsistent purchase stock movements. It will continue to **report only** and never repair, upload, or change records itself.

The app remains fully local-first: browser IndexedDB/Dexie is the business-data source of truth; the PWA worker caches the application shell only; no `localStorage` business store, server, remote database, account, cloud sync, upload, supplier API, payment API, or automatic transfer is added. Following a successful initial application load, the supplier and purchase workflow, its stock updates, and history continue to work offline. Owners should retain Backup copies because browser/device storage can still be cleared outside Tallybook.

### B5. Deliberate exclusions

Stage 7 will not add purchase orders, approval workflows, purchase payments, supplier debt/accounts payable, supplier invoices, partial deliveries, receiving against orders, returns, refunds, reversals, tax, landed cost, stock valuation, weighted-average costing, automatic price changes, profit analysis, expenses, budget, staff roles, multi-location stock, barcode scanners, remote integrations, cloud sync, accounts, or any Stage 8–10 function.

It will not weaken or replace Stage 1 Mobile Money/provider/reference behaviour; Stage 2 debt/repayment logic; Stage 3 read-only receipts and sharing; Stage 4 offline/data safety; Stage 5 daily summary; Stage 6 End of day history; product archiving; Backup/Restore; or the integrity audit.

### B6. Validation plan

Automated tests will cover supplier creation, normalised duplicate prevention, update/archive with historical preservation, v8→v9 migration preservation, valid multi-line purchase completion, exact positive product stock changes, exact purchase-movement provenance, line/purchase totals, invalid quantity/cost/duplicate-product/archived-record protection, atomic rollback, and submission-key idempotency. They will also verify a completed purchase cannot be silently edited or deleted.

Backup tests will verify full export/restore of new tables with supplier/product snapshots and legacy backup compatibility. Integrity tests will verify new purchase relationships and no-mutation audit behavior. Cross-stage tests will retain Mobile Money labels/snapshots, partial/Credit sales, customer debt/repayments, receipts, existing stock adjustments and sale movements, product archives, daily summary, End of day summary/print, Backup/Restore, and offline reopening.

Browser validation will use isolated local data to create a supplier, record a multi-line purchase, verify the displayed cost and stock increase, inspect product and purchase history, refresh/reopen, toggle offline after initial load, and prove the records remain local. It will attempt duplicate submission and invalid input paths to confirm no duplicate purchase or stock increase occurs. Responsive validation will cover phone, tablet, and desktop; accessibility checks will include keyboard navigation, focus indicators, labelled fields, live errors, opaque dialogs/selects, and touch-safe controls.

| Release check | Required outcome |
| --- | --- |
| Automated suite | All prior tests plus focused Stage 6 follow-up and Stage 7 supplier/purchase/migration/backup/integrity tests pass. |
| Type/build/security | Type-check, PWA production build (manifest and worker), and production dependency audit pass. |
| Browser/offline | End-of-day print/non-mutation, supplier creation, purchase atomicity/idempotency, stock traceability, refresh/reopen, and offline current-app workflows pass. |
| Public release | A Git commit and auto-published checkpoint are verified on a fresh public URL before owner testing begins. |

### B7. Owner acceptance steps after implementation

1. Open End of day and verify the **Sales recorded**, **Money actually received**, and **Still unpaid from today’s sales** areas are visibly distinct and their written explanations remain clear.
2. Use **Print / save as PDF**. Confirm the browser print dialog opens; print or save locally if desired. Confirm the summary shows the expected business/day totals and no record is added or altered after closing the dialog.
3. Add a supplier with a name and optional contact details. Refresh/reopen and confirm it remains available. Archive a supplier only after recording history and confirm earlier purchases remain visible.
4. Record a multi-product purchase for an active supplier, with positive quantities and costs. Confirm the displayed total equals the line totals, then complete once.
5. Confirm each purchased product’s on-shelf quantity increased by exactly the purchased amount and a positive purchase movement/purchase history is visible. Refresh/reopen and verify everything remains correct.
6. Try to complete the same purchase twice or submit invalid quantity/cost/product/supplier data. Confirm no duplicate purchase, duplicate movement, or double stock increase is created.
7. Make a normal sale after the purchase. Confirm sale stock decrements and its receipt/payment/customer behaviour still work separately from purchase history.
8. Turn off connectivity after the app is loaded. Create a supplier and purchase, refresh/reopen, and confirm the local records remain available with the existing offline status and no sync/upload control.
9. Create a Backup, restore/check it in the supported workflow, and run Check local records. Confirm supplier/purchase records survive and the audit does not change them.

## Approval gate

> Please explicitly approve this combined plan before implementation. Approval authorizes **only** the Stage 6 End of day follow-up and Stage 7 Suppliers & Purchases described here. The implementation will stop after one deployed, owner-testable release and completion report. **Stage 8 will not begin until you test and explicitly approve the completed work.**
