# Stage 21 execution evidence — 17 November 2026

**State: partial engineering increment; NO-GO.** No task's entire completion criterion is certified. No production action is authorized by these results.

## Baseline and boundaries

- Clean clone main: `41d4bab619db1808f21471299bd7760eee1a6836`; audited source `5633c3901136cd0024021255ae0c29eceb0f10be`. Only `road-to-complete.md` differs between those commits.
- Branch: `codex/road-to-complete`. 2,091 baseline tracked paths, 37 canonical migration files, 42 non-main remote refs.
- Read current roadmap in full directly from GitHub before cloning. Read README, architecture history, RC integration/reconciliation, release registers, migration mapping, CI and candidate batch descriptions. Remaining source-by-source and per-ID semantic audit is explicitly open.
- Device IndexedDB and authenticated shared-shop SQL remain separate. No schema, data, policy, account, reset flag, cloud configuration or payment gateway was changed.
- Production SHA/schema statements in `REMOTE_VERIFICATION_2026-11-16.md` are historical. No fresh production or hosted recovery certification was performed.

## Implemented changes

1. Roadmap/register integrity gate and negative tests; CI runs it before dependency installation. Original roadmap requirements are preserved exactly in 119 individual rows.
2. Read-only branch reconciliation tool with a disposable Git regression proving ancestry, cherry-picked equivalence, genuinely unique patches, blob matching and exclusion of symbolic `origin/HEAD`.
3. PGlite fixture cleanup in invitation and refund-policy suites. Each created database is registered for cleanup before migration/setup, so failures also release it. All existing business/security assertions are preserved.
4. Configured candidate browser placeholders throw explicit unimplemented errors. No fixture URL can convert body visibility to business acceptance. They remain outside release-suite discovery.
5. Retired unreferenced `StagePlaceholder.tsx`. `rg` found no active imports; historical manifests remain untouched as historical source evidence.
6. Field runbook now binds execution to the chosen SHA, target, artifact and schema rather than a stale universal deployment SHA.

## New executions

Linux, exact Node **24.19.0**, pnpm **10.34.0** via Corepack, frozen lockfile. The host defaults were Node 24.22.1/pnpm 11.25.0; host-default runs are not pinned-toolchain evidence.

| Check | Command | Result |
|---|---|---|
| Install | `corepack pnpm install --frozen-lockfile` | PASS; no lockfile change. esbuild lifecycle-script warning retained; build succeeds. |
| Types | `corepack pnpm check` | PASS |
| Production bundle | `corepack pnpm build` | PASS; client PWA plus server bundle |
| Native/server | `node --experimental-strip-types --test --test-concurrency=1 scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` | 1,165 PASS, 0 fail/skip; 213.0 seconds. Includes 6 new tooling tests. |
| Invitation/refund cleanup | `node --test --test-concurrency=1 qa/shared-shop-refund-policy.test.mjs qa/membership-invite-24h.test.mjs` | 12 PASS, 0 fail/skip |
| Register/branch tools | `node --test qa/road-to-complete-*.test.mjs` | 6 PASS, 0 fail/skip |
| Financial reporting diagnostic | `corepack pnpm exec vitest run src/features/reports/financialIntelligence.test.ts --maxWorkers=1 --reporter=verbose` | 25 PASS; subset only |
| Complete client | `corepack pnpm test --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --reporter=verbose` | 1,823 PASS across 228 files; 294.62 seconds; 0 failed. |
| Candidate negative probe | Configured both fixture URLs; ran isolated candidate Playwright config without browser fixtures | Both tests fail with explicit `Unimplemented candidate` errors, as intended. This is fail-closed scaffold evidence, not accepted E2E. |
| Chromium installation | `corepack pnpm exec playwright install chromium` | BLOCKED: v1248 archive is invalid/truncated (`End of central directory record signature not found`). Browser suites not executed. |

Initial host-default native run: 1,154 pass/3 fail. One failure was the new parser's punctuation mismatch, fixed and retested. Two PostgreSQL file processes failed after early assertions; fixture review found unclosed database instances. Cleanup plus pinned bounded-concurrency rerun passes all 1,165 tests. This supports the correction but does not prove every original process failure had the same cause.

A bounded 180-second client run passed 1,210 individual assertions before timeout; it was incomplete, not a passing suite. The subsequent complete run with a 600-second limit passed all 1,823 tests. Two earlier nonverbose diagnostic runs were interrupted after not producing suite summaries; their output is not acceptance evidence.

## Source and branch findings

- See [all 42 branches](ROAD_TO_COMPLETE_BRANCHES.md). 9 tips are ancestors and 33 require remaining semantic review. No required work was discarded based on a branch being old or patch-unique.
- `qa/pilot-field-acceptance-20261116`: both changed document blobs already match main. Reuse is verified by Git blob equality, not a claim of field execution.
- Owner-completion branch includes unique reservation/scheduler/store-accounting proposals. Direct tip comparison also shows physical-return handling already incorporated with stronger current store validation; do not overwrite it. Its commerce SQL predates 21 newer canonical migrations and cannot be imported without compatibility work.
- Candidate batches are checkers/planners/scaffolds, not replacement finance or security engines. Module-by-module retirement/integration decisions remain open.
- GitHub issues #5, #8, #9 and #68 were read and remain open. #5 needs screen/acceptance parity; #8/#9 require current store/identity/sync evidence; #68 requires complete sale/shift linkage and real shared-device acceptance. No issue comments or closures were made.
- PR #85 is still open draft, 3 commits/2 documentation files, with an owner-controlled reset policy. It was not merged; its historical request does not authorize a production reset in this session.

## Remaining and handoff

ST21-02 through ST21-06 and ST21-09/ST21-10 need deeper requirement/branch semantics. ST21-11 needs separately authorized governance review. ST21-12 still needs all inactive routes/feature flags classified. ST21-13 has complete local client/native/type/build evidence; browser evidence remains blocked. Preserve the [143 original IDs](ROAD_TO_COMPLETE_HISTORICAL_IDS.json), then progress to Stage 22 without importing competing ledgers/migrations.

Regression risk is confined to QA tooling/cleanup and retirement of an unreferenced component. The financial, authentication and persistence writers are unchanged. No stage is represented as accepted, production-ready or owner-approved.

## Committed implementation and final local checks

Implementation commit: `280216bf01530bae984bb396a7c971e6790f1c3f`. Subsequent edits add evidence/register metadata only. On that clean code commit the baseline preflight passes (1,133 scanned source files, 2,709 local imports, no unresolved/ambiguous imports), default CI native command passes **1,165/1,165** in 55.85 seconds, types/build pass, and dependency audit reports **no known vulnerabilities**. The full client run covers the same active application source; the retired unimported placeholder was not loaded by the suite.

The refreshed static write-path inventory lists **100 candidate mutating functions in 42 modules**. This is discovery evidence, not authorization certification; callbacks, SQL and delegated mutations still require manual/invariant review.

Raw command outputs and SHA-256 hashes are retained in [the evidence manifest](evidence/road-to-complete-stage21/manifest.json). The [artifact/schema manifest](evidence/road-to-complete-stage21/artifact-schema-manifest.json) hashes all 37 migration files and current build outputs. It records no fresh hosted-schema inspection and is not a frozen final V19 release candidate.

Git CLI push had no HTTPS credentials; publication uses the authenticated GitHub connection. The GitHub commit must have the same tree as the local candidate and remain on the isolated development branch. Main and deployment remain unchanged.
