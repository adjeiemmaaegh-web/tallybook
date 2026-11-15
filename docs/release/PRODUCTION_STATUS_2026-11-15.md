# Production status — 15 November 2026

This is the page to read first. It supersedes the verdict in [CURRENT_STATUS.md](CURRENT_STATUS.md) (11 November) and [PRODUCTION_READINESS_2026-11-11.md](PRODUCTION_READINESS_2026-11-11.md), which stay as evidence.

## Verdict

**Engineering-complete for a production pilot of the shared shop and the standalone device ledger.** Source, database and CI all agree. The remaining items are owner-only settings and real-world acceptance (listed below), not missing code.

## What is true on `main` (`78a0b6f` and later)

| Area | State |
|---|---|
| CI | All six workflows green on the merged heads of #100 and #101: release validation (native/server, client Vitest, types, build, Chromium release/auth/fresh-start/layout/a11y/offline/performance, dependency audit), UI verification, integrated reference UI, Edge + WebKit engines, CodeQL, Clementia 100 × 20 matrix. |
| Production database ("Tallybook", `qfyydfxwvifdvffdfgeu`) | Every repository migration is applied, including `tallybook_active_session_proof`, `company_creation_active_session` and `telegram_daily_summary` (applied 15 Nov). Every `public`/`private` function body matches the repository (whitespace and comment lines ignored). Version mapping: [supabase/MIGRATION_HISTORY.md](../../supabase/MIGRATION_HISTORY.md). |
| Security advisors | Only the accepted findings: tables with RLS and no policies (access is through the checked `tallybook_*` functions), signed-in-callable entry points that check the caller, `tallybook_guest_order` callable by `anon` on purpose (bearer share token, rate-limited), and leaked-password protection off (dashboard setting, below). |
| Content-Security-Policy | **Enforced** on Vercel and the Node server (#101). `qa/browser-csp.spec.mjs` walks the built app under the policy and fails on any violation. Zod runs jitless so it never probes `eval`. |
| Telegram | Daily summary push merged (#100) and its migration applied. It stays off until the owner sets `TELEGRAM_CRON_SECRET`, redeploys the `tallybook-telegram` edge function from `main` and schedules pg_cron (see the function README). |
| Pull requests | Six stale October/November drafts (#4, #11, #16, #25, #26, #56) were closed as superseded; their branches are kept. #82 was superseded by #100. #85 (fresh-start reset record) stays open because it documents an owner decision. |

## Owner actions (cannot be done from the repository)

1. **Deploy `main` to Vercel production** if the deployment card in the hand-over message does not show it done. Production was last deployed from `bd93ee15` (PR #99); #86, #100 and #101 are newer.
2. **Leaked-password protection:** Supabase → Authentication → Password security → on.
3. **Backups:** confirm daily backups (and PITR if the plan has it) and rehearse one restore.
4. **Auth URLs:** Supabase → Authentication → URL configuration lists only the production address.
5. **Two-phone acceptance:** owner and attendant on separate real phones: a sale each, a refund request, a quotation, an accounts reconciliation, offline restart and reconnect.
6. **Decide on strict online accounts / fresh start** (#85). Both flags default off. Turning on `VITE_TALLYBOOK_FRESH_START_EPOCH` irreversibly wipes every browser's local data on next visit, so it needs a verified backup first.
7. **Branch tidy-up:** the session proxy cannot delete branches. Merged heads that can go: `ui/stockdey-29-reference-parity-20261114`, `qa/reverify-16-existing-stages-20261114`, `feat/core-shop-operational-upgrades-20261114`, `feat/shop-stocktake-quotes-expenses-reporting-20261114`, `feat/public-marketing-pillars-verified-20261114`, `feat/phase-b-*`, `feat/photo*`, `fix/assistant-reversal-preview-identity-20261113`, `fix/physical-return-store-provenance-20261113`, `release/fresh-start-required-signin-20261113`, `release/shared-shop-ledger`, `security/mandatory-online-account-boundary-20261113`, `v19/run11-*`, `v19/run4-*`, `feat/telegram-daily-summary`, `security/enforce-csp-20261115`.

## Not built (later phases)

Loyalty, Bluetooth printing, product images, app-store packaging, encryption of the device-local IndexedDB ledger.
