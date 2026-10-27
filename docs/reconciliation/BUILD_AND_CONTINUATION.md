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

## Watchdog local importer continuation

The actual Watchdog desktop source supplied by the user is at `C:\Users\adjei\Documents\Codex\2026-10-10\referenced-chatgpt-conversation-this-is-an-2\outputs\alchemy-integration\integrated`. It is a separate local source, not the connected website repository. After any changes to the POS exporter, run:

```powershell
node qa/generate-watchdog-preview.mjs
node --test qa/watchdog-canonical-export.test.mjs qa/watchdog-export-file.test.mjs
python -B qa/probe-watchdog-importer.py 'C:\Users\adjei\Documents\Codex\2026-10-10\referenced-chatgpt-conversation-this-is-an-2\outputs\alchemy-integration\integrated'
python -B qa/test-watchdog-import-roundtrip.py 'C:\Users\adjei\Documents\Codex\2026-10-10\referenced-chatgpt-conversation-this-is-an-2\outputs\alchemy-integration\integrated'
```

For the complete local source check, run Vitest from `client/` with one worker, the native `qa/*.test.mjs` and `qa/*.test.cjs` files with local loopback access, TypeScript, production build, and release/auth/offline Playwright. The earlier root-level full Vitest invocation stalled before collection; its log is preserved. See `docs/central/evidence/watchdog-canonical-verification-2026-10-26.md` for exact results and limitations. The separate Supabase test environment is still unavailable because project `qfyydfxwvifdvffdfgeu` reported `INACTIVE`. Resume the activation and forward-only migration handoff in `docs/central/2026-10-26_LOCAL_CENTRAL_CHECKPOINT.md`; never apply draft `tb_*` migrations blindly to the live schema.

## Dexie v38 continuation

`docs/central/2026-10-26_V38_CASH_REFUND_EVENT_CHECKPOINT.md` documents the additive operational event table, cash-return transaction, and newly portable drawer/no-sale records. Reproduce the focused gate from `client/` with `..\node_modules\.bin\vitest.cmd run src/features/sales/cashPartialReturnPosting.test.ts src/db/unifiedMigration.test.ts src/features/backup/backup.test.ts src/features/credit/stage22ScopedSubmissionMigration.test.ts --maxWorkers=1`. From the repository root, run `node --test client/src/features/backup/tests/run8BackupCompatibility.test.mjs qa/stage12-schema-gate.test.mjs`. The full client, native and browser results and raw logs are in `docs/central/evidence/v38-verification-2026-10-26.md`. Continue with full reversal, repayment, purchase and shift events, each inside its existing write transaction with rollback and backup tests. Keep cloud posting disabled until the inactive Supabase project can be inspected and a separate isolated environment validates enrollment, transactional ingest and RLS.

## Reproduce the 2026-10-27 integrated source checks

Use the independent full clone in `work/tallybook-local-clone` on `development/v19-unified-reconciliation`. With Node 24.19.0 and dependencies from the frozen lockfile already installed, run the commands below from the clone root. The evidence for the integrated application tree is in `docs/reconciliation/evidence/2026-10-27/`.

```powershell
Push-Location client
..\node_modules\.bin\vitest.cmd run --maxWorkers=1
Pop-Location
node --test qa/*.test.mjs
```

Run the remaining semantic and build gates from the clone root:

```powershell
node_modules\.bin\tsc.cmd --noEmit
node_modules\.bin\vite.cmd build
```

For local browser use, double-click `START_TALLYBOOK_WINDOWS.cmd` or run `powershell -ExecutionPolicy Bypass -File tools/start-local-preview.ps1`; visit `http://127.0.0.1:4173/`. The launcher builds and checks static assets before serving. Full browser test commands and results are in the raw evidence logs; run them on a machine with the required Chromium installation. A Windows-native full server run still has 43 POSIX-only optional-sync failures; do not mark that gate passed until a Linux run verifies it.

GitHub main contains the reconciled development source, but `vercel.json` disables automatic Git deployments. The public site was not updated by the main fast-forward. The 82 acceptance statuses remain unchanged and production is still NO-GO.
