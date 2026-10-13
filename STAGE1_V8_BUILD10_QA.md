# Tallybook V8 Stage 1 — Build 10 QA

## Changes
- Introduced explicit pending-checkout journal status: empty, pending, damaged, unavailable.
- Sales screen now visibly blocks checkout when recovery data is corrupted or browser storage cannot be accessed. The original journal is preserved for manual reconciliation.
- Added focused regression assertions for all journal statuses.
- No financial service, schema or sale-writing logic was modified.

## Verification
- Three changed TypeScript/TSX files parsed successfully using TypeScript's transpileModule.
- npm offline install failed with ENOTCACHED (@hookform/resolvers missing). Full typecheck, Vitest suite, build and browser E2E were **not run**.
- Physical camera/printer and offline device testing not executed.

## Release blockers
- Install locked dependencies in network-enabled environment, use compatible Node version from project engines and run npm/pnpm check, test, build.
- Verify checkout recovery after reload, damaged journal state, company switching and permission denial in a real browser.
- Perform mobile barcode and printer hardware tests.

Build 10 is NOT production certified.
