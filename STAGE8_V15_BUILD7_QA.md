# Stage 8 V15 — Build 7: fail-closed synchronization gateway

## Added
- `server/syncAuth.mjs`: verifies short-lived, HMAC-authenticated, read-scope-only capability envelopes and organization/device matching. Server-only key.
- `server/index.ts`: `/api/sync` gateway disabled by default (503 without configuration, 403 on invalid authentication, 501 for correctly authenticated but unavailable transport). **No uploads, downloads, outbox acknowledgements, server device registration, or remote storage are enabled.**
- `server/tests/syncAuth.test.mjs`: seven native Node test cases.

## Security boundaries
- `TALLYBOOK_SYNC_VERIFY_SECRET` is an optional server-only verification key; must not be put in Vite public env variables. This is a temporary capability-verification contract, NOT an organization identity provider and NOT authorization for writes.
- The endpoint does not issue capabilities, and no production credential provisioning is implemented. Authenticated membership, durable device registry/revocation, remote transactional storage, idempotency, and replay prevention remain required.
- Local device registrations and consent do not authorize server calls. Offline selling remains unaffected.

## Executed
- `node --test server/tests/syncAuth.test.mjs`: **7 passed, 0 failed**.
- ZIP integrity: checked on packaged archive.

## Deferred / unfinished
- Full Vitest suite, semantic TypeScript check, Vite/esbuild production build, browser integration and cross-device tests.
- Deployable authenticated identity provider, remote storage, sync acknowledgements, conflict resolution, cloud recovery transport.
- Stage 8 remains INCOMPLETE. Stage 9 not started.
