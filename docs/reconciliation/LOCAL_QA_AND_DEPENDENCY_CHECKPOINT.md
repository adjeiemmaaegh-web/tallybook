# Local QA and dependency checkpoint

Date: 2026-10-26. Development branch only; release decision remains **NO-GO**.

## Exact-source local run

The Stage 21 harness ran against commit `e607fc29fb35c758bf22e0660ccef558bb06fe98` with Node 24.19.0, pnpm 10.34.0 and existing dependencies. See `evidence/stage21-e607fc2-summary.json` and its nine named logs.

| Gate | Result |
|---|---|
| Baseline/import and register audit | Pass; zero unresolved and ambiguous imports |
| Native and server | 784 passed, 43 failed, 1 skipped. Remaining failures are POSIX path/mode/symlink file-guard tests on Windows; no Linux pass is inferred. |
| Client/IndexedDB | 1006/1006 passed in 125 files; 705.79 seconds, one worker; no timeout |
| TypeScript and production build | Pass |
| Release, auth, offline Chromium suites | 3/3 each passed |
| Dependency audit at that commit | Failed: five advisories in development dependencies |

The harness first exposed a Windows launcher bug and two ambiguous declaration imports. Both were corrected before the exact-source run. Five historical native assertions that pinned Dexie v35 were updated to verify the v28 and v36 migration anchors and read-only financial modules; all 75 focused audit tests passed (`evidence/native-v36-integration-audits.txt`). No security file guards were relaxed.

## Patched development dependencies

The lockfile now resolves Vitest and `@vitest/mocker` 4.1.12, jsdom 30.1.3, and undici 8.12.3. The prior audit paths were `vitest > @vitest/mocker` and `jsdom > undici`. A frozen pnpm install completed; subsequent `pnpm audit --audit-level moderate` reports **no known vulnerabilities**. The full client suite passed 1006/1006 again using Vitest 4.1.12, and TypeScript and production build passed. See `evidence/patched-dependencies-{audit,client,typescript,build}.txt`.

The package update was tested locally but the full exact-source harness has not yet been rerun on its final commit. Linux GitHub Actions still fails before checkout: the job has no assigned runner and no steps or retrievable log through the connected reader. Its cause requires authenticated Actions/account inspection; do not classify it as an application test result.

## Remaining gates

Real owner and attendant cloud-to-local staff binding, online revocation and RLS acceptance remain incomplete while the connected Supabase project is inactive. Representative customer backup migration and the owner's Windows/Android operational acceptance are outstanding. No PR, deployment, or payment activation is authorized by this checkpoint.
