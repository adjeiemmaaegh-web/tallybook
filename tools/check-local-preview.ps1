$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js missing. Install Node 24.19.0.' }
$existing = Get-Command pnpm -ErrorAction SilentlyContinue
$corepack = Get-Command corepack -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
function Run-Pnpm {
 param([string[]]$RunArgs)
 if ($existing) { & $existing.Source @RunArgs }
 elseif ($corepack) { & $corepack.Source pnpm @RunArgs }
 elseif ($npm) { & $npm.Source exec --yes '--package=pnpm@10.34.0' -- pnpm @RunArgs }
 else { throw 'Neither pnpm, Corepack nor npm found.' }
 if ($LASTEXITCODE -ne 0) { throw "Failed: pnpm $($RunArgs -join ' ')" }
}
if (-not (Test-Path 'node_modules/.modules.yaml')) { Run-Pnpm -RunArgs @('install', '--frozen-lockfile') }
Write-Host '1/5: TypeScript semantic checks'
Run-Pnpm -RunArgs @('check')
Write-Host '2/5: Client unit and integration tests'
Run-Pnpm -RunArgs @('test', '--maxWorkers=2')
Write-Host '3/5: Full production build'
Run-Pnpm -RunArgs @('build')
Write-Host '4/5: Install Chromium browser for Playwright (network required on first run)'
Run-Pnpm -RunArgs @('exec', 'playwright', 'install', 'chromium')
Write-Host '5/5: Online/browser and offline PWA validation'
Run-Pnpm -RunArgs @('exec', 'playwright', 'test')
Run-Pnpm -RunArgs @('exec', 'playwright', 'test', '--config', 'playwright.offline.config.mjs')
Write-Host 'Client verification commands passed. This does not certify payments, hardware or production readiness.' -ForegroundColor Green
