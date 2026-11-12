# Tallybook — full repository consolidation and technical audit

**Audit date:** 2026-11-12. **Repository:** adjeiemmaaegh-web/tallybook.
**Pinned source checkpoint:** `7132c0a8a3e1df303def32fca0e13e006ecf30b4` (`main` when audit began).
**Review workspace:** `audit/unified-local-20261112` with annotated local recovery tag `audit/local-checkpoint-20261112-7132c0a`.
**Release decision:** **NO-GO for unrestricted commercial release**. Source automation is strong; owner-specific settings, field testing, backup restoration, CSP enforcement, browser acceptance and recovery signoff are unresolved.

## 1. Scope, methodology and evidence boundaries

- Recovered full Git graph (1,230 commits reachable from audited main), inspected all 89 remote heads, 20 open PRs and four open issues. `BRANCH_AUDIT.md` provides a row for **every** branch, head and disposition. This is a real commit comparison, not guesswork based on filenames.
- Enumerated all 1,944 tracked files with original byte sizes and extensions in `tracked-files.json`. Inventoried source, tests, migration SQL, configuration, historical evidence and documentation. It would be inaccurate to claim 1,944 files received independent line-by-line human review; the inspection combined whole-tree inventory, static graph scanning, targeted high-risk code inspection, documentation reconciliation and executable suites.
- Reviewed `package.json`, lockfile, four GitHub workflows, `vercel.json`, primary README, V19 release records, two-ledger contracts, existing TODOs, server gateway and key migration contracts.
- Kept all source and financial data isolated; no production deployment, live schema migration, remote permissions adjustment, backup deletion or payment execution.
- Historical release register `docs/release/traceability.json` was last updated 2026-10-11 and reports NO-GO; the newer `PRODUCTION_READINESS_2026-11-11.md` asserts controlled-pilot technical readiness but enumerates owner/device gates. Neither is an automatic current complete acceptance.
- No security audit of individual shop operators or inference of employee theft was attempted.

## 2. Consolidation

- **89 branches**: **70** baseline or ancestors of main; **19** divergent. `qa/restart-selected-browser` has no patch-unique commits despite being divergent.
- **No wholesale historic feature merge.** Important divergent candidates are not compatible drop-ins. The owner-completion branch introduces new public commerce/customer reservation SQL, advisory schedules and store reporting; their migration history and current cloud API integration need a dedicated compatibility/security increment. Offline-vault and encrypted-workspace variants need populated-device recovery proof. Historical alternate tenant/auth, refund-policy, supplier-tax and visual variants overlap superseded contracts.
- The previously reviewed and merged PR #67 (shared-device account handover) and #69 (exact local debt summary) are present in audited main. The latest main additionally includes server-backed shift/accountability work. The branch audit preserves all deferred source rather than deleting valuable historical evidence.
- One independently demonstrated **low-risk bug fix** is applied to the isolated audit baseline: advanced repayment insights now accumulate validated customer balances as BigInt. No database schema, invoice amount, financial posting, refund policy or external API changed.
- A local annotated checkpoint preserves the original commit. Shared Git history, refs, migrations and production remain unchanged by this sandbox review.

## 3. Confirmed bug and fix

**BUG-AUDIT-001 (confirmed and repaired locally).**
`client/src/features/insights/localInsights.mjs` used `Number` addition for the **advanced repayment advisory** aggregate and suppressed the advisory when a sum overflowed `Number.MAX_SAFE_INTEGER`. Two valid values (9007199254740991 and 2) therefore produced **no repayment recommendation** rather than the exact total.
- Reproduction: `createAdvancedInsights` on the two balances returned zero `repayment` findings.
- Red regression: `qa/stage11-advanced-insights.test.mjs` failed **1 of 8** before the source fix.
- Root-cause fix: sum each individually safe integer with `BigInt` and show its exact decimal representation; no ceiling-based silent suppression.
- Green targeted verification: **13/13** across `qa/stage11-advanced-insights.test.mjs` and `qa/stage11-local-insights.test.mjs`. Financial write paths and saved data are untouched.
- Files changed: `client/src/features/insights/localInsights.mjs`, `qa/stage11-advanced-insights.test.mjs`.

