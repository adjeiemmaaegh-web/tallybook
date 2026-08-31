# Enhancement Roadmap — Stage 2 Completion Report

**Status:** Implemented and ready for owner testing. **Stage 3 has not started.**

## What was implemented

Stage 2 improves the existing local customer-debt workflow without adding another debt model. Customers now has a prominent **Who owes me?** spotlight that shows the total amount due and number of active debtors. The debtor-only view keeps customer names and amounts due immediately visible and sorted by the derived balance. Home now labels its debt metric **Who owes me?** and links directly to the debtor-only customer route.

The customer detail view now uses a concise three-part balance story: **Customer owes**, **Customer paid**, and **Remaining balance**. The payment dialog uses **Customer owes**, **Customer pays**, and **New balance**, updates the preview before the owner saves, and uses clear Cash, Card, and **Mobile Money** labels. After a saved payment, the open detail, debtor list, total due, debtor count, and ordering update immediately.

## Data and integrity decision

No database migration or new persistent table was added. The current Dexie version remains 8. The existing derived-balance model remains authoritative:

> **Outstanding = completed customer-sale outstanding amounts − saved immutable repayments.**

Completed sales are not edited when an owner records a customer payment. The existing repayment transaction still validates an active customer, current balance, positive amount, and unique submission key before writing one immutable repayment. Overpayment prevention and duplicate-repayment protection remain unchanged. Stage 1 `mobile` payment records, Mobile Money provider/reference data on sale payments, receipts, stock movements, backups, restore, and integrity audit remain intact.

## Deliberately not implemented

Stage 2 does not add a second debt ledger, editable customer balance, interest, due dates, reminders, instalments, write-offs, refunds, invoice allocation, statements, payment reversal, provider/reference fields on repayments, payment-provider APIs, cloud synchronization, suppliers, expenses, language expansion, or any Stage 3 or later feature.

## Validation results

| Check | Result |
| --- | --- |
| TypeScript | Passed: `pnpm check`. |
| Automated suite | Passed: **21 test files / 56 tests** via `pnpm test`. |
| New regression coverage | Passed: Home’s Who owes me? route and a Mobile Money repayment that changes only the derived balance, not the completed sale. |
| Production/PWA build | Passed: manifest and generated service worker present. |
| Dependency audit | Passed: no known production vulnerabilities. |
| Browser debt flow | Passed with isolated local records: debtor ordering, Owed/Paid/Remaining presentation, before-save New balance preview, Cash/Card/Mobile Money labels, partial payment, final settlement, and immediate debtor-list refresh. |
| Offline status | Passed: local offline indicator and no-upload connection-restored message. |
| Integrity and keyboard | Passed: read-only integrity check and skip-to-content path. |
| Responsive review | Checked Home and Customers at 375×812 and 1280×720, plus desktop real-browser debt workflow. |

The detailed real-browser observations are retained in [Stage 2 browser validation notes](./stage2-validation-notes.md).

## Known warnings

The production build retains the existing advisory that the main JavaScript bundle exceeds 500 kB after minification. The PNPM configuration warning about deprecated package-level override fields also remains. Neither warning failed the build, tests, audit, or browser validation.

## Owner acceptance steps

1. Open **Home** and tap **Who owes me?**. Confirm it opens the debtor-only customer list.
2. Create a named-customer Credit sale and a named-customer part-paid sale. Confirm both customers appear with the correct amount due.
3. Open a customer and confirm **Customer owes**, **Customer paid**, **Remaining balance**, sales, and payment history agree with your records.
4. Tap **Record payment**. Confirm the dialog says **Customer owes**, **Customer pays**, and **New balance**.
5. Enter a partial amount, choose Cash, Card, or **Mobile Money**, and save once. Confirm the detail, list total, customer amount, and ordering update immediately.
6. Make a final payment. Confirm that customer leaves **Who owes me?** but remains in All customers with history intact.
7. Try an amount above the balance and confirm no payment is saved. Do not double-tap a normal saved payment; the existing duplicate protection is also covered by regression tests.
8. Refresh or close/reopen the app. Confirm the balances and payment history persist. Verify an earlier Stage 1 Mobile Money sale still shows **Mobile Money** and its saved provider/reference when available.

> **Approval gate:** Test the deployed Stage 2 build and explicitly approve Stage 2 before requesting Stage 3. No Stage 3 work has begun.
