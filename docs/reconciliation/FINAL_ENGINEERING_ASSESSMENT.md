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
