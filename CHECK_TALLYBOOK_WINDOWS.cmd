@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\check-local-preview.ps1"
if errorlevel 1 (
  echo.
  echo Verification did not pass. This is NOT production-ready.
  pause
  exit /b 1
)
echo Verification steps finished. Review the browser test report before relying on results.
pause
endlocal
