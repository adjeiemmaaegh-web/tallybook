# Product Specification

## Product statement

Tallybook is a simple, mobile-first, offline-first operating ledger for African micro and small businesses. It helps an owner record sales, stock, customers, and money owed without an ERP, account, server, or AI.

## Enhancement Roadmap — Stage 1: Mobile Money & Better Payment Experience

Stage 1 makes payment capture clearer while preserving the existing local sale engine. Cash, Card, Credit, and part payment remain available. The existing internal `mobile` payment value is displayed as **Mobile Money** for both new and historical records; old records remain readable even though they have no provider or reference details.

| Owner task | Stage 1 behavior | Safeguard |
| --- | --- | --- |
| Configure providers | Add, hide, or re-enable owner-named Mobile Money providers in **Business**. | Provider names are local, configurable, and never country-locked. |
| Record Mobile Money | Select an active provider and optionally enter a transaction/reference at checkout. | The provider name is saved as an immutable payment snapshot. |
| Start with no provider | Add a provider within the current checkout and continue the same sale. | Cart, customer, payment amount, payment plan, and unsaved draft remain in place. |
| Review payment history | See **Mobile Money** and, when available, provider/reference details on saved receipt and recent-sale entries. | Historical `mobile` rows without the new fields remain valid and readable. |
| Complete or retry | Save sale, stock movement, payment, receipt, and customer activity together. | Existing submission-key idempotency prevents duplicate completed sales. |

No provider API, payment initiation, account, cloud synchronization, country-specific network list, remote reference check, or external processor is included. Stage 1 is awaiting explicit owner approval before any further enhancement-roadmap stage begins.

## Enhancement Roadmap — Stage 2: Customer Debt / Who Owes Me?

Stage 2 makes current customer debt easier to find and collect while retaining the existing derived local record model. The owner can open **Who owes me?**, see debtors and amounts due first, open one customer, read Customer owes / Customer paid / Remaining balance, and save a straightforward Cash, Card, or Mobile Money customer payment. The balance changes immediately after one local immutable repayment record is saved.

No new balance field, debt table, accounting workflow, repayment provider/reference detail, interest, reminder, or remote service is introduced. The customer’s completed sales stay unchanged; the visible balance remains a calculation from those saved sales and repayments.

## Enhancement Roadmap — Stage 3: Receipts & Easy Sharing

After a sale, the owner can view the saved receipt, share a concise factual receipt message, ask a supported browser to print it, or return to work with Done. Saved receipts can also be reopened from recent sales after refresh/reopen. The receipt shows the original values of that sale, including the original paid and remaining amounts for part-paid and Credit sales.

Receipt sharing uses the phone/browser share action where available. If that is unavailable, the owner can copy receipt text or copy it manually from a visible read-only field. The application never uploads the receipt, creates a public link, or changes the saved business record during these actions.

## Stage 6 credit and debt management

Stage 6 lets an owner manage money owed by a named customer after a completed credit or part-paid sale. Customer detail now shows a derived outstanding balance, sale and repayment history, and a repayment action. A repayment records the amount received, payment method, optional note, and timestamp; it never edits the completed sale or overwrites a balance.

| Owner task | Stage 6 behavior | Integrity rule |
| --- | --- | --- |
| Review debt | Read the current outstanding balance and chronological sale/repayment history. | Balance equals customer sale outstanding amounts minus saved repayments. |
| Record repayment | Enter amount, cash/card/mobile method, and optional note. | A repayment must belong to one active customer and cannot exceed their current balance. |
| Settle debt | Record one or more repayments until the derived balance is zero. | A further repayment is rejected once no debt remains. |
| Reopen the app | See the same repayment history and recalculated balance. | All debt records remain in the local database. |

## Scope boundary

This stage does not add due dates, interest, reminders, installments, refunds, write-offs, reports, export/import, cloud backup, accounts, or a backend. Stage 7 owns reconciled dashboard and reporting views.

## Planned stage sequence

| Stage | Approved future responsibility |
| --- | --- |
| 7 | Reconciled dashboard and basic offline reports. |
| 8 | Offline reliability and recovery validation. |
| 9 | Local backup/export/import, then one evaluated cloud-file provider. |
| 10 | Accessibility, usability, and product polish. |
| 11 | Security, integrity, and production hardening. |
| 12 | Release-candidate preparation and final tests. |

## Stage 7 dashboard and reports

Stage 7 answers the owner’s daily performance questions with local, reconciled records rather than accounting claims. Today now displays completed sales today, money received today, current customer debt, completed-sale count, recent receipts, a seven-day completed-sales rhythm, and low-stock attention. The Reports page provides sales, payment, customer-debt, and inventory reports with Today, Last 7 days, and All time filters.

