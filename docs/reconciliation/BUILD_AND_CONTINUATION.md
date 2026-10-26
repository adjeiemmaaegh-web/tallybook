# Reproduce the development checkpoint

Checkout `development/v19-unified-reconciliation` at the package manifest commit. Use Node.js 24.19.0 and pnpm 10.34.0 on Windows. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm exec vitest run --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --reporter=dot
pnpm exec playwright test --config playwright.config.mjs
pnpm exec playwright test --config playwright.auth.config.mjs
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --prod
```

The complete client Vitest run passed 995/995 in 124 files with the serialized invocation above; the fresh clone at `3fd4b2f` passed 996/996 after one migration test was added. Its release and offline Playwright each passed 3/3; TypeScript and build passed in the same clean checkout before that test-only update. Native QA passes 420/420; full Windows server remains non-green at 345 passed, 43 optional-sync failures, 1 skipped. See `evidence/readiness-increment.md`, `OUTSTANDING_READINESS_BLOCKERS.md`, and the raw logs.

## Continuation order

1. Run the 43 remaining optional-sync security failures in the supported Linux runtime; do not relax file, path, or authorization checks. Preserve the completed Windows QA and audit evidence.
2. Extend Dexie migration tests for both historical v30 lineages, v34 rows, crash interruption, backup and restore. Retain transaction history.
3. Maintain the passing offline Playwright checkout scenarios. Keep verified owner unlock, open shift and `requireSaleAttendant` enforced.
4. Validate the 82 governing acceptance units, physical devices and cross-browser recovery. Open a pull request against `main` only when integration is ready; do not merge or deploy automatically.

## Open risks

The source-overlap decisions are recorded, but broad real-world financial and inventory acceptance remains open. The current v36 migration fixtures cover sample rows but not all real-world histories or restore paths. Windows native tests include POSIX path and permission assumptions and cannot be counted as passing. Windows and Android operational acceptance remains deferred. Production release is NO-GO.

If pinned pnpm is unavailable because Corepack cannot reach the registry, an existing-dependency developer check can be run in PowerShell with `$env:TALLYBOOK_STAGE21_NPM_FALLBACK='1'` followed by `node scripts/stage21-run-developer-qa.mjs --sha <exact-commit>`. This records npm fallback status and each suite separately; it does not reinstall from the pnpm lockfile or count as equivalent to Linux CI. The client test portion uses one worker and 60-second per-test and hook limits to surface stalls. The dependency audit remains blocked in this fallback mode.

## v36 staff-governance continuation

The v36 migration protects companies that have already enrolled local staff from silently reopening if staff records disappear. Reproduce the focused gate with:

```powershell
pnpm exec vitest run client/src/features/staff/staff.test.ts client/src/db/unifiedMigration.test.ts client/src/features/backup/backup.test.ts client/src/features/credit/stage22ScopedSubmissionMigration.test.ts
```

See `STAFF_GOVERNANCE_V36_CHECKPOINT.md` for the exact full-suite and browser results. Next: obtain Linux CI evidence for optional-sync security, exercise historical customer backups, and implement verified cloud-to-local owner/attendant binding. Do not provision or deploy cloud services as part of this source checkpoint.
