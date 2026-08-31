# Stage 8 Completion Report — Expenses & Simple Business Health

**Release status:** Implemented and deployed. The release commit is **`d0d42ef`** (`feat: add stage 8 expenses and business health`). The owner test route was a managed preview URL at the time. Public verification succeeded after clearing only the sandbox browser service-worker/cache state; local IndexedDB business records were not touched.

## Delivered outcome

Stage 8 adds a simple way to record ordinary business spending and review a clear local **Business Health** view. It answers **“Where is my money going?”** using saved on-device records, without introducing a cloud account, sync, accounting engine, or another financial ledger.

| Area | Delivered behavior |
| --- | --- |
| Expenses | A contextual **Expenses** workspace records a required category, positive amount, owner-selected local date, and optional short note. Categories are Transport, Rent, Utilities, Supplies, Repairs, and Other. |
| Historical safety | Saved expenses are read-only in Stage 8. There is no edit, delete, refund, reversal, or automatic correction flow. |
| Duplicate safety | A local unique submission key makes a repeated save request return the original expense rather than create a duplicate amount. |
| Business Health | A read-only contextual view separately shows Sales recorded, Money collected, Customers still owe, Money spent, expense categories, and Low stock for Today, Last 7 days, or All time. |
| Plain-language boundary | Business Health states that it is **not** profit, a cash balance, tax record, or accounting statement. |
| Purchase separation | Supplier stock purchases remain immutable stock-replenishment history. Purchases do not automatically create expenses, alter expense totals, product prices, or stock valuation. |
| Local recovery | Owner-controlled Backup/Restore includes expenses. Pre-Stage-8 version-9 backups load with an empty expense list. The Backup page presentation and controls remain unchanged. |
| Integrity | Check local records now flags invalid expense business links, categories, amounts, dates, creation times, and duplicate/invalid submission keys without changing records. |

## Local data and migration

The database moved additively from **Dexie schema v9 to v10**. The only new store is `expenses`, with local indexes for business profile, expense date, category, creation time, and a unique submission key. No existing sale, payment, receipt, customer, debt repayment, Mobile Money provider/reference snapshot, inventory movement, supplier, purchase, or purchase-line record was rewritten.

An expense has these local facts: its identifier, `primary` business profile link, fixed category, positive minor-unit amount, local calendar date, optional note, save key, and creation time. Expense creation is an atomic single-store transaction. It has no stock movement, supplier-purchase, sale, customer-debt, payment-provider, or network side effect.

## User experience and accessibility

Expenses and Business Health are contextual destinations from Home and Reports; they do not replace or displace Home, Stock, Customers, Sales, or Reports in the primary mobile/desktop navigation. The pages use the established compact cobalt operating UI, solid readable form surfaces, labelled inputs, accessible loading/error states, keyboard-reachable controls, and visible local-only boundaries.

The prerequisite state was aligned with the existing Reports ledger pattern: numbered record rows, stamped workspace marker, practical setup context, and one clear setup action. The visual decision is documented in `ideas.md` so later enhancements retain coherent cobalt operating actions and baobab-green saved/integrity signals.

## Validation evidence

| Validation | Result |
| --- | --- |
| Focused and full automated suite | **26 test files / 81 tests passed.** This includes Stage 8 expense validation/idempotency, Business Health financial separation, v9-to-v10 migration, Backup/Restore, integrity, routes, suppliers/purchases, Mobile Money, debt/repayments, receipts, inventory, PWA reliability, and all earlier approved workflows. |
| TypeScript | `pnpm check` passed with no errors. |
| Production/PWA build | `pnpm build` passed. Workbox generated the service-worker precache with six entries. |
| Production dependency audit | `pnpm audit --prod` found no known production vulnerabilities. |
| Real browser/offline workflow | Isolated live-app validation passed: an offline transport expense of GHS 12.50 saved once; Business Health retained separate Sales recorded, Money collected, Customers still owe, Money spent, and Low stock labels; stock remained 1; supplier purchase count and inventory movement count remained 0; reopening retained the expense. |
| Reconnection behavior | The three-second **Connection restored — Nothing was uploaded** toast appeared after reconnection. |
| Responsive review | Desktop and 375 × 812 phone-size review completed for Expenses and Business Health prerequisite states. The revised mobile layout retains readable numbered prerequisite rows and a touch-safe setup action. |
| End of day protection | Existing Stage 6 print remains separate and read-only. No Close day, day lock, sales, payment, debt, or receipt mutation was added. |

## Known advisories

The release has no known blocking defect from validation. The production build retains the existing advisory that the main JavaScript chunk is larger than 500 kB after minification. Build output also reports that baseline-browser-mapping data is older than two months. The installed pnpm version continues to report that package-level `patchedDependencies` and `overrides` fields are ignored. These are existing maintenance advisories, not release blockers.

PWA operation remains truthful: after a successful application load, the shell can be cached for offline use, but browser/device storage can still be cleared externally. Owners should keep regular local Backup files; no data is uploaded automatically.

## Owner acceptance steps

1. Open the fresh deployment URL supplied with this report while online. If testing offline afterward, let the application finish loading first so the shell can be cached.
2. From Home or Reports, open **Expenses**. Record one expense in each category, including a short note on one. Confirm each amount, date, category, and note remains after refresh or reopen.
3. Try saving an invalid amount such as `0` and a future date. Confirm an understandable error appears and no expense is added.
4. Confirm saved expenses are visibly historical/read-only and that there is no edit or delete action in Stage 8.
5. Open **Business Health**. Check Today, Last 7 days, and All time. Confirm Sales recorded, Money collected, Customers still owe, Money spent, category totals, and Low stock are shown as different facts.
6. Complete a part-paid or Credit sale and record a customer payment. Confirm money collected and customer debt change according to their existing rules, while expenses remain distinct.
7. Record a supplier purchase. Confirm it increases stock and remains in Purchases history, but does not automatically create or change an expense.
8. Create a local Backup. Confirm expenses are present after Restore only if you intentionally test Restore on safe test records; Restore replaces current device records.
9. Run **Check local records** and confirm it reports a clear result for valid records without changing sales, stock, suppliers, purchases, debt, or expenses.
10. With the app already loaded, switch the browser/device offline. Record a small expense, confirm it remains after refresh/reopen where the cached shell is available, then reconnect and verify that the app says nothing was uploaded.

> **Next gate:** Stage 8 is now ready for the owner’s live testing. Stage 9 has not started and remains blocked until the owner explicitly approves this deployed Stage 8 release.
