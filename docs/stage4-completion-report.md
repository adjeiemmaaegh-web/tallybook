# Stage 4 Completion Report — Offline Confidence & Data Safety

**Status:** Implemented and ready for deployment verification. This report covers **Stage 4 only**. Stage 5 and all later roadmap work remain blocked pending the owner’s personal testing and explicit Stage 4 approval.

## What was implemented

Stage 4 makes the existing device-first operation clearer without changing the local business engine. The shared header now communicates one of four plain-language states: **Getting your records ready**, **Saved on this device**, **Offline — changes saved on this device**, or **Your saved records need attention / Try again**. The states are concise, accessible, visible without relying only on colour, and do not use owner-facing implementation jargon.

The Home data-safety area now uses the same plain, accurate language. It explains that records are saved on the device, that supported work continues after the application has loaded, and that Backup is an owner-controlled copy. When connectivity returns, the existing three-second **Connection restored** notification continues to state that nothing was uploaded.

The reported **View debtors** defect was repaired. The action now clears the customer search, sets the existing owing-only filter, records the refresh-safe route `/customers?view=owing`, and visibly scrolls to and focuses the filtered debtor list. This makes the result immediately apparent on both phone and desktop views. The repair does not change customer records, balance calculations, sales, repayments, or the source of truth for debt.

## Data and architecture boundary

No database migration, Dexie schema change, new table, data field, localStorage business record, remote API, account, upload, queue, cloud synchronisation, or manual sync control was added. The schema remains **version 8**.

The existing local records remain authoritative. Sales continue to save atomically with their immutable lines, payment where applicable, receipt, customer activity, stock reduction, and inventory movement. The `mobile` internal payment value remains compatible and displays as **Mobile Money**. Mobile Money provider/reference snapshots, customer debt derived from saved sales and repayments, read-only receipt actions, backup/restore, and the read-only integrity audit are unchanged.

## Deliberate exclusions

Stage 4 does not add cloud backup, automatic upload, remote recovery, accounts, a backend, payment APIs, sync queues, payment reversals, new financial rules, receipt sharing changes, provider changes, expanded reporting, or daily-summary work. It does not begin Stage 5, Stage 6, or later roadmap stages.

## Validation results

| Validation | Result |
| --- | --- |
| TypeScript | Passed: `pnpm check`. |
| Automated regression suite | Passed: **23 test files / 65 tests** via `pnpm test`. |
| New focused coverage | Passed: debtor-only route parsing/refresh safety, supported/unsupported view fallback, status preparation/recovery wording, and persistent offline-to-ready presentation. |
| Existing Stage 1–3 coverage | Passed: Mobile Money/provider data, sales atomicity/idempotency, customer debt/repayment protection, receipt detail/share/print fallbacks, inventory, backup/restore, integrity audit, archive controls, and route/accessibility regressions. |
| Production PWA build | Passed: `pnpm build`; generated `manifest.webmanifest`, `sw.js`, and Workbox precache artifacts. The production worker was observed active and controlling the HTTPS preview; the shell, JavaScript, CSS, manifest, and visual asset were present in its Workbox cache. |
| Production dependency audit | Passed: `pnpm audit --prod` reported **no known vulnerabilities**. |
| Actual offline browser workflow | Passed using an isolated current-app production PWA session: the status showed **Offline — changes saved on this device**; a named-customer Mobile Money part-payment sale saved exactly one sale, payment, receipt, customer activity, and stock movement; its provider `Stage 4 MoMo` and reference `S4-MOMO-REF` persisted; stock changed from 3 to 2; a Cash repayment of GHS 1.00 saved separately; reconnection showed **Connection restored** and **Nothing was uploaded**. |
| Refresh/reopen persistence | Passed: a fresh application reopen after the offline session found the same single sale, payment, receipt, repayment, and stock quantity of 2. |
| Backup/restore browser regression | Passed: existing complete local backup and restore retained one product, sale, payment, receipt, and repayment. |
| Integrity browser regression | Passed: the read-only check found no relationship issues and did not mutate local data. |
| Keyboard regression | Passed: visible skip link moved focus to the main content landmark. |
| Debtor-action browser check | Passed: in the live customer interface, **View debtors** visibly scrolled to and focused **People who still owe**, with the owing filter selected. |
| Phone-size visual review | Passed at **375×812** across Home, Customers, Sales, and Backup. The longer status remains readable in the compact header; surfaces and controls remain solid and touch-safe. |

The reusable current-app browser validation is recorded in `scripts/stage4-offline-browser-check.mjs`. It replaces the stale Stage 8 assumptions with current Stage 1–3 UI controls and schema-version-8 records. The existing connection-status check was updated to assert the new Stage 4 offline wording.

## Known advisories and practical limitation

The production build continues to warn that the main JavaScript chunk exceeds 500 kB after minification. PNPM warns that the package-level `patchedDependencies` and `overrides` configuration is ignored by the installed PNPM version. The build also reports that `baseline-browser-mapping` data is more than two months old. These were non-blocking advisories: the type-check, full test suite, production PWA build, dependency audit, and browser validations passed.

Offline use has an intentional, truthful boundary: the application must first load successfully while connected so the PWA shell can be cached. Device/browser storage can still be cleared or evicted by the owner, browser, or operating system. Owners should keep a current Backup file they control. The automated production test verified offline operations in a cached session and a fresh reopen of the resulting local records; owners should also perform the actual phone Wi-Fi/mobile-data-off test below because device-specific PWA and share behaviour varies by browser.

## Owner manual acceptance checklist

1. Open the deployed app while connected. Confirm the header says **Saved on this device** after it is ready. If you momentarily see the loading state, confirm it reads **Getting your records ready**.
2. Open **Customers**. Use **All customers**, then tap **View debtors**. Confirm the page moves you to **People who still owe**, the **Owing** filter is selected, and only customers with a remaining balance are listed. Refresh the page and confirm the owing list remains selected.
3. Turn off Wi-Fi and mobile data **after the application has loaded**. Confirm the header visibly says **Offline — changes saved on this device**.
4. While offline, open existing products and customers. Complete a Cash sale, then a named-customer Mobile Money part-payment or Credit sale. Confirm the sale completes once, stock reduces once, and the customer’s remaining balance is correct.
5. For a Mobile Money sale, select a configured provider and enter a reference. Open **View receipt** and confirm the receipt shows **Mobile Money**, the provider, reference, paid amount, and remaining amount. Tap **Done**, refresh or close/reopen the application, and confirm the saved receipt still opens.
6. Open the named customer, confirm **Customer owes**, **Customer paid**, and **Remaining balance**, then record a Cash, Card, or Mobile Money repayment. Confirm the new balance changes immediately and no overpayment is accepted.
7. Restore Wi-Fi or mobile data. Confirm **Connection restored** appears briefly and says that records remain on this device and **Nothing was uploaded**. There should be no sync button and no upload action.
8. Open **Backup**, download a local backup, and use **Check local records**. Confirm the record check reports findings without changing products, sales, payments, receipts, customer balances, or stock.

> **Owner approval gate:** Please test the deployed Stage 4 build and reply with explicit approval only if these workflows meet your needs. **Do not request Stage 5 yet.**
