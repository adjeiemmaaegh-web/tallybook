# Enhancement Roadmap — Stage 2 Plan: Customer Debt / “Who Owes Me?”

**Status:** Planning only. No Stage 2 database, application, style, test, or deployed-behavior change is authorized until the owner explicitly approves this plan.

## 1. Purpose and planning conclusion

Stage 2 should make one everyday question faster to answer:

> **Who owes me, how much do they owe, and what happens when they pay me?**

This repository already contains a reliable debt foundation from the earlier incremental build. A completed named-customer credit or part-paid sale stores its original amount due. The current balance is derived as completed customer-sale outstanding amounts less immutable repayment records. The existing service prevents overpayment and uses a submission key to make a repeated repayment action return one record rather than charge the balance twice.

Consequently, Stage 2 is **not** a second debt ledger, an editable balance field, or an accounting rebuild. It is a focused usability and clarity enhancement around the existing local facts: faster debtor discovery, a concise customer balance view, a more obvious payment collection path, and consistent Mobile Money wording.

## 2. Current baseline and planned gap closure

| Roadmap requirement | Current approved baseline | Stage 2 proposed work |
| --- | --- | --- |
| Quickly see who owes money | Customers already has an **Owing** filter; the reports service already sorts debtors by balance. | Make a dedicated **Who owes me?** entry point and total more prominent on Customers, with a direct route from Home’s outstanding-debt metric. |
| See total outstanding, sales, payments, remaining balance, and history | Customer detail already derives balance and displays sale/repayment history. | Reorganize the detail as a plain-language balance card, an at-a-glance breakdown, and a chronological activity list with immediately recognizable labels. |
| Record a customer payment | A local, idempotent repayment dialog already validates active customer, amount, and no overpayment. | Simplify its presentation around **Customer owes → Customer pays → New balance**, surface it from debtor rows/detail, and label `mobile` as **Mobile Money**. |
| Immediate updated balance | The detail refreshes its derived summary after saving a repayment. | Update the selected customer, debtor-list total, and relevant summary copy together so the result is visible without a manual refresh. |
| Home eventually shows total debt | Home already has a read-only outstanding-debt metric. | Make that metric a clear route to the debtor list; do not add a second dashboard or new accounting figures. |

## 3. Proposed owner workflow

The flow will stay short and mobile-first:

1. On **Home**, the owner taps **Outstanding debt**; or on **Customers**, taps **Who owes me?**.
2. The owner sees active debtors in descending amount-due order. Each row shows customer name, contact cue, and balance due. Zero-balance customers do not appear in this view.
3. The owner taps a customer to open a single debt detail surface with **Amount owed**, **Sales creating the debt**, **Payments received**, **Balance remaining**, and recent history.
4. The owner taps **Record payment**, enters the amount actually received, selects Cash, Card, or **Mobile Money**, optionally writes a short note, and confirms once.
5. The app validates locally, writes exactly one immutable repayment, recomputes the balance, and immediately shows the new amount due. If the balance becomes zero, the customer leaves the debtor list and remains in the all-customers list/history.

No completed sale will be edited. No owner will be asked to allocate a repayment across individual old invoices in this stage; the existing ledger-level derived-balance model remains the source of truth.

## 4. Scope and explicit exclusions

### Included

The implementation would refine the current Customers and Home presentation, repayment dialog feedback, labels, tests, and owner guidance. It would retain the prototype-faithful compact operating UI and make the existing debt actions easier to find on narrow screens.

### Excluded

Stage 2 will not add interest, due dates, reminders, instalment schedules, debt write-offs, refunds, payment reversals, invoice allocation, statements, receipt sharing, provider APIs, payment initiation, cloud sync, accounts, localStorage business data, language expansion, suppliers, expenses, or later-roadmap features. It will not move the approved Stage 1 provider/reference feature into repayments unless separately requested; a repayment will continue to record only its method and optional note.

## 5. Data, migration, and integrity plan

