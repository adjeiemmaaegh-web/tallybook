# Current status (updated 2026-11-10)

This is the single page to read first. Everything else under `docs/release/` is a dated snapshot of an earlier stage and is kept as evidence only. In particular `blockers.json` and `traceability.json` are the October V19 registers: automated QA scripts read them, so they are not edited by hand, and their "NO-GO / INCOMPLETE" wording does not describe today's shared shop.

## What is deployed and verified

- **Code:** `main` after pull request 55. `pnpm check` passes, `pnpm build` produces the PWA bundle, and `pnpm audit` reports one low advisory with no patched version (a transitive `deepmerge` under `vite-plugin-pwa`). Checked 2026-11-10 on Node 22.23.4 and pnpm 10.34.0. The CI runs listed in [RC_QA.md](RC_QA.md) remain the test evidence.
- **Production database ("Tallybook" Supabase project):** the migrations through `20261109020000_shared_order_lines.sql` are applied, so the stock, purchasing, online-order and refund-policy functions exist. They were applied on 2026-11-10 and Supabase recorded them under new version numbers (`20261110…`) rather than the repository file names. Run `supabase migration repair` before using the CLI against this project. Only `20261106120000` and `20261106130000` have rollback scripts in `supabase/rollback`.
- **Not exercised end to end:** the new stock-count, transfer, purchasing and online-order workflows have been tested in disposable PostgreSQL only. Two-account and real-device acceptance is still outstanding.

## Open development work

Quick wins: done (zoom, PWA install, in-app confirmations, supplier archive, documentation pass, one-step transfer, WhatsApp send for receipts, balances and payment confirmations). The owner/employee choice at sign-up already existed; business type needs a server field and moves into the product-fields migration.

Sales search with day, store, payment and text filters plus paging is live in production: migrations `20261110120000` (indexes) and `20261110130000` (search) were applied on 2026-11-10 (recorded as `shop_sales_hot_path_indexes` and `shop_sales_search`) and checked with a rolled-back dry run against the real data. The app falls back to the latest 50 sales, labelled, if it ever talks to a server without them. Rollback scripts are in `supabase/rollback`.

Done in code: receipt share, WhatsApp and print in the shared shop, and free problem reporting. A "Report a problem" button (shared shop footer and the error screen) shows scrubbed error details plus the person's own note and lets them send it by WhatsApp, the share sheet or copy. Nothing is uploaded by Tallybook and there is no paid service. Optional settings: `VITE_TALLYBOOK_SUPPORT_WHATSAPP` (the number it opens) and `VITE_TALLYBOOK_ERROR_REPORT_URL` (automatic delivery to an https endpoint; unset by default). Server-side errors are visible for free in the Supabase logs.

Live: shared-shop product details (barcode, category, goods or service, stock counting, low-stock level, owner-only cost) with the owner's product form and a till that sells services without stock. Migration `20261110140000` (re-declares the live sale and refund functions) was applied to production on 2026-11-11 and its function definitions were checked identical to the repository. The app still works against an older server (every product stays a counted good). Rollback: `supabase/rollback/20261110140000_shop_product_details_down.sql`.

Barcode scan at the shared till: a search box that also takes camera scans (where the browser supports them) and USB or Bluetooth scanners (they type the code and press Enter). A barcode match wins; typed text adds the one product it matches or asks the person to choose; long digit-only codes are never matched by name. It needs the barcode field from the product-details step, so it is useful once that migration is applied.

CSV product import for the shared shop (Stock tab, "Import products from a file"): plain prices, columns in any order, a downloadable template, a preview that lists every skipped row with its reason, one confirmation, progress, and a safe re-run (existing names and barcodes are skipped, never changed). Up to 500 products and 2 MB per file. It uses the product-details action, so it needs that migration applied.

Park and resume a cart at the till: "Set this cart aside" keeps up to five carts per store on this device only (sealed, per person and business, cleared on sign-out, dropped after a day). Resuming re-checks today's products and stock, so nothing stale is sold. Nothing is recorded or reserved while a cart is parked, and a cart is only cleared from the screen once the device has confirmed it stored it.

