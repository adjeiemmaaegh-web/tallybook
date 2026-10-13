@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo TALLYBOOK V19 - WINDOWS FRONTEND BUILD IMPORT FIX
echo Local development preview. Do not use real client or payment data.
if not exist "START_TALLYBOOK_WINDOWS.cmd" (
  echo ERROR: Save this FIX file into the existing tallybook_fixed directory next to START_TALLYBOOK_WINDOWS.cmd.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js not detected. Open this using the Windows environment with Node.js 24.19.0 installed.
  pause
  exit /b 1
)
node -e "const fs=require('node:fs');const a=String.fromCharCode(39),b=String.fromCharCode(34);const fixes=[['client/src/components/CashReturnReviewDialog.tsx','@/features/sales/cashReturnReview'],['client/src/features/sales/cashReturnReview.test.ts','./cashReturnReview'],['client/src/pages/PurchasesPage.tsx','@/features/purchases/supplierPayables'],['client/src/features/purchases/supplierPayables.test.ts','@/features/purchases/supplierPayables'],['client/src/features/backup/backup.ts','@/features/purchases/supplierPayables'],['client/src/features/reports/financialIntelligence.ts','@/features/purchases/supplierPayables'],['client/src/db/TallybookDB.ts','@/features/purchases/supplierPayables']];const changes=[];for(const [file,base] of fixes){const old=fs.readFileSync(file,'utf8');const next=old.replaceAll(base+a,base+'.ts'+a).replaceAll(base+b,base+'.ts'+b);if(next===old&&!old.includes(base+'.ts'))throw Error('Expected import missing from '+file);changes.push([file,old,next])}let changed=0;for(const [file,old,next] of changes){if(old!==next){fs.writeFileSync(file,next,'utf8');changed++}}console.log('SUCCESS: Import paths checked in '+fixes.length+' files; '+changed+' file(s) changed.');"
if errorlevel 1 (
  echo ERROR: Fix could not be applied safely. Your business data has not been touched.
  pause
  exit /b 1
)
echo Dependency installation is NOT needed again. Starting the original Tallybook launcher...
call "%~dp0START_TALLYBOOK_WINDOWS.cmd"
