@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Tallybook V19 Run 12 - disposable sample-ledger source/Windows QA.
rem NO production browser profile, real supplier payment, tax filing, provider
rem settlement, SQL migration, credential upload, staging or deployment.
cd /d "%~dp0.."
if not exist package.json (echo ERROR: Repository root missing. & exit /b 2)
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node unavailable. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm unavailable. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Pinned Node 24.19.0 required; got '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (echo ERROR: Install dependencies separately in an approved disposable checkout. & exit /b 2)
set "LOGDIR=%CD%\run12_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
node -v > "%LOGDIR%\node.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm.txt" 2>&1
echo [1/4] Native Run 12 pure supplier/tax source and integration contracts...
node --test ^
 client/src/features/reports/tests/run12SupplierFinanceAudit.test.mjs ^
 client/src/features/reports/tests/run12SaleTaxAudit.test.mjs ^
 server/tests/run12SupplierTaxIntegrationAudit.test.mjs > "%LOGDIR%\native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] Real IndexedDB supplier/expense/sales/tax/backup/previous regressions...
call pnpm exec vitest run ^
 client/src/features/reports/run12SupplierTaxIntegration.test.ts ^
 client/src/features/purchases/supplierPayables.test.ts ^
 client/src/features/purchases/purchases.test.ts ^
 client/src/features/expenses/expenses.test.ts ^
 client/src/features/sales/tax.test.ts ^
 client/src/features/reports/financialIntelligence.test.ts ^
 client/src/features/reports/run9CostReconciliation.test.ts ^
 client/src/features/reports/run10FinancialConservation.test.ts ^
 client/src/features/business/run11ReturnPolicyIntegration.test.ts ^
 client/src/features/backup/backup.test.ts > "%LOGDIR%\vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] Semantic TypeScript checks...
call pnpm check > "%LOGDIR%\typescript.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local frontend build only...
call pnpm build > "%LOGDIR%\build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Focused local checks completed without immediate failures.
echo Run entire native and client suites plus real browser/Windows drills separately.
echo Acceptance remains NOT PASSED absent observed full-sha evidence.
exit /b 0
:FAIL
echo Run 12 check failed. Inspect run12_qa_logs.
echo NO-GO. No live data or external payment operation authorized.
exit /b 1
