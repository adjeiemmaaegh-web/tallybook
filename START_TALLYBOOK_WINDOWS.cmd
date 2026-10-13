@echo off
setlocal
cd /d "%~dp0"
echo TALLYBOOK - LOCAL DEVELOPMENT PREVIEW
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Node.js is not installed or not on PATH.
  echo Install Node.js 24.19.0 from https://nodejs.org/en/download
  echo Reopen this window and double-click START_TALLYBOOK_WINDOWS.cmd again.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local-preview.ps1"
if errorlevel 1 (
  echo.
  echo Startup failed. Read the message above, then see docs\launch\WINDOWS_QUICKSTART.md
  pause
  exit /b 1
)
endlocal
