# Enhancement Roadmap — Stage 3 Plan: Receipts & Easy Sharing

**Status:** Planning only. No Stage 3 code, schema, receipt, sharing, print, test, or deployment change is authorized until the owner explicitly approves this plan.

## 1. Purpose and planning conclusion

Stage 3 will make a completed sale feel finished and easy to communicate. The owner must be able to view a clear receipt immediately after checkout, reopen the same saved receipt later, share its factual text through the phone’s normal sharing mechanism where available, print it when a browser supports printing, and return to work with **Done**.

> A receipt is a readable view of the sale facts already saved on this device. It is **not** a new sale, payment, balance, or accounting ledger.

The current transaction already writes a sale, immutable line snapshots, optional payment, receipt record, customer activity, stock change, movement, and receipt number together. Stage 3 should reuse those records, not duplicate them.

## 2. Current baseline and planned gap closure

| Requirement | Current approved baseline | Stage 3 proposed work |
| --- | --- | --- |
| Clear confirmation after sale | Checkout shows a compact saved-receipt confirmation with number, date, payment, total, and outstanding amount. | Expand this into a receipt action panel with **View receipt**, **Share receipt**, **Print**, and **Done**. |
| Persisted receipt | A `receipts` record is committed in the existing atomic sale transaction; sales, line items, and payment records already preserve the relevant factual values. | Add a read-only receipt-detail resolver and stable local receipt view using the existing sale/receipt relationship. |
| Receipt detail | Recent sales currently shows receipt number and headline amount. | Render business name, date/time, receipt number, customer, item lines, quantities, unit prices, discount, total, paid amount, remaining amount, payment method, and Stage 1 provider/reference details when present. |
| Mobile sharing | No owner-facing native sharing action exists. | Use `navigator.share` only from an owner tap; otherwise offer copy-to-clipboard and a clear manual-copy fallback. |
| Printing | No focused receipt print action exists. | Use the browser’s native print request from the receipt detail only; show a clear availability message if it cannot be opened. |

## 3. Proposed owner workflow

1. The owner completes a sale once through the existing atomic checkout flow.
2. A **Receipt saved** confirmation appears with the receipt number and a factual summary. The owner can tap **View receipt**, **Share receipt**, **Print**, or **Done**.
3. **View receipt** opens a focused, printable local receipt surface. The receipt shows the information saved at sale completion, including Mobile Money provider/reference data where the payment contains it.
4. **Share receipt** creates a short, professional plain-text receipt. On a compatible phone, the browser opens the device share sheet. On unsupported devices, the app copies the same text to the clipboard; if copying is blocked, it leaves the receipt text visibly available for manual copying.
5. **Print** invokes the browser’s normal print function where available. It never requires a printer, a cloud service, or a generated PDF.
6. **Done** closes the receipt surface or confirmation and returns the owner to normal Sales work. It never deletes, marks sent, changes, or re-saves a receipt.
7. Later, the owner can use **View receipt** from recent sales to reopen a saved local receipt after refresh/reopen.

The shared message will be a text record—not a link to the owner’s local data—because a recipient’s device cannot read the owner’s IndexedDB records. It will contain only the receipt’s business facts and no application-internal identifiers beyond the receipt number.

## 4. Receipt content contract

| Receipt section | Saved/local source | Presentation rule |
| --- | --- | --- |
| Business name | Current local business profile | Show the configured business name at the top. |
| Date/time and receipt number | Existing receipt/sale timestamps and `receiptNumber` | Show in the owner’s local device format. |
| Customer | Existing sale `customerId` joined to preserved local customer record | Show named customer where applicable; otherwise show **Walk-in customer**. |
| Products and quantities | Immutable `saleLines` snapshots | Show product name, quantity, unit price, and line total. |
| Discount and total | Existing immutable sale amounts | Omit a zero discount; show subtotal, discount when present, and total. |
| Paid and remaining | Existing sale `amountPaidMinor` and `outstandingMinor` | Show remaining amount as the amount outstanding **at the sale**, not a later changing customer balance. |
| Payment | Existing optional payment record and sale method | Always label `mobile` as **Mobile Money**. Include Stage 1 provider/reference snapshot when saved. Credit shows **Credit / pay later** with zero paid. |

The receipt detail will fail safely if its linked local sale or receipt record is absent or mismatched: it will show a readable unavailable state and will not fabricate information, modify data, or attempt automatic repair.

## 5. Data, migration, backup, and integrity approach

### Persistent data decision

No database migration or new table is proposed. The existing receipt record is sufficient as a persistent anchor, while the completed sale, immutable sale lines, optional payment snapshot, and business/customer records provide the display facts. Schema version 8 remains unchanged.

Stage 3 will not write a "shared" flag, print count, copy history, downloadable-file record, or editable receipt body. Those would create new non-business records without improving the owner’s core transaction integrity.

### Atomicity and idempotency

Receipt viewing, formatting, sharing, copying, and printing are all read-only after a sale exists. They must not call `completeSale`, decrement stock, create a new payment, append a repayment, or modify the receipt record. The existing checkout submission key and one-transaction sale behavior stay authoritative.

