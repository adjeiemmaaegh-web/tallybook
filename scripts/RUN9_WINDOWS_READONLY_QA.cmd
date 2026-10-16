@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem V19 Run 9: review-only local QA on disposable sample-data Windows checkout.
rem Does NOT delete databases, import customer data, apply schema changes,
rem connect payment providers or deploy. Never run against an owner's
rem production browser profile. Script output is not an acceptance PASS.
cd /d "%~dp0.."
if not exist package.json (
  echo ERROR: repository root not found.
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node.js unavailable. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm unavailable. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Expected pinned Node 24.19.0, got '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (
 echo ERROR: install dependencies separately in an approved disposable checkout.
 exit /b 2
)
set "LOGDIR=%CD%\run9_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
node -v > "%LOGDIR%\node.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm.txt" 2>&1
echo [1/4] Run 9 native source contracts...
node --test ^
 client/src/features/reports/tests/run9CostReturnAudit.test.mjs ^
 client/src/features/reports/tests/run9InventoryValuation.test.mjs ^
 client/src/features/reports/tests/run9PurchaseCostAudit.test.mjs ^
 server/tests/run9CostIntegrationAudit.test.mjs > "%LOGDIR%\native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] Inventory, finance, refund and backup IndexedDB regressions...
call pnpm exec vitest run ^
 client/src/features/reports/run9CostReconciliation.test.ts ^
 client/src/features/inventory/costLedger.test.ts ^
 client/src/features/reports/financialIntelligence.test.ts ^
 client/src/features/backup/backup.test.ts ^
 client/src/features/sales/cashPartialReturnPosting.test.ts ^
 client/src/features/backup/run8MigrationRestore.test.ts > "%LOGDIR%\vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] TypeScript semantic checks...
call pnpm check > "%LOGDIR%\typescript.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local build only...
call pnpm build > "%LOGDIR%\build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Focused local checks completed with no immediate failure.
echo Run full pnpm test, native suite and browser drills separately.
echo Production acceptance remains NO-GO until independent evidence.
exit /b 0
:FAIL
echo A check failed. Inspect run9_qa_logs; no release promotion authorized.
exit /b 1
