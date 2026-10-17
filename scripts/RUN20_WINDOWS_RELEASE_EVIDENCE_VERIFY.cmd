@echo off
setlocal EnableExtensions DisableDelayedExpansion
rem This is a READ-ONLY source-era worksheet integrity verifier.
rem DO NOT interpret a valid checksum or claimed PASS as launch authorization.
cd /d "%~dp0.."
if "%~1"=="" goto USAGE
if "%~2"=="" goto USAGE
where node >nul 2>&1
if errorlevel 1 (echo Node is not installed. Use this tool only in an approved QA environment. & exit /b 2)
node -e "if(process.versions.node!=='24.19.0'){console.error('Pinned Node 24.19.0 required');process.exit(2)}"
if errorlevel 1 exit /b 2
node scripts\run20-verify-release-worksheet.mjs --file "%~1" --sha "%~2"
if errorlevel 1 exit /b 2
echo Worksheet checksum verified, NOT the original evidence, hardware or authorization.
echo V19 remains NO-GO. NO deployment, provider payment or main merge authorized.
exit /b 0
:USAGE
echo Usage: scripts\RUN20_WINDOWS_RELEASE_EVIDENCE_VERIFY.cmd "C:\path\run20-worksheet.json" EXACT_40_CHAR_GIT_SHA
exit /b 2
