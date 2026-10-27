# V19 unified development assessment — 2026-10-25

**Decision: integrated development checkpoint; production NO-GO.** This package is a reproducible source snapshot from `development/v19-unified-reconciliation`. It does not establish that all planned engineering stages are complete. No pull request has been opened because native verification and formal acceptance remain unresolved. No deployment, live payment processing, or production cloud integration was performed.

## Verified progress

- Master ZIP integrity and SHA-256 comparison against all 37 repository branch heads are recorded in the reconciliation manifests. The stage22 branch at `52668cc28687ef6ce1304a601e45413bac6d3093` was selected as the Git baseline, descended from `main` at `1d772d70163ce4b01d95f325321b64e651d17a81`.
- Twenty clean source merges and 193 Master-only paths were preserved. Master batch purchasing and its UI were semantically merged with later store, supplier, company, currency, and recovery safeguards. Dexie v35 retains both v30 histories and v31-v34 indexes.
- The five originally failing company-isolation tests were repaired using real staff attribution. Focused migration/isolation 22/22, purchase/isolation 25/25, Run9 finance 12/12, and backup/cost ledger 27/27 passed at their respective checkpoints. The offline and release Playwright suites each passed 3/3 after the offline stock calculation fix.
- All 20 overlapping source paths now have documented semantic resolutions. Mobile-payment provider-reference uniqueness and company-switch inventory guards were restored without dropping stage22 transaction, store, staff, and recovery protections. The obsolete authentication test now verifies cloud-only gating while local bookkeeping stays offline-capable.
- A complete, direct, serialized client Vitest run passed 995/995 tests in 124/124 files. TypeScript semantic checking, production build, release Playwright 3/3, offline Playwright 3/3, and production dependency audit with zero advisories passed. Earlier contended runs remain recorded as failures, not reclassified as passing.
- A fresh GitHub clone at `77086e2` passed frozen dependency installation, TypeScript, production build and complete client Vitest (995/995). After fast-forward to `3fd4b2f`, complete client Vitest passed again (996/996), as did release and offline Playwright (3/3 each).
- Native QA now passes 420/420. Focused server audits pass 83/83 after updating historical source contracts to the current security design. Full Windows server tests remain non-green: 345 passed, 43 optional-sync failures, 1 skipped. All remaining failures involve POSIX-only sync path security on Windows; Linux execution is required and is not yet evidenced.

## Blocking work

1. Verify the 43 optional-sync server security tests on Linux. Do not weaken POSIX path, mode, symlink, replay or revocation checks to make Windows pass.
2. Expand historical Dexie migration, interrupted restore, and real backup fixtures across more customer histories. Validate every 12-stage acceptance unit individually.
3. Obtain formal physical-device, cross-browser, recovery, and operational acceptance before any release decision.

The 12-stage register remains an evidence register, with no newly accepted unit inferred from focused tests. `BUILD_AND_CONTINUATION.md` provides exact commands and continuation order. The development branch may be reviewed, but it is not ready for an integration pull request or production release.

## Owner and attendant update — 2026-10-26

Local owner and cashier PIN sessions, permission boundaries, cloud-account transition revocation, and the signed-out cloud route were exercised again. A cashier's denied owner action now preserves that cashier's valid sales session. The complete client suite passed 1002/1002, the production build and TypeScript check passed, and the auth, release and offline browser suites passed 2/2, 3/3 and 3/3 respectively. The exact source changes and test logs are in `OWNER_ATTENDANT_AUTH_CHECKPOINT.md` and its linked evidence. Separate cloud owner and attendant identities are still **not** bound to local staff records. The connected Tallybook Supabase project reported `INACTIVE`, so live Google sign-in, membership enforcement and RLS remain unverified. This does not change the production NO-GO decision or authorize an integration pull request.

## Staff governance update — 2026-10-26

