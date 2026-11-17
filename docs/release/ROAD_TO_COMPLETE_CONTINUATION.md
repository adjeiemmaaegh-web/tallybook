# Stage engineering delivery evidence — 17 November 2026

Baseline: main `41d4bab619db1808f21471299bd7760eee1a6836`; continuation starts after published `5b2dfdc3b650a8b5fd014473b18d8d1ad8e4a539`. Source/commit identity: [exact mapping](evidence/road-to-complete-continuation/commit-map.json). None of these increments certifies its entire stage. Mandatory unresolved criteria remain in the [119-task register](ROAD_TO_COMPLETE_PROGRESS.json).

| Stage | Published implementation commit | Actual engineering and reused authority | Verification and limits |
| --- | --- | --- | --- |
| 21 — Repository reconciliation | `5a4412009305e7c6d3070d1d11cd6a9c34d2871b` | Selected hold and backup safeguards from divergent owner branch; exact expiry/price/identity checks retain canonical sale/backup engines. All 42 branch recommendations and 26 archived module dispositions retain history. | 42 focused service tests; candidate-disposition and import tests. Full source/mutation and 143 historical-ID reconciliation stay open. |
| 22 — Financial integrity | `d3b0dc5ddc4dae0012f81516d6294d943850873d` | Negative numeric CSV amounts remain numeric. Independent real-service journey covers purchase/payable/settlement, cash/credit/wallet sales, repayment, partial return, refund, expense, stock and COGS. | 27 report tests plus a cross-ledger conservation oracle; retries, rejected overpayments and injected receipt-write rollback preserve stored state. Not all tender/reversal/concurrency cases are certified. |
| 23 — Inventory and stores | `d434db979cf6b0041c3e7d80aea6c74b7592abdc` and `df78ddb6af27fd7529f21cac01140c06645870ad` | Integrates device-local allocation and paired transfers into canonical stock ledger; saved dispatch and active transaction required. Distinct assigned dispatch/receipt staff supported. Original-store sales contribution leaves unlocated history/expenses unallocated. Preserve accessible confirmation. | Four focused files/24 tests; nine store integration cases. Full intermediate client run: 230 files/1,837 tests. Case-insensitive module collision found and fixed. Partial transfers, expiry-batch store provenance, distributed stock and scale remain open. |
| 24 — Persistence and recovery | `acf8d2c6d54c0c479e3a5aed980cf67c49bd00ac` | Device registration/revocation now use shared recovery lock, journal barrier and final employee/company checks. Reuses canonical staff authority. | Four focused files/21 tests including interrupted recovery and asynchronous lock/switch. Full active-ledger encryption remains missing; isolated hosted/physical recovery acceptance remains open. |
| 25 — Identity and tenant security | `d951c730e74d810a297afc1d040f088669d8ea40` | Additive `20261117052213_business_type_active_session.sql` requires existing active Auth session proof before owner classification. No duplicate identity engine or new tables. Catalog tests cover every public SECURITY DEFINER signature and legitimate invoker delegates. | Pre-fix revoked-session bypass reproduced in isolated full-chain PostgreSQL. Three fix/rollback tests and exhaustive catalog negatives; focused 13 tests pass. Source has 38 migrations, production remains 37. No live auth mutation or account data inspection. |
| 26 — Synchronization and integration | `334f2beaa5c2c52b3864e7069a0d4de115746b1d` | Original employee/company and complete immutable queue identity bind send and acknowledgement. Recheck consent/device/recovery, reject changed events and central receipts. Watchdog CSV respects existing whole-unit currency storage while preserving preview provenance. | Five focused files/30 tests; five native Watchdog tests include all ten currencies and sale/refund/discount. Transport is injected. No complete financial replication or current real-importer acceptance claim. |

## Reproducible verification

Environment: isolated Linux checkout, Node **24.19.0**, pnpm **10.34.0**, frozen installed dependencies. Use `.node-version` and `packageManager`; no dependency changes in this continuation.

```sh
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
pnpm test --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --reporter=verbose
pnpm check
pnpm build
node scripts/road-to-complete-register.mjs
```

Final frozen-source native execution: **1,173 passed, 0 failed, 0 skipped**; types and production build passed. Client execution passed **232 files/1,849 tests** on source `334f2beaa5c2c52b3864e7069a0d4de115746b1d`; all six hosted workflows passed on that SHA. Older full client results and original six successful hosted workflows are historical to their exact earlier source. [Hashed execution logs](evidence/road-to-complete-continuation/manifest.json) retain actual output, including separately named intermediate runs. Interrupted runs are not passes.

