# Tallybook V19 — Stage 21 Engineering Baseline and CI Recovery

**Date:** 17 October 2026  
**Working branch:** `v19/stage21-baseline-ci-recovery-20261017`  
**Input source:** `v19/run20-operations-release-development-20261017` at `f144baec03143f1f0844811084e5d6f030d56aa4`.  
**Engineering source HEAD before this report:** `9e1b0c2af99cbc2f867f41f7ca12ffed330d8d17`.  
**Stage status:** **DEVELOPMENT IN PROGRESS — STAGE 21 NOT YET ACCEPTED**.  
**Launch decision:** **NO-GO / INCOMPLETE**. There is no user hardware UAT request, deployment, payment, active public commerce, cloud financial-sync activation or `main` merge.

## 1. Source and acceptance baseline (authoritative original records retained)

The branch's existing `docs/release/traceability.json` contains **82 unique acceptance IDs**:
- 60 `implemented-unverified`;
- 18 `missing`;
- 3 `blocked`;
- 1 `implemented-and-tested` **historical** (not retested on the new final commit).

The branch's existing `docs/release/blockers.json` contains **47 unique issue IDs**:
- 35 `implemented-unverified`;
- 6 `missing`;
- 3 `blocked`;
- 3 `implemented-and-tested` **historical**.

These counts are an inspection of existing, potentially stale register status metadata. They are **not** a new application QA result and are not updated to PASS. Individual original IDs, severities, descriptions, files, test criteria and evidence must still be reconciled on the exact validated head. The Stage 21 preflight checks count, status vocabulary and ID uniqueness without touching those original source records.

The checkout metadata has `.node-version=24.19.0`, `packageManager=pnpm@10.34.0`, `pnpm-lock.yaml` and a patched Wouter package. A public repository URL is **not a substitute for a local pinned reproducible checkout**. The GitHub source tree contains the three Playwright configs (browser, auth, offline) and the native QA scripts.

## 2. Engineering changes completed in this increment

1. **Pinned, evidence-preserving CI** — `.github/workflows/release-validation.yml` now installs the exact pnpm 10.34.0 using `pnpm/action-setup@v4` **before** setup-node's pnpm cache, then uses the repository's exact Node 24.19.0. The workflow operates with contents-read permission and has no deployment task. A separate source/toolchain preflight records Git SHA, runner platform, Node/pnpm versions, worktree status, register summaries, relative import status and extension collisions.
2. **Independent QA result capture** — Frozen install, native Node/server tests, full client Vitest/IndexedDB, semantic TypeScript, client/server production build, browser/Playwright, auth browser, offline installed production app and dependency advisory scans are individual steps with `pipefail` logs. Later independent checks continue when previous QA has failed, without incorrectly treating a failure as PASS. Browser tests require the Chromium installation; production offline browser tests require a successful build. Evidence upload is attempted on success and failure.
3. **Dependency-free source baseline audit** — New `scripts/stage21-baseline-audit.mjs` uses only Node built-ins. It refuses a wrong Git HEAD, dirty worktree, missing immutable Node/pnpm/lockfile pins, duplicate/malformed/missing historical acceptance and issue IDs, unknown release status and unresolved local TypeScript/JS imports. It also detects dangerous extensionless import collisions when a same-named `.ts` and `.mjs` both exist. The checker **never** changes business data, runs remote requests, installs dependencies or uploads records.
4. **Failed previous CI incident captured** — Existing validation run `39000398606` at `cb204d3ac8d59e9ca5834074910be271446c73f9` reported failed before visible executed steps; no job artifacts, and the job log could not be retrieved. This may be runner/account infrastructure or workflow configuration; no application assertion is claimed to have executed or failed based on that attempt.
5. **Static GitHub source-tree inspection** — The source tree was inspected without executing the app. It contains approximately 1,100 tracked files, the expected QA configs and lockfile, and two same-stem TypeScript/ESM pairs (`supplierPayables`, `cashReturnReview`) that must retain explicit imports where applicable. These file observations do not prove that every runtime import, migration or UI workflow succeeds.

6. **Local pinned developer QA fallback** — `scripts/stage21-run-developer-qa.mjs` now provides an explicit exact-Git-SHA, clean-worktree and Node 24.19.0/pnpm 10.34.0 gate for developer-controlled checkouts. It runs independent native/client/types/build/three-browser/dependency checks, records per-step outcome and private logs in a local evidence directory, and never calls deployment or business payment services. The runner is not a substitute for actual execution and was NOT executed against the complete connected repository in this source-only environment. Dependencies must already be installed unless a developer deliberately sets `TALLYBOOK_STAGE21_ALLOW_INSTALL=1` to run the frozen install.