## 4. Actual verification performed

| Procedure | Result | Type/limitations |
|---|---|---|
| Frozen dependencies, Node 24.22.3 / pnpm 10.34.0 | PASS | `pnpm install --frozen-lockfile`, exact observed versions; repository pins Node 24.19.0, so patch version differs |
| Baseline native/server regression | **1,076 passed; 0 failed/skipped** | Executed locally before bug patch |
| Baseline client/IndexedDB regression | **1,477 passed across 195 files; 0 failed** | Executed locally before bug patch |
| Baseline TypeScript | PASS | `pnpm check` |
| Baseline Vite/Node production bundle | PASS | `pnpm build`, assets and PWA SW generated |
| Post-fix targeted insight regression | **13 passed; 0 failed/skipped** | Red regression first, then green |
| Post-fix native/server regression | **1,077 passed; 0 failed/skipped** | Executed against patched source |
| Post-fix client/IndexedDB regression | **1,477 / 1,477 passed (195 test files), zero failures/skips** | Full rerun finished successfully on patched code |
| Post-fix TypeScript / production build | PASS / PASS | Executed with patched source |
| Production dependency advisory check | PASS | `pnpm audit --prod --audit-level moderate`: No known vulnerabilities reported at scan time |
| Compiled local PWA HTTP smoke | PASS | GET /welcome, /signin, /shop, manifest and SW: 200; unknown asset 404; disabled sync 503; write-method POST 405 |
| Actual Chromium/Playwright E2E | **BLOCKED** | Browser download failed `EAI_AGAIN cdn.playwright.dev`; no browser assertions executed in this sandbox |
| Real phones, printer, multi-account handover | **NOT TESTED** | Requires owner-run field/device test |
| Supabase project health/migration inventory | PASS for metadata only | Read-only: project ACTIVE_HEALTHY, 29 migration names on both host and source |
| Supabase shop-RPC anonymous grant | PASS for grant metadata only | Read-only SQL: 0 anonymous-callable of 4 `tallybook_shop*` functions |
| Production backup restore/operational recovery | **NOT TESTED** | No restore drill/owner settings verified |
| Vercel production deployment | **NOT PERFORMED** | Deliberately unchanged by this audit |

`FEATURE_MATRIX.md` and `FEATURE_MATRIX.csv` record **38 feature/control rows** as Passed, Failed, Partially Implemented, Blocked or Not Tested, with modes and explicit limitations. Unit-level coverage is not equivalent to manual field acceptance.

## 5. Static quality / architecture findings

- **734 TS/JS modules** and **2,207 statically resolved import edges** were traversed under `client/src`. A regex-based import graph produced **two strongly connected groups**, one involving **43 modules** (business/stock/sync/services), another `cloud/shopClient.ts` ↔ `cloud/salesFilters.ts`. It includes type-only imports and is a **refactoring risk indicator**, not proof of a runtime initialization bug; no speculative mass refactor was attempted.
- `client/src/pages/SharedShopPage.tsx` is **115,625 bytes**, `SalesPage.tsx` 60,359 bytes. Build warns about chunks exceeding **500 kB**: the main device-workspace chunk ~579 kB. Performance on an 8GB/slow mobile device was not profiled.
- Static scan found two literal TODOs in `candidate_modules/batch5/endToEndBusinessFlows.spec.ts`; both concern unfinished fixture/instrumentation for end-to-end flow coverage. They are **not** evidence that the deployed POS itself is unfinished, but they remain tests to complete.
- Tracked client source contains IndexedDB and browser-local storage by design. Sealed queue payloads differ from actively used device-ledger plaintext; losing an unbacked key may prevent recovery. Existing automated crypto tests do not establish physical key portability.
- No `lint` script is defined in `package.json`. TypeScript, regression tests, `git diff --check` and the dependency advisory scan are the performed automated gates; this is not an ESLint clean bill.
- The emitted artifact is 2.7 MB and includes a service worker/manifest. No claim of measured startup latency, battery impact or production resource budget.

