# Stage 8 V15 Build 22 — Local outbox acknowledgement reconciliation

## Implemented
- `client/src/features/sync/outboxAcknowledgements.ts`: strict server journal receipt shape and outcome checks, matching company/event/operation, and an IndexedDB transaction that records only journal metadata acknowledgement when consent and active device authorization still hold.
- A conflict receipt never marks an event acknowledged. A repeat successful receipt is idempotent. No sales, stock, payments or financial ledger updates are performed.
- This module is **not** wired to a browser HTTP client: the caller must verify HTTPS/TLS, human session, device authorization and `sync:stage` capability before passing a receipt; treating an arbitrary JSON object as a trusted receipt would be unsafe.
- Added eight Vitest regression cases (not executed due missing Vitest).

## Execution evidence
- `node --test server/tests/*.test.mjs`: **109 passed, 0 failed**.
- TypeScript parser on both new source files: **0 syntax errors**.
- TypeScript transpilation + isolated runtime assertions of the pure classifier: **8 passed**.
- Vitest: **unavailable**, regression file not run.
- Full TypeScript check / Vite build: **unverified** (repository dependencies unavailable).
- IndexedDB transaction / browser HTTP / HTTPS integration: **not executed**.

## Stage gate
**Stage 8 INCOMPLETE**. Client transport wiring, trusted receipt verification, actual offline-to-online financial-safe replication, conflict remediation, production identity persistence and full build/integration tests remain blockers. Do not begin Stage 9 or enable automatic financial synchronization.
