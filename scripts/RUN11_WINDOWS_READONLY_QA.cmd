@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Tallybook V19 Run 11 - disposable local return-policy verification.
rem No dependency installs, production browser data mutations, payment
rem provider calls, live Supabase SQL, merges or deployments.
cd /d "%~dp0.."
if not exist package.json (echo ERROR: Run from checked-out repository scripts folder. & exit /b 2)
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node unavailable. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm unavailable. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Pinned Node 24.19.0 required. Found '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (echo ERROR: dependencies must already be installed in a disposable checkout. & exit /b 2)
set "LOGDIR=%CD%\run11_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
node -v > "%LOGDIR%\node-version.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm-version.txt" 2>&1
echo [1/4] Pure company policy / historical authorization and static entrypoints...
node --test ^
 client/src/features/business/tests/run11ReturnPolicy.test.mjs ^
 client/src/features/business/tests/run11PolicyEvidenceAudit.test.mjs ^
 server/tests/run11ReturnPolicyIntegrationAudit.test.mjs > "%LOGDIR%\native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] Actual IndexedDB and previous money/stock regressions...
call pnpm exec vitest run ^
 client/src/features/business/run11ReturnPolicyIntegration.test.ts ^
 client/src/features/business/businessProfile.test.ts ^
 client/src/features/sales/cashPartialReturnPosting.test.ts ^
 client/src/features/sales/cashReturnReview.test.ts ^
 client/src/features/credit/credit.test.ts ^
 client/src/features/reports/run9CostReconciliation.test.ts ^
 client/src/features/reports/run10FinancialConservation.test.ts ^
 client/src/features/backup/backup.test.ts > "%LOGDIR%\vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] Semantic TypeScript...
call pnpm check > "%LOGDIR%\typescript.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local frontend build, not deployed...
call pnpm build > "%LOGDIR%\build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Focused local QA ran without immediate failure.
echo This is NOT an acceptance PASS, and real browser/full suite remains required.
echo See run11_qa_logs. Do not deploy, migrate or activate live refunds.
exit /b 0
:FAIL
echo A Run 11 check failed. Review run11_qa_logs.
echo Acceptance stays NOT PASSED and V19 release NO-GO.
exit /b 1
