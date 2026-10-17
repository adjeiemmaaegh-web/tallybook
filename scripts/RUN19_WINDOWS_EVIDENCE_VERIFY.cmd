@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem Run 19 offline evidence HASH verifier — not a test runner or a release signer.
rem Usage: scripts\RUN19_WINDOWS_EVIDENCE_VERIFY.cmd evidence.json EXACT_GIT_SHA
rem Read-only: no npm/pnpm invocation, browser automation, DB writes,
rem remote provider connection, staging, finance posting or deployment.
cd /d "%~dp0.."
if not exist "scripts\run19-verify-evidence.mjs" (
  echo ERROR: Run 19 verification source missing.
  exit /b 2
)
if "%~1"=="" goto USAGE
if "%~2"=="" goto USAGE
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node 24.19.0 must already be available for the evidence reader.
  exit /b 2
)
node -e "if(process.versions.node!=='24.19.0'){console.error('Pinned Node 24.19.0 required');process.exit(2)}"
if errorlevel 1 exit /b 2
node scripts\run19-verify-evidence.mjs --file "%~1" --sha "%~2"
if errorlevel 1 (
 echo Run 19 archive integrity could not be established. No release approval.
 exit /b 2
)
echo Evidence HASH and shape checked only. Inspect source screenshots, device logs, finance assertions and human witnesses independently.
echo Run 19 UAT / commercial release remains NO-GO, regardless of archive hash.
exit /b 0
:USAGE
echo Usage: scripts\RUN19_WINDOWS_EVIDENCE_VERIFY.cmd "C:\path\evidence.json" EXACT_40_CHAR_SOURCE_SHA
echo This command is for later owner use only. It does not execute hardware tests.
exit /b 2
