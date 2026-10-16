@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Run 12 is LOCAL QA only: no installs, staging, cloud, live money or deployment.
cd /d "%~dp0.."
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node unavailable. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm unavailable. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Pinned Node 24.19.0 required; got '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (echo ERROR: Run in a disposable checkout with dependencies installed. & exit /b 2)
set "LOGDIR=%CD%\run12_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
node -v > "%LOGDIR%\node-version.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm-version.txt" 2>&1
echo [1/4] Run 12 pure supplier, cash and tax source tests...
node --test ^
 client/src/features/purchases/tests/run12SupplierPayables.test.mjs ^
 client/src/features/reports/tests/run12SupplierCashAudit.test.mjs ^
 client/src/features/reports/tests/run12RecordedTaxAudit.test.mjs ^
 server/tests/run12SupplierTaxWriteAudit.test.mjs > "%LOGDIR%\native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] Run 12 and previous financial Dexie integration tests...
call pnpm exec vitest run ^
 client/src/features/reports/run12SupplierTaxIntegration.test.ts ^
 client/src/features/purchases/supplierPayables.test.ts ^
 client/src/features/expenses/expenses.test.ts ^
 client/src/features/reports/run9CostReconciliation.test.ts ^
 client/src/features/reports/run10FinancialConservation.test.ts ^
 client/src/features/business/run11ReturnPolicyIntegration.test.ts ^
 client/src/features/backup/backup.test.ts > "%LOGDIR%\vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] Semantic TypeScript...
call pnpm check > "%LOGDIR%\typescript.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local build only...
call pnpm build > "%LOGDIR%\build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Focused checks completed. Full suite, Windows browsers and release gates remain mandatory.
exit /b 0
:FAIL
echo Run 12 checks FAILED. See run12_qa_logs; acceptance NOT PASSED.
exit /b 1
