# Tallybook — two-phone field acceptance and disaster recovery runbook
Date: 16 November 2026. Scope: **controlled pilot only**.

## Before testing
- Production URL: https://tallybook-eight.vercel.app ; expected commit `175204d15c6d77a3ae9cadee505dfa1cf5821ac6`.
- Use **two distinct, owner-approved test accounts**, an **isolated test business**, and non-customer test SKUs with known starting stock and prices. Do not disturb genuine shop sales or existing inventory.
- Device A: owner; Device B: attendant; record make/model, operating system, browser/PWA, test date and software version in a private test log.
- Keep existing production data and real payment credentials untouched. Do not use the fresh-start/clear-data flag. Confirm a safe backup *before* doing any destructive recovery exercise.
- Record for each case: `NOT RUN / PASS / FAIL / BLOCKED`, expected versus actual results, timestamp, redacted evidence location, and issue ID. Evidence containing identity, staff PINs, receipts, customer information or financial details must be kept **outside this public repository**.

## Stage A: production smoke and identity (two real phones)
- [ ] A1. Both phones can open production URL on Wi-Fi and mobile data; HTTP/TLS, PWA manifest, sign-in, sign-out and password-recovery redirects work. Browser console has no critical errors; no debug/test mode is enabled.
- [ ] A2. Owner creates or opens the isolated test business. Attendant accepts an owner-issued invite, signs in on Device B, and is restricted to assigned stores and authorized actions.
- [ ] A3. Lock/sign-out and use a second account on a shared device: previous account's cart, cached data, and personal identifiers are not accessible; pending authorized sales are not misattributed.
- [ ] A4. Attempt an unauthorized staff action and confirm the **server** rejects it, rather than merely hiding its button.

## Stage B: finances, stock and audit (isolated test business only)
- [ ] B1. Register one stock-tracked item with SKU/barcode, starting quantity 10, cost and selling price. Verify owner/attendant see the right permitted fields.
- [ ] B2. Device B records a **cash** sale of quantity 2. Verify exactly one server sale, one receipt number, stock quantity 8, expected totals/currency/tax, accurate staff+store attribution, and correct owner report.
- [ ] B3. Repeat with a distinct submission while deliberately slowing/retrying the network; exactly one posted sale per submission key. Any uncertain payment must be reconciled before retrying.
- [ ] B4. Attendant submits a partial refund request; owner approves. Verify refund event, stock-return policy, corrected revenue and inventory, and immutable audit. Also verify reject/deny path.
- [ ] B5. Owner creates quotation, shares/prints it, converts once to a sale, and verifies quote/sale linkage without double stock movement.
- [ ] B6. Owner performs accounts count/transfer/reconciliation; verify opening, cash movements, refunds, expenses, and closing variance. Attendant must not see owner-only profit/cost/accounts details.

## Stage C: separate offline modes — never treat them as identical
- [ ] C1. **Shared shop**: prepare test stock while connected, disconnect Device B, attempt supported offline checkout, kill/relaunch PWA, reconnect. Verify queued state, exact eventual receipt, no duplicate posting, no cross-user attribution, no lost sale. If unavailable or server rejects stale stock, record the precise outcome, **not** a false pass.
- [ ] C2. **Standalone device ledger**: using an isolated device/profile, create a sale offline, close/relaunch, unlock locally, inspect durable sale/stock/receipt and reopen after reconnection. Verify the local ledger independently; it is not automatically the shared-cloud ledger.
- [ ] C3. On both modes, test low-storage or interrupted save without deliberately deleting genuine data. Test on a low-spec Android device and a second Android/iPhone where available.

## Stage D: real peripheral and payment boundary
- [ ] D1. Scan a real barcode using a supported HID scanner (USB/Bluetooth keyboard mode) or camera; add the correct item once; reject ambiguous scans.
- [ ] D2. Print a real receipt on a tested 58 mm/80 mm printer through the actual supported browser/OS print flow. Check quantity, discounts, tax, currency, totals and duplicate-print safety. Verify cash drawer **only if a supported real driver exists**; otherwise mark unsupported, not passed.
- [ ] D3. Distinguish **cash and manually recorded MoMo/card tenders** from *actual external settlement*. The existing server gateway is mock-only/disabled. No live electronic payment may be marked passed until an authorized processor, actual terminal flow, webhook signature check, refund and settlement reconciliation have been integrated and tested with authorized accounts.

## Stage E: backup and disaster recovery
- [ ] E1. From a test device, export a backup through the app and keep the encrypted/original file off public services. Validate creation, size/hash and required passphrase without sharing the passphrase.
- [ ] E2. Restore that file into a disposable, separate browser profile/device **only**; compare products, stock movements, sale IDs, receipt numbers, balances, staff attribution and all expected record counts. Test wrong-password and tampered-file rejection, then cold restart and re-open. Never overwrite source device.
- [ ] E3. Supabase owner confirms scheduled database backups, retention and whether point-in-time recovery is enabled by plan. Carry out **hosted backup restore into a separate temporary project** and verify schema+aggregate totals, permissions and login against non-production records; never replace production. Record restore duration and rollback/fallback procedure.
- [ ] E4. Confirm backup retention and deletion policy, and keep one known-good deployment for rollback.

## Stage F: owner-only production security settings
- [ ] F1. Supabase → Authentication → Password security: enable leaked-password protection; re-run advisors to confirm warning cleared.
- [ ] F2. Supabase → Authentication → URL configuration: verify production site URL and redirect allowlist, then test email/OAuth/password reset end-to-end on actual devices.
- [ ] F3. Independently exercise privileged RPC authorization boundaries, anonymous public guest-order rate limits and cross-shop isolation with safe test identities. The 47 `shop_*` tables currently have RLS and no direct `anon`/`authenticated` table grants, but this alone does not prove RPC security.

## Stop conditions / release gate
**STOP and withhold broad launch** for unauthorized cross-tenant data, wrong cashier attribution, an unbalanced financial ledger, missing/duplicated sales, incorrect stock after reconciliation, unreliable backup recovery, receipt inaccuracies, credential leakage or a failed real-device offline acceptance. Keep the app limited to supervised pilot operations until all mandatory items pass.

**Evidence status as of creation:** A–F physical actions **NOT RUN**; owner-only configuration **NOT VERIFIED**; hosted restore **NOT RUN**. Software CI/repository/DB metadata evidence is in [remote verification](REMOTE_VERIFICATION_2026-11-16.md). Update the checklist using genuine evidence only.
