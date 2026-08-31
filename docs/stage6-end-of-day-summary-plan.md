# Stage 6 Plan — End-of-Day Business Summary

**Status:** Proposed for owner review. **No Stage 6 implementation has started.** Stage 5 is owner-approved. Stage 6 and every later roadmap stage remain blocked until this plan is explicitly approved.

## 1. Purpose and guiding decision

Stage 6 will add an optional, read-only **End of day** view that answers one plain question:

> **What happened in my business today?**

It will give the owner a simple end-of-day review of completed sales, actual money received, credit, named customers served, and low-stock attention. It will build on the approved Stage 5 Home summary and existing Reports page rather than create accounting software or a second sales ledger.

The plan deliberately **does not implement a Close day action**. A close action could wrongly suggest that late sales, repayments, corrections, or delayed entries are forbidden or would harm the record. The existing business model does not lock completed sales by date, and Stage 6 will preserve that flexibility. The owner may open the summary at any time, including after normal business hours, and the view will simply recalculate from saved records.

## 2. Owner workflow

The owner will find an **End of day** entry from Home and/or Reports, leading to a dedicated mobile-first summary. The screen will show today’s local date and a short explanation that figures come from records saved on this device. There is no required end-of-day procedure, confirmation dialogue, reset, lock, or irreversible action.

The owner can review the screen, use existing destination links to investigate a relevant area, and leave it. Returning later, refreshing, or reopening recalculates the same day from the saved local records. The summary will also remain visible while offline after the app has successfully loaded, following the approved Stage 4 local-status language.

| Owner question | Proposed plain-language answer | Existing destination |
| --- | --- | --- |
| How much did I sell? | **Sales today** and **Sales made** | Sales or Reports |
| Which kind of sale did I record? | **Cash sales**, **Mobile Money sales**, **Card sales**, and **Credit sales** | Sales or Reports |
| How much money actually arrived? | **Money received today**, broken down by Cash, Mobile Money, and Card where saved payments exist | Reports |
| What is still unpaid from today’s sales? | **Still unpaid from today’s sales** | Customers owing |
| How many known customers did I serve? | **Named customers served** | Customers |
| What needs restocking? | **Low-stock products** | Stock |

## 3. Calculation contract

Stage 6 will make the distinction between *sales recorded* and *money received* visible rather than hiding it. A sale’s chosen payment plan remains an immutable completed-sale fact; a payment or repayment is a separate received-money fact. This prevents a part-paid Mobile Money sale from being presented as though its full sale total had already been collected.

| Summary field | Local record source | Exact interpretation |
| --- | --- | --- |
| Sales today | Completed sales whose saved `createdAt` falls in the device’s current local calendar day | Sum of completed sale totals, after saved discounts. |
| Sales made | Same completed sales | Count of completed sales, including walk-in and named-customer sales. |
| Cash/Mobile Money/Card sales | Same completed sales grouped by their saved `paymentMethod` | The total value of sales recorded under that method. A part-paid sale stays with its selected method. |
| Credit sales | Completed sales whose saved payment method is `credit` | Total value of sales explicitly completed as Credit. This does not include part-paid Cash/Card/Mobile Money sales. |
| Money received today | Sale payments and immutable customer repayments saved today | Actual payment amounts, not total sale values. It will be subdivided by Cash, Mobile Money, and Card. |
| Still unpaid from today’s sales | Today’s completed sale `outstandingMinor` amounts | Amount left outstanding at completion for today’s sales. It is a historical daily figure and is not altered by later repayments. |
| Named customers served | Distinct active or archived customer identifiers attached to today’s completed sales | Count of identified customers; walk-in sales are not guessed as named customers. |
| Low-stock products | Current active products at/below their saved threshold | A current stock-attention count, not a daily inventory movement total. Archived products are excluded. |

The normal current **Customers owe** figure will remain available separately where it already exists. It is derived across all customer sales and repayments and may change as later payments are recorded. The Stage 6 field **Still unpaid from today’s sales** instead describes only the total outstanding at the moment today’s completed sales were saved. The owner-facing labels will make that distinction clear.

## 4. Proposed layout and interaction

The End of day view will retain the compact cobalt ledger style and use short, high-contrast read-only panels. The top contains the day label and two clearly separated sections: **Sales recorded today** and **Money received today**. A third small attention area shows named customers served, today’s unpaid amounts, and current low stock. Empty categories use `No … recorded today` rather than a blank or ambiguous zero.

Each card will use existing links rather than new management tools. For example, an owner can open Customers owing from today’s unpaid amount or Stock from low-stock attention. Cards will be keyboard-reachable, have visible focus, and meet the existing solid/opaque phone-surface treatment. The view will retain accessible loading and attention states; it will never silently substitute zero amounts if reading local records fails.

