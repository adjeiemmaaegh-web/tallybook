# Stage 8 V15 — Build 8: Server membership and device authorization boundary

## Implemented
- Added `server/syncMembership.mjs` with an async, server-owned directory adapter contract for organization, authenticated actor membership, and device registration. Requires all three to be active and to match the signed capability's organization/device and trusted server actor.
- Denies missing session, incomplete/unconfigured adapter, inactive or cross-organization records, unauthorized role, device registered to another actor, and directory errors.
- Wired the sync gateway to the explicitly disabled directory and undefined trusted actor: all `/api/sync` requests remain denied, including otherwise signed inspect requests. This is intentional; there is no active session provider or durable directory in this project.
- Added type declarations and 12 regression tests.

## Evidence
- `node --test server/tests/*.test.mjs`: 19 passed, 0 failed (7 previous signed-capability tests + 12 membership tests).
- `node --check server/syncMembership.mjs`: passed.
- `npm run check`: unsuccessful; full TypeScript dependencies unavailable.
- `npm run build`: unsuccessful (`vite: not found`).
- ZIP integrity: verified when packaging.

## Not complete
- Authenticated user sessions and a server-owned persistent organization/member/device directory, including enrollment and revocation APIs.
- Reliable storage and authenticated idempotent event transfer, server acknowledgements, encrypted remote backup provider and audited restore.
- Real IndexedDB/browser migration testing, device/browser workflows, full Vitest suite, semantic TS validation and production build.
- This is a local authorization-contract implementation, NOT working remote cloud synchronization. Existing offline POS remains independently usable.
- Stages 5–7 known blockers remain in `DEFERRED_QA_MASTER.md`.

Status: STAGE 8 IN PROGRESS. Stage 9 not started.
