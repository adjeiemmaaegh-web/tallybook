# Tallybook V8 Stage 1 — Build 9 release hardening

## Verified code change
- Prevent overwriting a corrupt pending checkout journal. Previously `loadPendingCheckout()` returned null on malformed JSON/schema and `savePendingCheckout()` interpreted this as no pending transaction. The updated save path checks raw storage first and refuses to start another checkout if any journal exists, preserving evidence and the original idempotency key.
- Storage access exceptions now fail closed with a recovery-specific error instead of treating storage as clear.
- Added regression assertions for damaged journals and inaccessible storage.

## Validation and release blockers
- Two modified TypeScript files passed isolated transpilation/syntax checking using globally available TypeScript.
- Full test execution, type checking and production build unavailable: project dependencies missing; package manager download failed with DNS error `EAI_AGAIN registry.npmjs.org`.
- Live browser IndexedDB, camera, offline cache and thermal printer testing remains outstanding.

## Required before release
Run `corepack pnpm install --frozen-lockfile`, `pnpm test`, `pnpm check`, `pnpm build` in a network-enabled Node environment. Test interrupted checkout with a damaged journal; verify merchant can resolve it manually without any second write. Verify partial payments, receipt reconciliation, offline refresh, and mobile hardware behavior.
