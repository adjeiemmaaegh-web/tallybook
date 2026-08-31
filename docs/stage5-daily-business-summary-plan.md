# Stage 5 Plan — Daily Business Summary

**Status:** Proposed for owner review. **No Stage 5 implementation has started.** Stage 4 is owner-approved; Stage 5 and all later stages remain blocked until this plan is explicitly approved.

## 1. Purpose

Stage 5 will make the Home screen answer one practical question in plain language: **How is my business doing today?** It will present a short, read-only summary derived entirely from existing records saved on this device. The result must remain useful on a phone, understandable without accounting knowledge, and available after the application has loaded even when the device is offline.

The work will preserve the current five primary destinations—Home, Stock, Customers, Sales, and Reports—and retain the existing Business and Backup utilities. It will not create an accounting dashboard or a second reporting system.

## 2. Backup discoverability finding and proposed repair

The Backup page and route already exist and work. On desktop, the left utility area shows a visible **Backup** label. On phones, however, the same action currently appears only as an unlabeled download-shaped icon in the top-right utility area. It has an accessibility name, but that does not give a sighted phone user a clear visual indication that it opens Backup. This explains why it was difficult to find.

The Stage 5 implementation will include a **small, isolated discoverability repair before the daily-summary refinements**: the mobile header will show a compact visible **Backup** label alongside its icon, while retaining an accessible name and a touch-safe target. Business remains available from the same utility area. At the narrowest supported phone width, the local-status badge may wrap to two readable lines rather than obscure or remove Backup. Desktop’s existing clearly-labelled Backup utility remains unchanged.

| Area | Current behaviour | Proposed bounded repair | Not changed |
| --- | --- | --- | --- |
| Mobile header | Backup is icon-only, even though its screen-reader label is correct. | Show the word **Backup** with its existing icon and route. | Backup data, download, file checking, restore, integrity audit, local storage model. |
| Desktop rail | Backup is visibly labelled. | Retain the current labelled utility entry. | Desktop navigation structure. |
| Home safety copy | Directs the owner to Backup. | Retain direct Backup link/copy, with the clearer header entry available everywhere. | No new cloud backup or remote recovery. |

## 3. Existing foundation and Stage 5 target

The current Home dashboard already reads local sales, payments, repayments, customers, products, and low-stock thresholds. It shows daily sales, money received, current debt, transaction count, low stock, recent completed sales, and a seven-day context. Stage 5 will refine that foundation into a clearer **daily business summary** rather than replace the business engine.

> All figures will be descriptions of records already saved on the current device. They are not bank balances, payment-provider confirmations, or cloud-synchronised figures.

| Question for the owner | Stage 5 presentation | Local source and exact meaning |
| --- | --- | --- |
| How much did I sell today? | **Sales today** | Sum of completed sale totals whose saved completion time falls within the device’s current local calendar day. |
| How much money came in today? | **Collected today** | Sale payments received today plus separate customer repayments recorded today. A credit sale contributes nothing until payment is recorded. |
| What do customers still owe? | **Customers owe** | The existing derived customer debt across active customers: completed-sale outstanding amounts minus immutable repayments, never an editable balance. |
| How busy was today? | **Sales made** | Count of completed sales saved today. |
| What needs stock attention? | **Low stock** | Count and short list of active products at or below their saved low-stock threshold. Archived products are excluded. |
| What sold best today? | **Best seller**—only where data exists | Aggregated quantities from immutable sale lines belonging to today’s completed sales. It shows a name and quantity only when at least one unit has been sold. |
| What happened recently? | **Recent activity** | A short, date-ordered local list of today’s completed sales and customer repayments, visibly labelled by activity type. |

## 4. Proposed owner experience

The Home page will open with a single short daily-summary introduction and the four immediately actionable figures: **Sales today**, **Collected today**, **Customers owe**, and **Low stock**. Each figure will have a small, plain explanatory line. **Customers owe** remains the route to the repaired debtor-only customer view; **Low stock** leads to Stock; recent sales lead to Sales. No metric will pretend to be a live bank or internet result.

Below the core figures, the owner will see at most three supporting areas: a best-seller card when sales-line data exists, a compact low-stock list when attention is needed, and a short recent-activity list. The existing seven-day sales context may remain visually secondary, but Stage 5 will not add a new chart, financial statement, target, forecast, or complex analytics view. Zero-data states will say what has not been recorded today and point to the relevant existing task, such as making a sale or adding stock.

The view will refresh when the page opens, regains focus, or returns from the device’s page history. It will use the Stage 4 status language already approved: **Getting your records ready**, **Saved on this device**, **Offline — changes saved on this device**, and **Your saved records need attention / Try again**. A summary calculation error will show the existing owner-facing attention state and retry path; it will not silently show false zero values.

## 5. Data and architecture contract

Stage 5 is a read-only derived-summary refinement. It will use the existing Dexie/IndexedDB records and report helpers. It is expected to require **no schema migration, no new table, no data rewrite, and no background job**.

The implementation will extend the existing dashboard summary shape only in memory, adding a clearly named optional best-seller and a short local activity list as needed. It will not store a calculated daily total, ranking, debt balance, or cache as a new source of truth. Reopening the application will always derive the summary again from saved records.

