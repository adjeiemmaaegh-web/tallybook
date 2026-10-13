# Tallybook V19 — local launcher continuation / evidence, 2026-10-12

## Purpose

Owner requested rapid application startup. This increment **does not change business accounting, security policies, company data, refund settings, or money movements**. It packages a source-based one-click Windows launcher and a loopback-only static preview server for the existing Tallybook browser app. This is a **local development preview** and no production or staging launch is authorized.

## Baseline

Input: `TALLYBOOK_V19_FIN002_WALLET_CHRONOLOGY_CONTINUATION_2026-10-12_SOURCE.zip`.
Original SHA-256: `3d40b1b904595ba77f7aebf3cabcd9f6ef698bf11e82cd51aa27489d741edecc`.
Original members: 1,025. Original source content remains unchanged; only launcher, QA, and documentation files are added.

## Additions

- `START_TALLYBOOK_WINDOWS.cmd` (double-click launcher), `tools/start-local-preview.ps1` (pinned dependency installation, Vite frontend build, local start).
- `CHECK_TALLYBOOK_WINDOWS.cmd`, `tools/check-local-preview.ps1` (TypeScript, Vitest, full build, Chromium browser and offline PWA test commands).
- `tools/local-preview-server.mjs` (no-dependency static server bound strictly to 127.0.0.1, read-only, 503 on `/api/`, path/symlink safeguards, health check, no server API access or live payments).
- `tools/check-static-assets.mjs` (compiled JS reference and asset existence preflight; fails on source HTML).
- Six native regression tests across `qa/local-preview-server.test.mjs` and `qa/local-static-assets.test.mjs`.
- `docs/launch/WINDOWS_QUICKSTART.md`, this evidence report, and executed QA logs in `artifacts/ready-today`.

## QA actually executed in this Linux environment

- SHA-256 of source input confirmed exact baseline.
- Native Node 22.16 test command: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`: **463/463 passed**, zero failed/skipped. Previous baseline 457/457; six new launcher/security tests.
- Separate `node --test server/tests/paymentGateway.test.mjs`: **4/4 passed**, simulated only.
- `node --check` on all four new JavaScript test/implementation modules: **passed**.
- Local preview four tests verify correct root/assets/SPA responses, refused `/api/` and POST, hidden/missing/symlinked files rejected, HEAD and security headers.
- New static bundle verifier two tests verify compiled asset consistency and fail-closed behavior on raw source HTML/missing generated JS.
- No external hosting/payment/deployment and no real business data used.

## Verification NOT executed / limitations

- **Unable to install dependencies and create a Vite build in this environment**: `npm ping --registry=https://registry.npmjs.org --fetch-retries=0 --fetch-timeout=6000` failed with `EAI_AGAIN` DNS resolution error. The ZIP contains no existing node_modules or built dist.
- **Windows launchers were authored but not executed on Windows** (PowerShell not available here).
- Client semantic TypeScript, Vitest, production build, real browser/IndexedDB, PWA offline tests and hardware checks were **not executed** here.
- No static site, standalone executable or installer is prebuilt. Node 24.19.0 and one-time dependency download are required on the user's Windows system.
- User must not use the preview with real client or financial data until applicable QA and owner authorization.
- `CHECK_TALLYBOOK_WINDOWS.cmd` is a proposed verification workflow. It has not yet produced any client/browser QA evidence.

## Tracking and release verdict

Original 82 acceptance units and 47 tracked blocker statuses are **unchanged** (3 implemented-tested, 35 implemented-unverified, 6 missing, 3 blocked). The broad FIN-002 work is still missing and remaining release gates are open. This launcher only reduces startup friction; **NO-GO / INCOMPLETE** continues to apply to any commercial release.
