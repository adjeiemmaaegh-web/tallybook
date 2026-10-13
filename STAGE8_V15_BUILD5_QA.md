# Stage 8 V15 Build 5 — Local Sync Status (2026-10-09)

## Scope and acceptance
- Read-only `/sync-status` screen for the active business.
- Snapshot of consent, queued/locally acknowledged events, active/revoked local devices, unresolved/reviewed conflicts.
- One consistent IndexedDB read transaction for all diagnostics; no network calls or writes.
- Reject malformed or cross-company records rather than displaying deceptively clean metrics.
- Explain that cloud organization identity, server-side device authorization, transport, and authenticated delivery acknowledgements are NOT implemented.

## Files changed
- `client/src/features/sync/syncStatus.ts` (new)
- `client/src/features/sync/syncStatus.test.ts` (new)
- `client/src/pages/SyncStatusPage.tsx` (new)
- `client/src/App.tsx` (route)
- `client/src/components/AppShell.tsx` (navigation)

## Checks performed
- TypeScript transpile/syntax diagnostics on five files: PASS.
- Two isolated service smoke checks (summary & company isolation): PASS; these checks used reduced dependency mocks and are not a substitute for running Vitest.
- `npm test -- --run`: BLOCKED (`vitest: not found`).
- `npm run build`: BLOCKED (`vite: not found`).
- ZIP integrity checked during packaging.

## Stage 8 outstanding work
- Authenticated organization accounts and authoritative remote device registration/revocation.
- Encrypted remote storage and consent-gated transport, recovery UI, key recovery and retention policy.
- Durable server-side acknowledgments/replay protection, operation delivery, and conflict resolution for real ledger changes.
- Offline-to-online integration tests on real browser databases and two devices.
- Semantic TypeScript, full Vitest, production Vite build, security & privacy review.
- Historical source inconsistency: `DATABASE_SCHEMA_VERSION` constant currently reports 20 while Dexie migrations extend to 21. Resolve and test migration metadata before claiming database upgrade validation.

Stage 8 remains IN PROGRESS. Stage 9 not started.
