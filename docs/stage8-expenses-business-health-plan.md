# Stage 8 Plan — Expenses & Simple Business Health

**Status:** Proposed for owner review. **No Stage 8 code, schema, PWA configuration, or deployment behavior has changed.**

## 1. Goal and practical outcome

Stage 8 will let the owner record ordinary money spent—such as transport, rent, utilities, supplies, repairs, and other costs—and then review a simple, local **Business Health** picture. The aim is to answer one practical question in plain language:

> **Where is my money going, and what needs my attention?**

The result will remain a lightweight business record, not accounting software. It will use the same on-device record architecture as the approved sales, payment, customer debt, inventory, supplier, purchase, receipt, Backup, and integrity features. It will work while offline after the app has been loaded successfully on the device.

## 2. Current approved foundation

The application already has distinct local records for sales, sale payments, customer repayments, customer debt, inventory, suppliers, purchases, purchase lines, and stock movements. Stage 6 intentionally distinguishes **sales recorded**, **money actually received**, and **unpaid sales**. Stage 7 records supplier purchase costs only as stock-replenishment history. Stage 8 will preserve those distinctions instead of combining every outgoing amount under one misleading figure.

| Existing record type | Meaning retained in Stage 8 | Stage 8 treatment |
| --- | --- | --- |
| Completed sale | Value of goods sold | Displayed as **Sales**; never edited by expense actions. |
| Sale payment / customer repayment | Money actually received | Displayed as **Money collected**; never treated as an expense. |
| Customer debt | Amount still owed by customers | Displayed as **Customer debt**; unchanged and not netted off silently. |
| Supplier purchase | Stock received and its historic cost | Remains a purchase/stock record, **not** an expense entry. |
| Inventory / low stock | Current product attention state | Displayed as **Low stock** using existing active-product logic. |
| New expense | Business money-spent entry | Displayed separately as **Expenses recorded** and by simple category. |

## 3. Proposed owner workflow

### Record an expense

An **Expenses** workspace will be added as a contextual destination from Reports and Business Health, without changing the five primary operating destinations or the existing Backup presentation. The page will use a compact mobile-first form with these fields:

| Field | Requirement | Notes |
| --- | --- | --- |
| Expense category | Required | Fixed plain-language choices: Transport, Rent, Utilities, Supplies, Repairs, Other. |
| Amount | Required | Positive monetary amount in the saved business currency, stored in minor units. |
| Date | Required | Defaults to today but can represent a prior date. Future dates will be rejected. |
| Note | Optional | Short owner note, such as “market delivery” or “shop bulb”. |

After the owner saves an expense, the page will confirm that it is saved on this device and show it in a read-only history grouped by date. Expense history will show the original category, amount, date, and note. The first delivery will deliberately provide **no edit or delete control** for saved expenses. If an error is made, the owner will record a correcting separate expense only after a later, explicitly approved correction workflow; Stage 8 itself will not invent reversals or mutable financial history.

### Review Business Health

A contextual **Business Health** view will provide a quick plain-language overview for **Today**, **Last 7 days**, or **All saved records**. It will use existing report date-range semantics and will not replace the Stage 5 Home summary or Stage 6 End of day review.

The view will include these independent panels:

| Panel | Exact meaning | Owner wording |
| --- | --- | --- |
| Sales | Completed sale totals in the selected period | **Sales recorded** |
| Money collected | Sale payments and customer repayments in the selected period | **Money collected** |
| Customer debt | Current derived customer balance, regardless of period selection | **Customers still owe** |
| Expenses | Saved expense total in the selected period | **Money spent** |
| Expense categories | Expense subtotal by fixed category | **Where money went** |
| Low stock | Current active products at/below their saved threshold | **Stock to check** |

A small, plainly labelled comparison may show **Money collected less recorded expenses** for the selected period. It will be introduced only with a permanent nearby clarification: **“This is not profit. It does not include stock costs, unpaid sales, or other accounting costs.”** This avoids implying that purchase costs, debt, stock value, or profit have been calculated. The view will not use jargon such as EBITDA, accounts receivable, margin, or financial ratios.

Each card will link only to established relevant destinations—Sales, Customers owing, Stock, or Expenses—so it helps action without creating a second ledger or duplicate data.

## 4. Data architecture and migration

The only proposed persistence change is an additive Dexie **v9 → v10** schema migration. It will add an `expenses` store. Existing v9 sales, payments, receipts, repayments, products, inventory movements, Mobile Money providers, suppliers, purchases, and purchase lines will remain unchanged.

```text
Expense
  id
  businessProfileId
  category: transport | rent | utilities | supplies | repairs | other
  amountMinor
  expenseDate               // local calendar day selected by owner
  note?: string
  submissionKey             // unique duplicate-submission guard
  createdAt
```

The proposed indexes will support owner-visible local queries without a remote service: `businessProfileId`, `expenseDate`, `createdAt`, `category`, and a unique `submissionKey`. The migration creates an empty table only. It will not rewrite historical records, update product cost prices, create inventory movements, change stock quantities, alter supplier purchases, or change debt calculations.

Expense creation will use one local Dexie transaction over the `expenses` table and will persist the submission key. A repeated save attempt with the same submission key will return the existing expense instead of creating another amount. Form validation will reject missing categories, invalid/zero/negative amounts, invalid dates, and a date after the owner’s current local calendar day. There will be no automatic imports, cloud queues, localStorage business persistence, background upload, account, API, or payment-provider call.