| Protected area | Stage 5 preservation rule |
| --- | --- |
| Sales and stock | Completed sales remain atomic and idempotent. Their existing sale lines and inventory movements remain the source for daily sales and best-seller calculations. |
| Payments and credit | Cash, Card, Mobile Money, part payments, and Credit retain their current semantics. Collected today uses actual payment/repayment records, not sale totals. |
| Mobile Money | The internal `mobile` value and the saved provider/reference snapshots remain untouched. Summary cards do not add provider integrations or payment confirmation. |
| Customer debt | Outstanding debt remains derived from immutable completed sales and separate immutable repayments. No editable balance or second ledger is introduced. |
| Receipts | Read-only receipt detail, sharing fallbacks, printing, and reopening remain unchanged. Activity links may open existing sale/receipt surfaces only. |
| Backup and audit | Backup, restore, and the read-only integrity audit retain their current record coverage and never become cloud services. |
| Offline operation | Business data stays in IndexedDB/Dexie; the service worker caches the application shell only. No sync action, upload, remote database, localStorage business record, or network dependency is added. |

## 6. Best-seller and recent-activity rules

The best seller will be calculated only from sale lines tied to completed sales dated today in the device’s local time zone. Quantities are summed by immutable product identifier and retained product-name snapshot. If products tie on quantity, the total value of their sold lines will be the secondary ordering; if that also ties, the displayed product name will order alphabetically. This gives a stable result without modifying any saved record.

The best-seller card will be omitted when there is no sale-line data for today. It will not invent a “top” product based on stock, historical activity, or a low-stock item. The recent-activity area will only report saved events—completed sales and recorded repayments—and will label the event type and amount so a repayment is not mistaken for a new sale.

## 7. Deliberate exclusions

Stage 5 will not add accounts, cloud sync, server storage, automatic uploads, sync queues, payment-provider APIs, supplier records, expenses, profit/loss accounting, forecasts, sales targets, dashboards with customizable widgets, staff roles, notifications, customer reminders, statements, invoice allocation, language expansion, country locking, or Stage 6–10 workflows.

Stage 5 will not alter the original sale date/time, completed-sale state, payment records, receipt facts, stock movements, customer debt model, or historical records. It will not interpret the dashboard as cash in hand, bank balance, or reconciled accounting.

## 8. Validation contract

Automated tests will verify local-day boundaries, zero-data states, completed-sale filtering, exact daily sales totals, partial-payment and Credit collection treatment, same-day repayments, all-time derived customer debt, active low-stock filtering, no best-seller before sufficient data, deterministic best-seller tie handling, and read-only calculation behaviour. Component tests will verify clear labels, meaningful empty states, retry/error state, route links, and the visibly-labelled mobile Backup control.

Browser validation will seed isolated local records that include Cash, Card, full Mobile Money with provider/reference, part-paid Mobile Money, Credit, repayment, archived product, and low-stock product cases. It will verify displayed values against the saved records, navigate from debt/stock/activity cards to their existing destinations, toggle offline after a successful load, refresh/reopen the summary, and confirm values remain correct without a network call or sync claim. It will also check that Backup is visibly findable and still opens the existing local Backup page.

| Release check | Required outcome |
| --- | --- |
| Full automated suite | All existing Stage 1–4 tests plus focused Stage 5 tests pass. |
| Type and production checks | `pnpm check`, production/PWA build, generated manifest/service worker, and production dependency audit pass. |
| Responsive and accessibility | 320–375 px phone, tablet, and desktop checks; visible focus; keyboard-reachable Backup and dashboard links; no colour-only meanings; readable status wrapping. |
| Cross-stage regression | Mobile Money provider/reference, Cash/Card/Credit, partial payments, duplicate protection, debt/repayment, receipt opening/sharing/printing, inventory movements, archive persistence, backup/restore, integrity, and Stage 4 offline language pass. |
| Public release | Committed, checkpointed, auto-published, and verified with a fresh public URL before owner testing. |

## 9. Owner acceptance steps after implementation

1. On a phone, open the deployed application and confirm **Backup** is visible as a labelled action in the header. Tap it and confirm the existing Backup page opens.
2. Return Home and confirm **Sales today**, **Collected today**, **Customers owe**, **Low stock**, and **Sales made** use plain language and show the expected current figures.
3. Complete a Cash sale, a named-customer part-paid Mobile Money sale, and a Credit sale. Confirm Sales today includes all completed sales, while Collected today includes only money actually recorded.
4. Record a customer repayment. Confirm Collected today increases and Customers owe falls by the repayment amount without changing the original sale or receipt facts.
5. Add or adjust a low-stock product. Confirm it appears in Low stock, while archived products do not appear as active low-stock attention.
6. Make today’s sales with more than one product. Confirm Best seller appears only after sales data exists, has the correct item/quantity, and does not create or change any product, sale, payment, or movement record.
7. Turn off Wi-Fi/mobile data after the application has loaded. Confirm the Stage 4 offline status appears and the same saved dashboard data remains available after refresh/reopen.
8. Confirm **Customers owe** opens the owing-only customer list, and complete a Backup plus local record check. Confirm no sync control, account, upload, or cloud copy has appeared.

## 10. Approval gate

> Please explicitly approve this Stage 5 plan before implementation. The mobile Backup discoverability repair is deliberately included as a narrow prerequisite repair, while all new work remains limited to the daily local business summary. After implementation, the application will be deployed for your testing and will stop—**Stage 6 will not begin until you approve Stage 5.**