## 2A. Actual new GitHub-hosted runner attempt (BLOCKED)

A genuine GitHub release-validation push run was triggered on the corrected branch at commit `0e2d77f80e3630f11c5356a7303e92852a46a121`:

- Run: https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/39011198208
- GitHub status: `completed`; conclusion: `failure`; start: `2026-10-17T06:47:15Z`; end: `2026-10-17T06:47:18Z`.
- Job `Pinned Node 24 - complete developer QA`: `117333910224`, `failure`, **zero reported steps**.
- Download of job logs: HTTP 404 `BlobNotFound`. No test install, TypeScript check, Vitest assertion, browser test, native suite, production build or artifact can be claimed.
- The same pre-step pattern occurred before CI workflow corrections at run `39000398606`. It may reflect hosted runner provisioning, private repository Actions usage/billing or account/repository policy. Cause NOT established. The assistant cannot inspect/alter the owner's GitHub account billing settings through these repository tools.
- Follow-up external/account checks for the GitHub owner, not merchant hardware UAT: GitHub repository **Settings → Actions → General**, account **Billing and licensing / Actions usage and budgets**, GitHub Actions service status or GitHub Support quoting the run/job IDs. No assumption of an exhausted quota or billing denial is justified without the actual account evidence.
- Alternative: run the newly authored exact-SHA developer QA harness in a proper pinned, disposable engineering checkout; preserve original per-step logs and correct every failure, then rerun at the modified SHA. Neither option is marked PASS here.

## 3. Stage 21 mandatory exit gates (current status)

| ID | Proof required to close this stage | Status |
| --- | --- | --- |
| S21-01 | One frozen, reproducible Node 24.19.0/pnpm 10.34.0 checkout and clean Git HEAD | PENDING EXECUTED PROOF |
| S21-02 | Workflow runner actually starts, install and source preflight execute with preserved logs | PENDING |
| S21-03 | Full native QA and client Vitest/IndexedDB, including Run 17–20 new tests, pass | NOT RUN ON NEW HEAD |
| S21-04 | Full semantic `pnpm check` passes with zero source errors | NOT RUN ON NEW HEAD |
| S21-05 | Production `pnpm build` emits valid client/server bundle | NOT RUN ON NEW HEAD |
| S21-06 | Auth, offline PWA and browser/IndexedDB/backup tests run without critical failure | NOT RUN ON NEW HEAD |
| S21-07 | Local import ambiguity, missing files and migration schema drift resolved | PRE-FLIGHT WRITTEN; RESULTS PENDING |
| S21-08 | 82-unit/47-issue status trace reconciled to actual final source and evidence without invented PASS | INVENTORY COUNT CHECKED; FULL RECONCILIATION OPEN |
| S21-09 | Feature inventory clearly distinguishes enabled vs disabled, missing vs implemented | IN PROGRESS; source gates below |
| S21-10 | No unaddressed developer-blocking compile/runtime issue before handoff to Stage 22 | NOT ESTABLISHED |

**Stage 21 is NOT DONE merely because a workflow file was rewritten.** If GitHub Actions again fails before steps, its outcome must be recorded as **CI RUNNER BLOCKED** and an alternative approved reproducible developer execution environment used. The owner is not responsible for finding unfinished source integration during hardware UAT.

## 4. Outstanding feature scope and future stages

- `STAGE9_RELEASE_SCOPE`: authoritative per-store inventory, transfer execution, multi-device attendant checkout and consolidated store financials OFF → Stage 23.
- `COMMERCE_RELEASE_SCOPE`: public storefront, stock reservation, order fulfillment and online payments OFF → Stage 27 (payments Stage 28).
- Run 14 remote financial sync not authorized → Stage 26.
- Run 15 production real-payment providers not authorized → Stage 28.
- Run 17 advisory review writes and autonomous actions remain OFF → Stage 29.
- Repeated exact-head financial conservation, malicious recovery, tenant isolation, low-spec browser and accessibility evidence still open → Stages 22–32.
- Full commercial release operations and external staging remain separate express owner decisions, beyond Stage 32.

## 5. Immediate continuation rules

Run CI on the **exact current branch head** after the last source correction; collect full logs, repair all discovered developer errors, rerun on the changed SHA and update the original 82/47 acceptance records with actual evidence only. Do not move on to Stage 22 claiming Stage 21 passed until these gates have their real executable proof. Avoid micro-releases: consolidate Stage 21 remediation into one reviewable completed stage. No owner physical device testing and no external environment setup is authorized by this handover.

**Current formal state: STAGE 21 IN PROGRESS / OWNER HARDWARE UAT ON HOLD / COMMERCIAL RELEASE NO-GO.**