Stock console (Stock tab): stock value at cost (products with no cost are left out and counted), products, units on hand, low and out-of-stock counts for the selected store, plus filter chips and a search box.

Daily and end-of-day reports (new Reports tab for owners, "My day" for attendants): sales, refunds, net sales, money taken by method, repayments, supplier payments (owners), best sellers, sales per cashier (owners) and the cash that should be in the till, for today, yesterday, the last 7 days or this month, per store or all. It can be shared as text or sent on WhatsApp. The server read is migration `20261110150000` (`dailyReport`, read-only, rollback in `supabase/rollback`), applied to production on 2026-11-11.

Attendants who count stock and receive goods (tier 4, item 11): the owner can switch on "Can count stock and receive goods" for an individual attendant under Team (off by default). That attendant gets Stock counts and Receive goods tabs for the stores they are assigned to only; they see what each open order still expects but never a cost, and cannot create orders, pay suppliers or move stock between stores. Every movement keeps their name. Migration `20261111100000` re-declares the owner-only stock and purchase functions with the gate widened for those two features and nothing else, and adds a wrapper that checks the switch and the store assignment first. Rollback in `supabase/rollback`. **Not applied to production yet**; an older server simply hides the tabs.

Customers (tier 4, item 12): the owner can edit a customer's name and phone, archive a customer who owes nothing (hidden from the list and the till, history kept, restorable) and every statement can be shared, sent on WhatsApp to the customer's number or printed. Migration `20261111110000` adds the archive table, the archive actions and a database rule that refuses a new credit sale to an archived customer; rollback in `supabase/rollback`. **Not applied to production yet**; an older server shows every customer, as before.

Employee short-code join (tier 4, N5): the owner makes an 8-character join code under Team (shown once, kept only as a hash, works once, expires after 24 hours, at most 5 open, cancellable). A signed-in employee types it on the "Join your employer's shop" screen and becomes an attendant with no permissions and no store. Five wrong guesses lock that account for 15 minutes. The email invitation (long code) path is unchanged. Migration `20261111120000`, rollback in `supabase/rollback`. **Not applied to production yet.**

Migration hygiene: every migration from `20261106120000` onward now has a rollback script (`supabase/rollback`, run newest first), proven by a test that rolls the whole chain back and applies it again. `supabase/MIGRATION_HISTORY.md` maps production's recorded versions to the repository files and lists what the test project is missing. The test project has **not** been brought up to production (it needs about a dozen migrations applied by hand).

Faster first load: the local ledger's code (providers, shell, routes, offline assistant, backup, sales, forms) now loads only on its own routes, not on `/shop`. First load of the shared shop went from about 440 KB to about 231 KB gzipped; the device routes cost the same as before. The account-change staff lock in `App.tsx` is untouched. A tooltip provider and the currency list moved out of the shared path too.

Phone-width pass on the shared shop: a browser check (`qa/shop-phone-layout.spec.mjs`, run by CI) loads the real app at 360 and 320 px as an owner and as an attendant, with only the Supabase network mocked, visits every tab, and fails if anything makes the page scroll sideways or stick out, or if a field is under 16 px (which makes iPhones zoom in). It found and fixed three real problems: pages up to 64 px too wide on Sell and Stock, every field at 13.6 px, and Sales amounts clipped. Not covered: iPhone Safari itself, real keyboards and slow networks.

Shared shop catching up with the device app: product fields (barcode, category, goods or service, stock tracking, cost), barcode scan at the till, receipt print and share, CSV product import, sales filters and search, park and resume cart, daily and end-of-day reports, inventory console, attendant stock counts and receiving, customer edit and archive, profit and margin, expenses, employee short-code join.

Later: assistant over shared-shop data, quotations and loyalty in the shared shop, Bluetooth receipt printing, product images and variants, accounting export, app-store packaging.

## Deliberately out of scope for now

Public online storefront, paid plans and billing, tax at the shared till, and anything that needs the security audit first: CSP enforcement, hosted Auth settings, local ledger encryption, privacy and compliance documents.