| Report figure | Source rule | Important boundary |
| --- | --- | --- |
| Sales | Sum of completed sales in the selected local-date period. | This is sales value, not profit. |
| Money received | Sale-payment records plus later debt repayments in the selected period. | It is not a cash-on-hand calculation. |
| Customer debt | All completed customer-sale outstanding amounts less repayments. | It is current across all saved customer records. |
| Stock | Current active product quantities and saved low-stock thresholds. | It is not stock valuation. |

No profit, tax, cash-on-hand, expense, or accounting statement is claimed because the current local data model does not support those calculations.

## Stage 8 offline reliability and recovery

Stage 8 verifies that ordinary work remains local when a connection is unavailable. The status badge now distinguishes **Working offline** from local-record readiness, and Today explains that data remains on this device while export/restore is still a later stage. The application does not promise permanent device storage or a backup that has not been created.

| Scenario | Verified Stage 8 behavior |
| --- | --- |
| Working offline | A loaded application can record a sale using local IndexedDB; its receipt and stock movement are saved locally. |
| Reopen | Business identity, sale, receipt, stock, debt, dashboard, and reports remain available after local database close/reopen. |
| Upgrade | A version-6 local database opens at version 7 without removing prior owner records. |
| Failed sale | Insufficient stock leaves no partial sale, payment, receipt, or stock change. |

Export, restore, device migration, and cloud backup remain deliberately out of scope until Stage 9.

### Stage 8 approval repair — connection restored

After a real offline-to-online transition, Tallybook now shows a concise **Connection restored** toast. It states that records remain on the device and that nothing was uploaded. The toast is not shown for an initial online load. There is deliberately no manual sync button, server call, account, export, cloud backup, or remote transfer in this repair.

### Stage 8 final connection feedback

The restored-connection toast dismisses after three seconds. The header persistently shows **Working offline** for the entire offline session and returns to **Saved on this device** only after the browser reports that connectivity has returned.

## Stage 9 backup, export, and import

Stage 9 adds an owner-controlled local backup workspace. The owner can download a versioned JSON copy, choose a backup file, review its business name and record counts, and explicitly confirm replacement of the device’s current records. The backup captures all authoritative local business records; it is not an accounting export or a cloud synchronization service.

| Owner action | Stage 9 behavior | Safeguard |
| --- | --- | --- |
| Download local backup | Creates one JSON file from the saved local record. | No server, account, or upload is involved. |
| Check a backup | Validates kind, format version, schema compatibility, record arrays, and duplicate IDs. | Invalid files leave current records unchanged. |
| Restore a backup | Replaces all local record stores from the checked file. | Explicit owner confirmation and one local transaction. |
| Verify recovery | Shows restored business name and record counts. | Tests reconcile product stock, debt, sales, payments, receipts, and reports after a simulated reinstall. |

Cloud storage and provider integration are not included. They must be considered only after this local restore flow is independently approved.

## Stage 10 UX, accessibility, and product polish

Stage 10 improves clarity and speed around the completed workflows. It adds a keyboard skip path, route announcements, visible focus treatment, accessible loading/save feedback, and consistent touch feedback. It removes header controls that did not perform an owner task and updates onboarding language to direct an owner to the next real action: set up the business, add stock, or make a local backup.

No sales, stock, debt, report, backup, or restore calculation changes in this stage.

## Stage 11 security, integrity, and production hardening

Stage 11 adds a **Check local records** action in Backup. It reads record links and saved totals, then reports a clear result or specific items requiring attention. It never edits, removes, merges, uploads, or attempts to guess a repair. The owner is guided to download a fresh backup before seeking help.

The static server and identifier dependency were updated, while unused audited packages were removed. The application remains intentionally local-only: no account, cloud storage, remote customer transfer, or server-side business record endpoint exists.

## Stage 12 release candidate

Stage 12 introduces no new operational product feature. It packages the completed workflows for owner testing through release documentation, onboarding, a safe demo scenario, backup/restore steps, troubleshooting, privacy guidance, and a completed release checklist. The product is described as a release candidate until the owner completes final acceptance on the intended device.

## Stage 6 approval repair

The Today screen and mobile working header now display the saved business name. Checkout accepts grouped money input such as `10,000.00` and maintains the completed-sale rule: the sale is saved exactly once or a visible error returns the control to a retry-safe state. A completion attempt is bounded so a stalled local operation cannot keep the owner on an indefinite busy control.

### Blocking control repair

The Complete sale control is always actionable when it is not actively saving. With no cart lines, it uses an explanatory inactive visual but remains clickable and tells the owner to add an item; it no longer exposes a disabled waiting cursor. During a real save only, it becomes busy and blocks duplicate clicks.
