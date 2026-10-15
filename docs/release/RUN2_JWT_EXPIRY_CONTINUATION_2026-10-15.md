# V19 Run 2 — transaction-time JWT expiry continuation (15 October 2026)

**Status:** SOURCE HARDENING COMMITTED; **RUN 2 OPEN / NOT PASSED**. Stage 9 Round 1 PARTIAL. Commercial release **NO-GO / INCOMPLETE**.

**Review branch:** `v19/run2-transactional-recovery-20261015` (draft PR #13, based on draft Stage 9 PR #12). Implementation/test checkpoint after this increment: `159adbed868ef9503553ce0744b4fcb8d704eba3`. This is **not** an accepted V19 candidate SHA. The historical full 20-run handover is on a diverged security branch; do not blindly merge, overwrite, or switch source baselines.

## Issue and fix

A transaction-bound `auth.sessions FOR SHARE` check denies sessions that have been removed or whose `not_after` has elapsed. However, where `not_after IS NULL`, the database session row alone does **not** prove that the user's already-validated access JWT remains unexpired if the transaction is delayed between the initial Supabase `getUser` call and its security-sensitive SQL writes.

- `server/supabaseOwnershipSession.mjs` now returns `expiresAtEpochMs`, strictly derived from the JWT `exp` already checked after `getUser` validation. The bounded integer conversion is protected by the existing JWT `exp` range check.
- `server/trustedCompanyOwnership.mjs` requires that expiry metadata from its trusted resolver and denies both binding and transfer when `transactionNow >= expiresAtEpochMs`, before company records are read or modified. The existing live session lock remains mandatory.
- `server/trustedRecoveryIssuer.mjs` applies the same expiry requirement to the independent reviewer authorization flow, before verified-evidence inspection.
- Four new native regression **cases were authored** across the Supabase session resolver, trusted ownership, and recovery issuer tests. Existing test harness resolvers now provide the authenticated token deadline.

This is *additional* defense in depth, not a claim that a session revocation transaction, the Supabase Auth model, or actual ownership restore flows passed integration acceptance.

## Verification actually performed

1. Six focused, isolated JavaScript behavior checks passed on transformed source **before commit**, covering valid/missing/expired JWT metadata for both ownership binding and recovery-approval issuance.
2. Each of the six modified .mjs files was syntax-parsed prior to its GitHub write.
3. Following commit, retrieved six server implementation modules and their six associated test modules from **exact checkpoint SHA** `159adbed868ef9503553ce0744b4fcb8d704eba3`. Executed the **52 checked-in test cases** through an isolated V8 harness with Node API compatibility shims: **52/52 passed**. This is a **V8 compatibility execution**, NOT a native `node --test` run, real Supabase/Auth/RLS, PostgreSQL, or the release CI suite. Initial harness errors due to missing Buffer injection and an overly strict JSON key-order equality shim were corrected, then all 52 completed.
4. GitHub Actions `Release validation` workflow run [38773123967](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/38773123967) for the code/test checkpoint reported **failure before any job steps**. There is **no successful final-head CI evidence**, and no assertion that source tests caused this pre-job failure.

**Not executed:** native Node tests for this increment, pinned Node 24/pnpm full suite, client Vitest, TypeScript semantic checks, production build, Playwright native IndexedDB/offline, dependency audit, independent backup/restore drill, real PostgreSQL, real Supabase session-revocation/RLS, two-account/two-company isolation, serializable contention/crash, actual reviewer identity/provisioning, production private routes, or owner-device testing.

## Mandatory sequence before Run 2 acceptance

1. **Restore reproducible test execution:** Resolve GitHub Actions pre-job runner/quotas/billing/workflow availability without masking or skipping jobs. On an approved trusted runner with the pinned runtime and frozen lockfile, run the full `.github/workflows/release-validation.yml` command sequence, including all Node/server/QA, Vitest, `pnpm check`, build, Chromium migration, AuthGate/offline Playwright and dependency audit. Collect exact SHA, runner details, exit codes, logs and test counts.
2. **Real, independent restore proof:** Use approved non-customer fixture data; export a complete offline company backup, restore into a separate isolated browser/profile/database, verify all IDs/history/money and stock invariants, independently sign off review and capture linked, independently recomputable evidence. SHA-256-shaped strings or a `restoreDrillPassed` UI flag alone are not evidence. Privileged reviewer enrollment/promotion remains absent; review and implement a secure, audited process before enabling any issuance.
3. **Approved disposable database integration:** Only after explicit test-project approval, reconcile actual migration history, review and apply additive private schema to that disposable test project, use two genuinely isolated Supabase accounts/companies and service-only Postgres credentials. Test session expiry and revocation after preflight, cross-tenant RLS, owner/attendant, unrelated local IDs, stale reviewer permission, replay, simultaneous approvals, owner transfer and abort/retry/audit rollback. Never apply review SQL to the live database by default.
4. **Safe opt-in owner-approved linking:** Implement and verify the private, direct-TLS endpoint with schema validation, CSRF/origin defenses and rate limiting, audit and rollback, and the owner-confirmed local-company link UI. No implicit ownership from browser IndexedDB IDs, email or company selector; no silent migration or deletion. Keep default-off offline-first Tallybook fully usable without sign-in.
5. **Final exact-head acceptance and documentation:** Independently verify the final candidate SHA, reconcile historical 47-blocker and 82-acceptance-unit records using genuine new evidence, and obtain explicit Run 2 PASS before starting V19 Run 3.

## Release boundaries

No `main` merge, staging, public endpoint, live Supabase SQL, payment, cloud replication, destructive data changes, or production deployment was performed or approved by this increment. Draft PR #12 and PR #13 remain unmerged; owner approval is required for separately restricted operations. **Run 2 remains OPEN / NOT PASSED** until every required check above has actual independent evidence.
