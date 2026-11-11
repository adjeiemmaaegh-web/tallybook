# Production readiness — 2026-11-11

**Verdict: ready for a controlled pilot release (real shops, real money, a few of them, with the owner watching). Not yet ready for an open commercial launch.**

The software and the database are in the state a pilot needs. What stands between this and an open launch is mostly outside the code: settings that only the account owner can change, testing on real phones with real people, and the parked security review. Each is listed below with who does it.

## Evidence (checked on 2026-11-11)

| Area | Result |
|---|---|
| Source | `main` plus the stacked pull requests are merged; type check and production build pass; 1,458 client tests, 652 native `qa/` tests and 419 server tests pass. |
| Database (production, project "Tallybook") | All 27 migrations through `20261111170000_shop_accounts` applied; function hashes match the repository chain (two large functions match once comments are stripped). Every migration from `20261106120000` has a tested rollback script. |
| Live schema smoke test | Run on production inside a transaction that raised at the end (so nothing was kept; confirmed: 3 businesses, 7 users, 1 sale before and after). A synthetic owner and attendant set up a shop, sold, recorded an expense, read profit, saved and accepted a quotation, counted and moved money between accounts, read the daily report, created and used a join code. Every figure matched the hand calculation (net revenue 9,000; profit 3,000; expenses 500; net profit 2,500; cash in 9,000, out 2,500; bank in 2,000; quotation 13,500). The attendant was refused profit, accounts and expenses. |
| Security advisors | Only the accepted findings: row security with no policies (intended: access is through the `tallybook_shop*` functions), the four signed-in-callable entry points (each checks the caller), informational index notes, and leaked-password protection off. No function is callable by the anonymous role. |
| Dependencies | `pnpm audit --prod`: no known vulnerabilities. |
| Accessibility | Automated WCAG A/AA scan: 0 violations on every local-ledger screen at 390 px; now a CI step (`playwright.a11y.config.mjs`) so it cannot regress silently. |
| Responsiveness | No sideways overflow at 320, 390, 768, 1024, 1280 px; shared shop passes at 360 and 320 px. |
| Offline | Offline built-app acceptance passes (cached shell reloads with the network blocked). |

## Gaps, and who closes them

| # | Gap | Why it matters | Who |
|---|---|---|---|
| 1 | **Turn on leaked-password protection** (Supabase dashboard → Authentication → Password security). | Stops people choosing passwords found in breach lists. It is a dashboard setting; there is no migration for it. | Account owner |
| 2 | **Confirm database backups.** Check the plan's daily backups, and point-in-time recovery if the plan has it (Supabase dashboard → Database → Backups). | Everything shared lives in this one database. A restore has not been rehearsed. | Account owner |
| 3 | **Set the production environment variables** on the host: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_TALLYBOOK_ERROR_REPORT_URL`, `VITE_TALLYBOOK_SUPPORT_WHATSAPP`, `VITE_TALLYBOOK_RELEASE`. Leave `VITE_TALLYBOOK_FRIENDS_TEST_MODE`, `VITE_TALLYBOOK_INTERNAL_TOOLS` and the auth preview flag unset. | Without the first two the shared shop is switched off. Without an error-report URL nobody is told when the app breaks (reports then only reach people through "Report a problem"). | Account owner |
| 4 | **Check the Supabase Auth URL settings** (site URL and redirect URLs list the production address only). | Sign-in and password-reset links must land on the live site. | Account owner |
| 5 | **Two-account, two-phone acceptance** on the live site, including a real sale from each phone, a refund request, a quotation, and the accounts reconciliation. | The workflows are proven in disposable PostgreSQL, on the production schema (above) and in a browser with the server mocked, but not yet by two real people on real phones. | Owner plus one employee |
| 6 | **Real devices**: an installed PWA on an Android phone and an iPhone, a slow connection, a real printer (receipts and quotations print through the browser). | Browser automation cannot show these. | Owner |
| 7 | **Security review** (CSP is report-only today, Auth hardening beyond item 1, encryption of data held on the device, privacy and compliance). | Parked by agreement; required before an open launch. | Next phase |
| 8 | **Housekeeping**: about 25 old pull requests are still open (the October stage branches and review branches). | They hide the real state of the repository. Nothing in them is needed for this release. | Owner decides which to close |
| 9 | **Not built yet**: product images and variants, loyalty, Bluetooth printing, app-store packaging. | Not needed for a pilot; the first three are features, the last depends on a store account. | Later |

## Go-live steps (in order)

1. Items 1 to 4 above.
2. Merge the open pull request, confirm CI on `main` is green.
3. Deploy `main` to the host. `vercel.json` sets `git.deploymentEnabled: false`, so merging does **not** deploy; a deployment must be created deliberately (Vercel dashboard, CLI, or the connected assistant tools).
4. Open the live site in a fresh browser: the welcome page loads, `/shop` loads, the console is clean, the sign-in page shows no configuration error.
5. Item 5 (two-account acceptance) before any shop is told it is live.
6. Keep the previous deployment so it can be promoted back.

## Rollback

- **App:** promote the previous deployment (Vercel → Deployments → previous one → Promote). The client tolerates an older server: tabs for features the server does not have show an error instead of breaking the shop.
- **Database:** run the rollback scripts newest first (`supabase/rollback/README.md`). Do this only if a migration itself is at fault; first check whether the problem is the app, because rolling back a migration removes the tables it created, with any records in them.
- **A shop's data:** the owner's device backup and the database backup (item 2) are the two copies.

## What was checked, and what was not

Checked: everything in the evidence table. Not checked: real phones, the host's live environment (the connected tools could not reach the host account at the time of writing), a restore from backup, load beyond pilot size (production holds 3 businesses and 1 sale), and anything in item 7.
