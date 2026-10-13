# Stage 8 V15 Build 4 — Offline-only reconciliation foundation

## Code implemented
- `client/src/features/sync/reconciliation.ts`: validated remote event claims, deterministic comparison with local event metadata, conflict journaling, and company-scoped conflict listing. No remote mutation or transport.
- `client/src/db/TallybookDB.ts`: additive schema v21 sync-conflict journal.
- `client/src/features/sync/reconciliation.test.ts`: six Vitest regression cases for exact replay, payload mismatch, cross-company mismatch, ID collision, unknown events and input validation.

## Verification
- Six direct transpiled runtime cases passed (node VM harness).
- Three modified TypeScript sources transpiled without syntax diagnostics.
- `npm test` blocked: vitest not found.
- `npm run build` blocked: vite not found.
- Real IndexedDB transaction/migration, end-to-end browser and remote authorization tests not executed.

## Critical security limitation
Claims are UNTRUSTED metadata. This code does not authenticate devices, authorize remote actors, produce server acknowledgements, upload customer data, or resolve conflicts automatically. A remote adapter must verify identity/permissions and durable server acknowledgments separately. Never treat matching metadata as proof of delivery.

## Stage 8 remaining
Authenticated organization/device identity and server enforcement; real encrypted remote backup storage; authenticated upload/download; durable remote acknowledgement and retry; conflict UI and explicit resolution policies; sync dashboard; integration/security testing. Offline-first functionality remains independent.