No new data is written when the view opens, refreshes, or follows a link. The only animation will be the existing restrained page/dialog conventions; `prefers-reduced-motion` behaviour remains honoured.

## 5. Data and architecture boundary

Stage 6 is expected to require **no Dexie schema migration, no new table, no stored daily-close marker, no data rewrite, and no localStorage business records**. The data will be calculated in memory from the current local IndexedDB/Dexie sales, payments, repayments, customers, and products tables.

The current `mobile` internal payment value remains untouched and renders as **Mobile Money**. Its local provider and optional reference snapshots remain preserved but are not exposed as a new payment integration. Existing atomic sale completion, immutable receipts, inventory movements, derived debt, separate repayments, duplicate-submission protection, Backup/Restore, and read-only integrity audit remain authoritative.

The PWA worker continues to cache only the application shell. It does not cache, upload, synchronise, or replace business records. As with Stage 4 and Stage 5, the owner must successfully load the application before expecting the shell to be available offline, and the owner should keep a current device-controlled Backup copy.

## 6. Deliberate exclusions

Stage 6 will not add a Close day, day lock, sales lock, reset, cashier shift, reconciliation, cash drawer count, bank balance, formal accounting, profit/loss, tax, expenses, supplier purchases, payment-provider APIs, remote database, backend, account, cloud backup, cloud sync, automatic upload, sync queue, reminder, notification, language expansion, country locking, or any Stage 7–10 feature.

It will not modify completed sales, receipts, payments, repayments, customer balances, stock movements, product archive history, Mobile Money provider/reference data, Backup, restore, or the integrity audit. It will not treat the end-of-day view as a bank statement or payment-provider settlement report.

## 7. Validation plan

Automated tests will cover the local-day boundary; no-sale and no-payment empty states; Cash, Card, Mobile Money, Credit, and part-paid sales; money-received breakdowns; same-day repayments; distinct named customers; walk-in exclusions; today-only unpaid amounts; current active low-stock filtering; archived-product exclusion; and read-only summary behaviour. Tests will also verify that a later repayment does not rewrite the historical **Still unpaid from today’s sales** figure.

Component tests will verify owner-facing terms, zero/error/retry states, route links, keyboard accessibility, and mobile rendering. Browser validation will use isolated local records with full/part-paid Mobile Money, its provider/reference, Cash, Card, Credit, named and walk-in customers, repayment, low stock, archived product, receipt, and inventory movement cases. It will compare on-screen totals directly to the saved records, test the main destination links, turn offline after a successful load, refresh/reopen, and confirm no sync or upload claim appears.

| Release validation | Required result |
| --- | --- |
| Type and production validation | `pnpm check`, PWA production build, manifest/service-worker artifacts, and production dependency audit pass. |
| Cross-stage regression | Stage 1 Mobile Money/provider/reference; Stage 2 derived debt/repayment; Stage 3 receipt read-only/share/print; Stage 4 offline/confidence; Stage 5 daily summary; inventory, archive, Backup/Restore, and integrity all pass. |
| Browser and responsive validation | Current Home, End of day, Sales, Customers, Stock, Reports, and unchanged Backup are checked at phone, tablet, and desktop widths. |
| Deployed release | A commit and auto-published checkpoint are followed by a fresh public-URL verification before owner testing begins. |

## 8. Owner acceptance steps after implementation

1. Create a Cash sale, a Card sale, a named-customer part-paid Mobile Money sale with a provider/reference, and a Credit sale. Include at least one walk-in sale.
2. Record a customer repayment and open **End of day**. Confirm Sales today equals the total completed sale values; Cash, Mobile Money, Card, and Credit sales are shown in the correct recorded-sale categories; and Money received reflects actual payment amounts plus the repayment rather than the full value of a partly paid sale.
3. Confirm Named customers served counts each named customer once and does not count the walk-in sale as a known customer.
4. Confirm Still unpaid from today’s sales reflects the unfinished amounts created by today’s sales. Record another repayment and verify the normal current Customer debt falls while this historical daily figure does not change.
5. Put an active product at/below its threshold and archive another such product. Confirm Low-stock products shows only the active item(s) and opens Stock.
6. Verify that each summary link opens the existing related view, then refresh/reopen the application and confirm the figures recalculate correctly from saved records.
7. Turn off connectivity after the application has loaded. Confirm the summary remains available with **Offline — changes saved on this device** and that no account, sync control, upload, or cloud claim appears.
8. Open the unchanged Backup page, create a local backup, and run Check local records. Confirm these pre-existing safeguards behave exactly as before.

## 9. Approval gate

> Please explicitly approve this Stage 6 plan before implementation. Implementation will stop after an owner-testable deployed Stage 6 build and completion report are delivered. **Stage 7 will not begin until you personally test and approve Stage 6.**