Dexie v36 adds a durable staff-governance marker for companies that already enrolled staff. The complete client suite passed 1006/1006 after a corrected new-company fixture; TypeScript, production build, native schema gate, and auth/release/offline Chromium suites passed. Raw results and the preserved earlier failing run are in `STAFF_GOVERNANCE_V36_CHECKPOINT.md`. This closes the local missing-staff-row reopening flaw, but not cloud identity binding, live RLS verification, historical customer migration acceptance, Linux optional-sync verification, or operational acceptance. Production remains NO-GO and no integration PR is ready.

## Latest Watchdog importer increment — 2026-10-26

The user supplied a separate local Watchdog desktop source. Tallybook now has an additional UTC-day canonical POS CSV that its Stage 17 importer accepts for the supported sale, discount, cash refund, accounting void and no-sale kinds. Unsupported shift, cash-count and MoMo events are visibly counted as omitted and remain available in the JSON preview. A synthetic, BOM-prefixed download passed Watchdog's real authorized SQLite import, exact replay, wrong-store, viewer-role, malformed-money, changed-payload and revoked-manager checks. This is a partial offline interchange, not the complete shared event contract or a live sync. Exact evidence is in `docs/central/2026-10-26_WATCHDOG_CANONICAL_POS_CHECKPOINT.md` and `docs/central/evidence/watchdog-canonical-verification-2026-10-26.md`.

On this increment, the full client suite passed 1008/1008; native QA passed 434/434 after a separately recorded sandbox loopback denial; TypeScript, production build and three local Chromium suites (3/3 each) passed. The connected Supabase project still returned `INACTIVE`. Transaction-bound events beyond new sales, trusted enrollment and central ingestion, full Watchdog event coverage, Linux optional-sync security, representative historical migration/restore and Windows/Android operational acceptance remain open. The 82-unit acceptance register has not been promoted. **Production remains NO-GO; no integration PR, merge or deployment is authorized by these tests.**

## Dexie v38 cash refund continuation — 2026-10-26

Confirmed partial cash refunds now write a local-only central event in the same IndexedDB transaction as the refund and stock/cost changes. The event records only staff-confirmed payout evidence and preserves unknown device/shop attribution. v38 backup and migration rules preserve old customer data without fabricating events. Drawer/no-sale records, previously missing from portable backups, are now included with validation and without reauthorizing their local device claims. The first full client run found one obsolete fixed-schema assertion (1010 pass, 1 fail); after correcting that test and adding drawer backup coverage, the final complete suite passed **1011/1011**. Native QA passed **434/434**, backup/schema native checks 18/18, TypeScript/build and release/auth/offline Chromium 3/3 each passed. Exact logs and remaining scope are in `docs/central/2026-10-26_V38_CASH_REFUND_EVENT_CHECKPOINT.md`. Full reversal, repayment, purchase and shift event capture, trusted cloud enrollment/ingest, live Supabase/RLS, Linux security and operational acceptance remain open. Production remains **NO-GO**.

## 2026-10-27 integrated source assessment

GitHub `main` and `development/v19-unified-reconciliation` received verified application commit `03a89a2f699fa34eea019f8ee1020448f0eb7efd`; an independent full local clone and a reproducible source ZIP are retained. The full client suite passed 1030/1030, native QA 435/435, focused server audit 48/48, TypeScript and Vite build passed, Chromium auth/release/offline suites passed 4/4, 3/3 and 3/3, and the Windows loopback preview returned HTTP 200. Exact logs are in `docs/reconciliation/evidence/2026-10-27/` and `MAIN_SOURCE_INTEGRATION_2026-10-27.md`.

**Development integration is complete for this checkpoint; production remains NO-GO.** The 82 acceptance decisions have not changed. The live site remains on its prior deployment because automatic Git deployment is disabled. Live owner/attendant Auth and RLS exercise, representative historical backup/restore, Linux optional-sync security cases, complete Watchdog contract, a fresh dependency audit, and Windows/Android acceptance are outstanding. No production release or payment enablement occurred.
