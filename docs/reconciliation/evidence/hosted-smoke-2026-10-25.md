# Hosted smoke check — 2026-10-25

Target: `https://tallybook-eight.vercel.app/`. Browser: isolated in-app Chromium session on Windows. Deployment commit was not established, so this does not certify development commit `f85096a` or a device/browser matrix. All data below was invented for this test; no existing business data was used.

| Flow | Observed result |
|---|---|
| Initial load | Tallybook home and navigation rendered. |
| Business setup | Saved `Codex Test Shop`; app confirmed local save. |
| Inventory | Added `Test Notebook`, price GHS 10, cost GHS 6, opening stock 5. Inventory showed 5 and an opening movement. |
| Sale | Completed one cash sale for GHS 10, receipt `TB-20261025-VUUNK`; app reported saved receipt. |
| Persistence | Reloaded Sales; the same receipt remained in Recent Sales. |
| Inventory reconciliation | Stock showed 4 and a -1 sale movement tied to that receipt. |
| Reporting | Today showed one completed sale, GHS 10 sales, GHS 10 money received, GHS 0 customer debt, stock 4. |
| Local integrity | Backup page checked 10 saved records and reported no relationship issues. |
| Backup export | App reported a downloaded readable JSON backup containing one sale. File contents, digest, and restore were not independently verified. |

Scope limits: This is a hosted browser smoke test, not an offline/restart, Android, real-data migration, encrypted backup/restore, authorization, or production release acceptance result. No deployment or external service configuration was changed.
