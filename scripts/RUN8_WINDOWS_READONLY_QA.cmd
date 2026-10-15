@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Tallybook V19 Run 8 - LOCAL READ-ONLY QA harness.
rem Safe only in a disposable development checkout using sample data.
rem Does not install packages, launch browser profiles, delete files,
rem connect to Supabase, reset IndexedDB, deploy or mark release PASS.
cd /d "%~dp0.."
if not exist package.json (
  echo ERROR: Run this CMD from the checked-out repository scripts folder.
  exit /b 2
)
where node >nul 2>&1
if errorlevel 1 (echo ERROR: Node.js is required. & exit /b 2)
where pnpm >nul 2>&1
if errorlevel 1 (echo ERROR: pnpm must already be installed. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){process.stderr.write('Required pinned Node 24.19.0, found '+process.versions.node+'\n');process.exit(2)}"
if errorlevel 1 exit /b 2
if not exist node_modules (
  echo ERROR: This checkout has no dependencies. No network installation performed.
  exit /b 2
)
set "LOGDIR=%CD%\run8_qa_logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
echo Run8 local QA on a disposable test checkout.
node -v > "%LOGDIR%\node-version.txt" 2>&1
call pnpm --version > "%LOGDIR%\pnpm-version.txt" 2>&1
echo [1/4] Native Run8 source contracts...
node --test ^
 client/src/features/backup/tests/run8BackupCompatibility.test.mjs ^
 client/src/features/backup/tests/run8EncryptedEnvelope.test.mjs ^
 client/src/features/backup/tests/run8BackupFileReceipt.test.mjs ^
 client/src/features/backup/tests/run8JSONPreflight.test.mjs ^
 client/src/features/backup/tests/run8VerifiedReceipt.test.mjs ^
 server/tests/run8BackupIntegrationAudit.test.mjs > "%LOGDIR%\run8-native.txt" 2>&1
if errorlevel 1 goto FAIL
echo [2/4] IndexedDB and WebCrypto regressions...
call pnpm exec vitest run ^
 client/src/features/backup/backupCrypto.test.ts ^
 client/src/features/backup/run8CryptoPortability.test.ts ^
 client/src/features/backup/run8MigrationRestore.test.ts ^
 client/src/features/backup/run8VerifiedMetadata.test.ts ^
 client/src/features/backup/backup.test.ts ^
 client/src/features/backup/restoreRecovery.test.ts ^
 client/src/features/backup/run7Consistency.test.ts ^
 client/src/features/backup/run7PostingBarrier.test.ts ^
 client/src/features/backup/run7CrashStages.test.ts > "%LOGDIR%\run8-vitest.txt" 2>&1
if errorlevel 1 goto FAIL
echo [3/4] Semantic TypeScript checks...
call pnpm check > "%LOGDIR%\run8-types.txt" 2>&1
if errorlevel 1 goto FAIL
echo [4/4] Local build (no deployment)...
call pnpm build > "%LOGDIR%\run8-build.txt" 2>&1
if errorlevel 1 goto FAIL
echo Local checks executed without immediate failure; NOT a release PASS.
echo Manual two-tab, Windows, browser and power-loss drills are still required.
echo Logs: "%LOGDIR%"
exit /b 0
:FAIL
echo QA FAILURE. Review logs in "%LOGDIR%".
echo No release acceptance, no deployment and no production data mutation.
exit /b 1