## Remaining risks and gates

The pending source SQL guard repairs a demonstrated authorization gap; production still requires separately authorized application and real Auth regression. No migration was applied through the connected production service. Read-only aggregate [hosted metadata](evidence/road-to-complete-continuation/production-readonly-metadata.json) confirms 37 migrations, 47 shop tables with RLS and no direct anon/authenticated table grants. Leaked-password protection remains disabled and owner-controlled; [setting documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Local store inventory is newly enabled and has transactional/permission tests, but distributed inventory, partial transfer receipt and store-specific batch provenance are not available. Existing batch operations refuse unsupported store attribution rather than inventing a location. Historical stock and sales are not rewritten.

Watchdog main `bc37f6fedbf80a184dbfbd3c1b53124a3c86564a` in the accessible Alchemy-Watchdog repository is a website, not the importer implementation. October importer hashes/results remain historical. Current end-to-end import, event completeness and device provenance stay open; no theft allegation or verified cloud receipt can be inferred from a local preview.

Whole-ledger encryption, complete financial replication/conflict resolution, public order/reservation/fulfillment scope, real provider settlement/refund lifecycle, persisted approved automation and comprehensive release acceptance remain engineering or external requirements. No scope reduction, main merge, deployment, production reset, live finance write, credential change or payment activation occurred. Next: Stage 27 source work while retaining earlier unresolved requirements; final decision remains **NO-GO**.


## Stage 27 — Public commerce, order security and truthful local requests

Isolated source candidate: `a067001` in the separate development worktree; the same eleven source files were integrated into the primary branch without importing older branch assumptions. Canonical guest RPCs remain intact. New restricted trigger `20261117060608_guest_order_price_snapshots.sql` captures authoritative per-line prices/currency for new requests and compares every immutable converted order line. The pre-fix regression demonstrates two changed product prices with an unchanged total were accepted. After the fix, conversion rolls back every tentative order line and leaves stock unchanged. Exact request/conversion replay remains safe. Legacy unconverted requests preserve original rows and require a fresh quote; no historical price is invented.

Local draft writes now check the durable recovery journal and original staff unlock epoch before and after asynchronous work. Private reads require sales permission. Company/employee changes remount the form, clear customer contact/address and ignore stale responses. Catalogue display uses existing whole-unit currency policy. These are unpaid planning operations, not public checkout, reservations or delivery confirmation.

Verification: **1,177 complete native/server tests passed**, 6 focused client files/**44 tests passed**, strict TypeScript/build passed. The full-chain quote/catalog tests independently passed **11 tests**; the earlier full client/browser proof belongs to frozen Stage 26 source. A native historical VM harness initially failed to load the new recovery import; it now uses the real barrier and adds an explicit interrupted-journal denial test. No assertion or security gate was removed. Full native was rerun after the repair.

The source chain now has **39** migrations; production remains at **37**. Both new guards are unapplied and forward-only. The older rollback drill excludes the guest table and its dependent quote trigger together; independent full-chain tests cover guarded rollback, legacy upgrade, unknown original evidence, currency drift, replay and failed conversion effects. Public reservations, expiry/reapproval, partial fulfillment, customer retention/deletion and real HTTP/physical acceptance remain open. Regression risk: unconverted legacy guest requests need fresh quotes, intentionally preventing unverifiable price acceptance. Next stage: 28, provider readiness and manual tender evidence, while retaining these unresolved criteria.


## Stage 28 — Recorded payments and provider readiness

Receipt rendering now labels staff-recorded Mobile Money/card/split tenders as **unverified provider settlement** in standalone screen/share/thermal text and shared-shop screen/share/print text. The amount is recorded paid, not provider-settled. Historical standalone receipts use the original sale currency when available, preserving legacy fallback where no original code exists. Tests assert exact money values, unchanged input records, manual single/split tender labels and whole-unit historical currency despite changed company settings.

Verification: **3 focused client files/20 tests passed**, strict types/build passed. This does not prove live provider integration. The existing backend gateway and signed sandbox harness remain local-only simulators with no production route. Inspection confirms real durable provider adapter, settlement state and refund/chargeback architecture remain missing engineering; provider contract/fees/sandbox credentials are separately owner/external blocked. No real payment, provider configuration or auth setting was changed. This is a receipt-integrity increment, not completion of Stage 28; its next mandatory source task is a durable provider-independent adapter/settlement contract with transactional replay/failure tests.
