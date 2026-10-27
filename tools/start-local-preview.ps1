$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host 'Tallybook: local-only, unverified development preview.' -ForegroundColor Yellow
Write-Host 'Do not enter real client/payment data until full QA is complete.' -ForegroundColor Yellow
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js missing. Install Node 24.19.0 and reopen this window.' }
$nodeVersion = (node --version).Trim()
Write-Host "Node version: $nodeVersion (repository pins 24.19.0)"
if ($nodeVersion -notmatch '^v(?:24\.|22\.)') { throw 'Unsupported Node version. Install Node.js 24.19.0.' }
if ($nodeVersion -ne 'v24.19.0') { Write-Warning 'Use Node.js 24.19.0 for reproducible validation.' }
$existing = Get-Command pnpm -ErrorAction SilentlyContinue
$corepack = Get-Command corepack -ErrorAction SilentlyContinue
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
function Run-Pnpm {
  param([string[]]$RunArgs)
  if ($existing) { & $existing.Source @RunArgs }
  elseif ($corepack) { & $corepack.Source pnpm @RunArgs }
  elseif ($npm) { & $npm.Source exec --yes '--package=pnpm@10.34.0' -- pnpm @RunArgs }
  else { throw 'Neither pnpm, Corepack nor npm is available.' }
  if ($LASTEXITCODE -ne 0) { throw "pnpm $($RunArgs -join ' ') failed with exit code $LASTEXITCODE. Check internet access and the error above." }
}
if (-not (Test-Path 'node_modules/.modules.yaml')) {
  Write-Host 'First run: installing EXACT locked dependencies. Internet required.'
  Run-Pnpm -RunArgs @('install', '--frozen-lockfile')
} else { Write-Host 'Existing node_modules detected; using installed dependencies.' }
Write-Host 'Building Tallybook browser application...'
$localVite = Join-Path $root 'node_modules/.bin/vite.cmd'
if (Test-Path $localVite) {
  & $localVite build
  if ($LASTEXITCODE -ne 0) { throw "Local Vite build failed with exit code $LASTEXITCODE." }
} else {
  Run-Pnpm -RunArgs @('exec', 'vite', 'build')
}
if (-not (Test-Path 'dist/public/index.html')) { throw 'Build did not produce dist/public/index.html.' }
& node tools/check-static-assets.mjs
if ($LASTEXITCODE -ne 0) { throw 'Static build asset verification failed.' }
Write-Host 'Build succeeded. Starting on loopback only; no cloud/server/payment API.' -ForegroundColor Green
& node tools/local-preview-server.mjs
if ($LASTEXITCODE -ne 0) { throw 'Local preview server stopped with an error.' }