### Backup and restore

The current local backup already contains sales, sale lines, payments, receipts, customers, and business profile records. Stage 3 will add a regression that exports/restores a cash or Mobile Money receipt and proves the rebuilt receipt view still has correct line items, amounts, payment label, provider/reference snapshot when present, and receipt number. Backup format version and restore semantics remain unchanged.

### Integrity audit

The integrity audit remains read-only. It already protects record relationships; Stage 3 will extend or confirm receipt-link checks only where required to report a missing or mismatched receipt/sale relationship. It will not auto-create or mutate receipt records.

## 6. User-interface and accessibility plan

The receipt will keep the approved compact Tallybook Africa cobalt operating UI while being optimised for a narrow phone. The most important values—receipt number, total, amount paid, and remaining amount—will be immediately scannable. Product lines will remain readable without horizontal clipping, and action controls will be solid, opaque, touch-safe, keyboard reachable, and plainly named.

The receipt surface will have an accessible title, visible close/Done control, clear focus order, and appropriate focus return after it closes. The native share and print requests will happen only on explicit owner interaction. Print CSS will suppress navigation and application chrome, presenting the receipt content alone without changing the screen record. Reduced-motion and existing high-contrast focus expectations remain protected.

## 7. Implementation sequence after approval

| Order | Deliverable | Protected behavior |
| --- | --- | --- |
| 1 | Add a read-only receipt-detail view model joining receipt, sale, immutable sale lines, payment, customer, and business profile. | No table, schema, sale, stock, receipt, or payment write. |
| 2 | Add a reusable receipt detail surface and stable local open/reopen path from the checkout confirmation and recent sales. | Older receipts with no Stage 1 provider/reference fields remain readable. |
| 3 | Add plain-text receipt formatting, native share, clipboard fallback, visible manual-copy fallback, and native print request. | No backend, WhatsApp API, email, PDF service, or shared public receipt URL. |
| 4 | Style mobile, desktop, and print states within the established prototype-faithful visual system. | Existing POS completion control, offline notice, select/dialog opacity, and navigation remain intact. |
| 5 | Add feature, backup/restore, integrity, UI, and browser regression coverage. | No duplicate sale/payment, stock change, or ledger mutation from receipt actions. |
| 6 | Validate, document, commit, deploy a testable build, report, and stop for owner approval. | No Stage 4 work begins. |

## 8. Test strategy

Automated coverage will prove that receipt-detail resolution correctly renders a Cash receipt, full Mobile Money receipt with provider/reference snapshot, Credit receipt, and part-payment receipt with amount due. It will assert product line snapshots, quantities, price totals, discount, customer/walk-in labels, total, paid, remaining, and `mobile` → **Mobile Money** wording.

Share tests will mock supported native sharing, a rejected share request, clipboard fallback, and unavailable clipboard conditions. Print tests will stub the native print call and assert that it is invoked only by a receipt action. Each path will prove no additional sale, payment, repayment, movement, receipt, or inventory write occurs.

Regression tests will verify saved receipt access after refresh/reopen, backup/restore detail reconstruction, historical `mobile` records without provider/reference details, receipt-link integrity reporting, Stage 1 provider snapshots, Stage 2 debtor calculations, local offline operation, keyboard focus, PWA build artifacts, and responsive layouts.

## 9. Manual owner acceptance after implementation

1. Complete a Cash sale. Confirm the saved confirmation offers **View receipt**, **Share receipt**, **Print**, and **Done**.
2. Open the receipt. Confirm business name, date/time, receipt number, items, quantities, prices, discount if used, total, paid amount, and remaining amount are accurate.
3. Complete a full Mobile Money sale with a saved provider and reference. Confirm the receipt says **Mobile Money** and includes the provider/reference.
4. Complete a Credit sale and a named-customer part-payment sale. Confirm their receipts show the original paid and remaining amounts correctly.
5. Refresh/reopen the application. Reopen each receipt from Sales and confirm its factual detail remains available.
6. On a phone that supports browser sharing, use **Share receipt** and confirm the device share sheet receives the factual text. On an unsupported device, confirm the copy/manual-copy fallback is clear.
7. Use **Print** on a supported desktop or browser and confirm only the receipt is targeted; cancel if no printer is available.
8. Confirm no receipt action creates another sale, payment, customer repayment, stock movement, or receipt record.
9. Create/restore a backup and confirm a saved Mobile Money receipt remains readable afterwards.

## 10. Explicit exclusions

Stage 3 will not add receipt emails, SMS, WhatsApp APIs, public receipt links, public cloud uploads, QR payments, receipt PDF generation service, printer requirement, payment reversal, refunds, invoice allocation, due dates, reminders, suppliers, expenses, language expansion, cloud sync, accounts, or any Stage 4–10 feature.

## 11. Approval gate

> **No Stage 3 implementation has started.** Approval of this plan is required before any application, database, receipt, print, sharing, test, documentation, or deployed behavior is changed.

If approved, work will remain within this scope, deploy an owner-testable version, provide a detailed Stage 3 completion report, and stop for explicit owner acceptance before Stage 4.