| Concern | Proposed Stage 2 decision |
| --- | --- |
| Persistent model | Reuse `sales.outstandingMinor` and immutable `repayments`; add no editable customer balance column. |
| Database schema | **No Dexie schema migration is planned.** Version 8 remains current because the required records and indexes already exist. |
| Balance formula | `Σ completed customer-sale outstanding amounts − Σ verified repayments`, clamped only for display at zero. |
| Repayment transaction | Keep the existing read-write transaction across customers, sales, and repayments. Validate customer status, current balance, amount, and submission key before the single repayment write. |
| Duplicate protection | Preserve the unique repayment submission key. Repeated confirmation of the same action must return one saved repayment and one balance update. |
| Completed sales | Never rewrite sale total, amount paid, stock movement, receipt, provider snapshot, or original outstanding amount. |
| Backup/restore | Existing provider-free repayment records remain in the current backup document and atomic restore. Regression coverage will confirm no Stage 2 UI refinement changes those records. |
| Integrity audit | Keep the audit read-only. Extend it only if a new Stage 2 presentation invariant is genuinely required; no automatic repair or data mutation is planned. |

## 6. User-interface plan

The implementation will preserve the current Tallybook Africa cobalt, card-based operating interface. On mobile, the customer-debt entry point will be a high-contrast, touch-safe action near the customer controls rather than a hidden report filter. The debtor list will use amount-first scanning: name on the left, amount due on the right, and a clear action to open the detail.

The customer detail will use plain labels rather than technical accounting terms. A short balance story will state the amount due, amount paid back, and amount remaining. The repayment action will stay in a solid, opaque sheet/dialog with a visible saving state, validation feedback, and a normal clickable control whenever it is not actually saving. Focus handling, keyboard access, and the existing opaque select surfaces will be retained.

## 7. Implementation sequence after approval

| Order | Deliverable | Protected behavior |
| --- | --- | --- |
| 1 | Reconfirm debt service and report contracts; add a small shared display-label helper if needed for **Mobile Money**. | No data write or schema change. |
| 2 | Add a dedicated debtor-list entry point, Home deep link, and clear empty state. | All customer search, archive, and All/Owing behavior remains. |
| 3 | Refine customer debt detail and repayment form around owed/paid/remaining language. | Existing balance calculation, validation, and idempotency remain authoritative. |
| 4 | Refresh immediate UI state after a repayment across detail, debtor list, and total. | A failure creates no repayment and leaves saved balance unchanged. |
| 5 | Add/update service, UI, route, backup, integrity, and accessibility regressions. | Cash, Card, Mobile Money label, Credit, part payment, stock, receipts, and Stage 1 providers remain intact. |
| 6 | Run validation, prepare a precise report, and stop for Stage 2 human approval. | No Stage 3 work begins. |

## 8. Test strategy

Automated coverage will preserve and extend the existing debt tests. It will prove that credit and part-paid sales produce the expected debtor order; a repayment updates the derived balance; zero balance removes a customer from the debtor-only view; another customer’s balance is unchanged; a repayment cannot exceed the balance; repeated save input creates one repayment; and historical `mobile` labels display as **Mobile Money**.

Regression checks will also prove that a Stage 2 UI update does not alter stock, receipts, sale payments, Stage 1 Mobile Money provider/reference snapshots, existing backup/restore, offline local operation, archived-customer history, or the read-only integrity audit. TypeScript, the full test suite, production PWA build, dependency audit, and desktop/mobile visual checks will run before reporting.

## 9. Manual owner acceptance after implementation

The future Stage 2 implementation report will ask the owner to perform the following on the deployed application:

1. Create or select a named customer and complete a Credit sale; confirm the customer appears in **Who owes me?** with the full amount due.
2. Complete a named-customer part-paid sale; confirm the debtor view shows only the remaining amount.
3. Open the customer; confirm sales, payments, total owed, and remaining balance are clear and match the saved records.
4. Record a partial customer payment; confirm the new balance appears immediately in the detail and debtor list.
5. Record a final payment; confirm the balance reaches zero and the customer no longer appears in the debtor-only list.
6. Attempt an overpayment and a rapid repeated save; confirm no extra repayment or incorrect balance is created.
7. Refresh/reopen the application and verify customer history and balances persist.
8. Confirm a prior Stage 1 Mobile Money sale still displays **Mobile Money** with its saved provider/reference where present.

## 10. Approval gate

> **No Stage 2 implementation has started.** Approval of this plan is required before any change to the Customers/Home pages, credit service, tests, styles, documentation, database, or deployed application.

If approved, implementation will stay within this plan and will stop after the Stage 2 report and owner testing handover.
