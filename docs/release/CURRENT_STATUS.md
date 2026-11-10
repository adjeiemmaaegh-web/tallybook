# Current status (updated 2026-11-10)

This is the single page to read first. Everything else under `docs/release/` is a dated snapshot of an earlier stage and is kept as evidence only. In particular `blockers.json` and `traceability.json` are the October V19 registers: automated QA scripts read them, so they are not edited by hand, and their "NO-GO / INCOMPLETE" wording does not describe today's shared shop.

## What is deployed and verified

- **Code:** `main` after pull request 55. `pnpm check` passes, `pnpm build` produces the PWA bundle, and `pnpm audit` reports one low advisory with no patched version (a transitive `deepmerge` under `vite-plugin-pwa`). Checked 2026-11-10 on Node 22.23.4 and pnpm 10.34.0. The CI runs listed in [RC_QA.md](RC_QA.md) remain the test evidence.
- **Production database ("Tallybook" Supabase project):** the migrations through `20261109020000_shared_order_lines.sql` are applied, so the stock, purchasing, online-order and refund-policy functions exist. They were applied on 2026-11-10 and Supabase recorded them under new version numbers (`20261110…`) rather than the repository file names. Run `supabase migration repair` before using the CLI against this project. Only `20261106120000` and `20261106130000` have rollback scripts in `supabase/rollback`.
- **Not exercised end to end:** the new stock-count, transfer, purchasing and online-order workflows have been tested in disposable PostgreSQL only. Two-account and real-device acceptance is still outstanding.

## Open development work

Quick wins: done (zoom, PWA install, in-app confirmations, supplier archive, documentation pass, one-step transfer, WhatsApp send for receipts, balances and payment confirmations). The owner/employee choice at sign-up already existed; business type needs a server field and moves into the product-fields migration.

Sales search with day, store, payment and text filters plus paging is live in production: migrations `20261110120000` (indexes) and `20261110130000` (search) were applied on 2026-11-10 (recorded as `shop_sales_hot_path_indexes` and `shop_sales_search`) and checked with a rolled-back dry run against the real data. The app falls back to the latest 50 sales, labelled, if it ever talks to a server without them. Rollback scripts are in `supabase/rollback`.

Done in code: receipt share, WhatsApp and print in the shared shop, and optional client error reporting (set `VITE_TALLYBOOK_ERROR_REPORT_URL` to turn on delivery; unset, nothing leaves the device).

Shared shop catching up with the device app: product fields (barcode, category, goods or service, stock tracking, cost), barcode scan at the till, receipt print and share, CSV product import, sales filters and search, park and resume cart, daily and end-of-day reports, inventory console, attendant stock counts and receiving, customer edit and archive, profit and margin, expenses, employee short-code join.

Later: assistant over shared-shop data, quotations and loyalty in the shared shop, Bluetooth receipt printing, product images and variants, accounting export, app-store packaging.

## Deliberately out of scope for now

Public online storefront, paid plans and billing, tax at the shared till, and anything that needs the security audit first: CSP enforcement, hosted Auth settings, local ledger encryption, privacy and compliance documents.
