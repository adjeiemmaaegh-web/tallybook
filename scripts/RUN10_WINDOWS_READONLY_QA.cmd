@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Tallybook V19 Run 10: read-only validation on an isolated sample-data checkout.
rem Never run on an owner's everyday browser profile or actual customer ledger.
rem No Node/pnpm installation, cloud access, migrations, payment, or deployment.
cd /d "%~dp0.."
if not exist package.json (echo ERROR: repository root missing. & exit /b 2)
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node unavailable. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm unavailable. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Expected Node 24.19.0, found '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (echo ERROR: install dependencies separately in disposable checkout. & exit /b 2)
set "LOGDIR=%CD%\run10_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
node -v > "%LOGDIR%\node.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm.txt" 2>&1
echo [1/4] Native credit/prepaid reconciler cases and static source contracts...
node --test ^
 client/src/features/reports/tests/run10ReceivablesAudit.test.mjs ^
 client/src/features/reports/tests/run10PrepaidCashAudit.test.mjs ^
 server/tests/run10FinancialIntegrationAudit.test.mjs > "%LOGDIR%\run10-native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] Selected real IndexedDB financial regressions...
call pnpm exec vitest run ^
 client/src/features/reports/run10FinancialConservation.test.ts ^
 client/src/features/credit/credit.test.ts ^
 client/src/features/customers/walletTransfers.test.ts ^
 client/src/features/reports/financialIntelligence.test.ts ^
 client/src/features/backup/backup.test.ts ^
 client/src/features/inventory/costLedger.test.ts > "%LOGDIR%\run10-vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] Full semantic TypeScript checks...
call pnpm check > "%LOGDIR%\run10-typescript.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local production bundle compilation (without deployment)...
call pnpm build > "%LOGDIR%\run10-build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Focused local checks completed without immediate failure.
echo This does NOT pass V19 Run 10 or authorize live financial operations.
echo Full repository, multi-tab, power-loss and real-browser checks still required.
exit /b 0
:FAIL
echo Run 10 QA failed: inspect run10_qa_logs and stop release promotion.
echo No source customer data or live payments were modified by this script.
exit /b 1