## 6. Security and operational gaps

1. **CSP remains Report-Only**, not enforced: `vercel.json` and `server/index.ts`. The current threat model explicitly acknowledges this as a known XSS defense limitation. Do not flip it blindly without real OAuth, PWA and extension checks. It is a release blocker for an open launch.
2. **Leaked-password protection disabled**. Supabase's read-only security advisor reports this warning. Owner/dashboard/plan action is required; no payment or plan upgrade was attempted.
3. **Security-definer functions:** advisor warns about **5 authenticated-callable functions**; must inspect each call's session, ownership and company-boundary checks. Database count confirms 0 of four public `tallybook_shop*` functions callable by anonymous role, not a full independent penetration test.
4. **49 RLS-enabled tables have no policies**. This can be intentional deny-all under the RPC-only model; adding permissive RLS solely to clear a linter would undermine the design. Verify direct grants/definer paths; do not assume an INFO finding is exploitable.
5. **Backups and restore drills:** project backup settings and PITR restoration were not verified; local ZIP/IndexedDB recovery tests are not substitute for a hosted database restore.
6. **Production Auth URL / redirect allowlist and physical acceptance:** no two-owner/attendant two-phone, installed Android/iOS, real printer or slow-network field run on current source.
7. **Cloud sync and public commerce scope:** full cross-device device-ledger financial replication, hosted public catalogue/reservations and unattended advisory scheduling are not certified. Do not enable by flipping flags or blindly applying old branch migrations.
8. **Historical documentation drift:** old release `NO-GO` registers coexist with newer controlled-pilot readiness notes. Preserve each document's date and scope rather than declaring all 82 historical acceptance units passed.

## 7. Changes and artifacts

- Changed production-source files: **2** (single read-only insight arithmetic fix and its native regression).
- Audit-generated evidence: `BRANCH_AUDIT.md`, `branches.json`, `tracked-files.json`, `architecture-static.json`, `FEATURE_MATRIX.md`, `FEATURE_MATRIX.csv`, `CHECKPOINT.txt`, and this report.
- No branch deletion, force-push, rewrite, migration, owner setting, remote deployment or payment was performed.
- Logs exist in the audit runner as `/tmp/tb-audit-*.log` and `/tmp/tb-post-*.log`. Numeric results above reflect actual logs, not historical claims.
- Checkpoint SHA is fully reproducible. A proposed integrated commit must have exactly the two code/test deltas plus audit documentation; all other historic branch source remains preserved and deferred.

## 8. Readiness verdict

**Completed and verified:** frozen install, local native+client suites, semantic TypeScript and build, exact-arithmetic regression, local HTTP route behavior, current project migration-name alignment, basic RPC grant metadata and dependency advisory scan.

**Implemented but not verified:** full multi-device cashier handover, cloud session redirects, production restore, browser-installed PWA, active-device encryption/recovery, full company/stores data convergence.

**Incomplete or defective:** CSP enforcement (report-only), owner dashboard leaked-password protection, unintegrated public catalogue/reservations/scheduling/store reporting; large module cycles and high-bundle-size debt remain.

**Blocked by environment/external dependencies:** browser download DNS; real Android/iOS/printing; owner-only security and backups; live shop acceptance. Even a full source CI pass cannot resolve these alone.

**Final decision:** technically healthy, source-level audit candidate **only**. **DO NOT declare unrestricted commercial production readiness.** Controlled pilot permissions and physical/owner signoff must be evaluated separately by the owner.