## 5. Integrity, recovery, and offline safeguards

Backup will be extended so a complete local backup includes the `expenses` array. Restore will validate the records before replacing the current local record and will restore expenses atomically with all existing tables. Backups made before Stage 8 will remain valid; their expense array will be treated as empty. A valid current backup must retain expense category, amount, date, note, creation time, and submission key.

The existing **Check local records** audit will gain read-only expense checks: valid business profile link, valid allowed category, positive whole `amountMinor`, valid non-future date, required timestamps, and submission-key uniqueness. It will report problems but will not repair, delete, normalize, transfer, or silently change any expense or existing business record.

| Safeguard | Stage 8 contract |
| --- | --- |
| Offline first | Once the app shell has loaded, owners can record/view expense and Business Health data while offline. All business data remains on the device. |
| First-load limitation | A browser needs a successful initial application load for the PWA shell to be cached. Device/browser storage can still be cleared or evicted, so regular owner-controlled Backup remains important. |
| No financial blending | Expenses remain distinct from supplier stock purchases, payments received, customer debt, sales, profit, and tax. |
| Immutable initial history | Completed expenses have no Stage 8 edit/delete/reversal workflow. |
| No hidden data path | No cloud sync, upload, backend, remote database, account, sync button, or localStorage business ledger. |

## 6. Deliberate exclusions

Stage 8 will **not** add supplier payable balances, bills, invoices, purchase orders, expense receipt capture, attachment storage, recurring expenses, budgets, expense approval, staff expenses, tax, VAT, profit/loss statements, payroll, bank reconciliation, inventory valuation, cost of goods sold, refunds, reversals, editable saved expenses, data export beyond the existing owner-controlled Backup and approved browser print facilities, WhatsApp sharing, AI, country locking, language expansion, or any Stage 9+ capability.

## 7. Implementation sequence

The implementation will proceed in a controlled order. First, the v10 schema, expense types, input validation, idempotent creation service, and local report derivations will be added. Second, the Expenses and Business Health views will be added as non-primary contextual routes, with mobile-safe forms, opaque surfaces, focus management, empty states, error states, and clear small-screen labels. Third, Backup/Restore and the integrity audit will be extended. Finally, automated, browser, offline, responsive, accessibility, production/PWA, and public deployment validation will run before any release.

## 8. Test and validation contract

| Layer | Required verification |
| --- | --- |
| Expense domain tests | Validation; allowed categories; stable minor-unit arithmetic; same-key idempotency; atomic failure with no partial record; no future dates; legacy v9 migration preservation. |
| Reporting tests | Exact selected-period totals; category grouping; current customer debt; payments/repayments separate from expenses; purchases excluded from expenses; low-stock active-product filtering; no-data behavior; not-profit clarification. |
| Backup/Restore tests | Expense export/restore; all Stage 1–7 records preserved; pre-v10 backup compatibility; invalid expense records rejected without partial replacement. |
| Integrity tests | Valid expense clears; malformed category/amount/date/profile/submission-key records reported; audit remains non-mutating. |
| Component/route tests | Plain labels, card destinations, keyboard navigation, focus, error messages, solid mobile form/dialog surfaces, and no accidental primary-navigation change. |
| Browser workflow | Create each category; submit once and attempt a repeat; confirm history and Business Health; verify sales/payment/debt/purchase figures keep their meanings; refresh/reopen; check low stock and links. |
| Offline workflow | Load app first; simulate offline; record expense; verify the expense and health figures locally; refresh/reopen with cached shell where supported; reconnect and confirm the truthful no-upload language. |
| Cross-stage regression | Cash/Card/Credit/Mobile Money/provider/reference, partial payments, customer repayments/debt, receipt view/share/print, stock movements, suppliers/purchases, End of day printing, Backup/Restore, and integrity audit. |
| Release | TypeScript, full suite, production audit, PWA build/artifacts, phone and desktop checks, fresh public deployment verification, Git commit, checkpoint, and owner-testable URL. |

## 9. Owner acceptance checklist after implementation

1. Create one expense in each category, using an optional note on at least one record. Confirm the exact amount, selected date, category, and note appear after saving and after a refresh.
2. Attempt to submit the same open expense twice quickly. Confirm only one expense appears and the total increases once.
3. Open Business Health for Today and Last 7 days. Confirm Sales, Money collected, Customers still owe, Money spent, category totals, and Stock to check are independently understandable.
4. Make a part-paid or Credit sale and a customer repayment. Confirm Money collected and Customers still owe remain distinct from Money spent.
5. Record a supplier purchase. Confirm it increases stock and remains purchase history, not a new expense total.
6. Create a Backup and ensure expense information is included. If testing Restore, make a fresh backup first because Restore replaces current device records.
7. Load the application, switch the device/browser offline, record a small expense, and confirm it remains after refresh/reopen. Restore connectivity and confirm no sync/upload claim appears.
8. Run Check local records and confirm it reports clean data without altering totals or history.

> **Approval gate:** Implementation will start only after explicit owner approval of this Stage 8 plan. After the deployed Stage 8 build is delivered, the work will stop at **WAITING FOR OWNER TESTING**. Stage 9 will not begin until the owner has personally tested and approved Stage 8.
