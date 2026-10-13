# Stage 8 V15 Build 16 — Authenticated read-only transport preflight

## Scope
- Added `server/syncTransport.mjs` with verified signed capability, separate signed human session, server session revocation check, active organization membership and actor-bound device check.
- Added `GET /api/sync/status`, enabled only with explicit session/directory/journal file configuration and both token signing secrets. Queries a company-scoped journal count, returns no event payloads.
- No data uploads, write scopes, backup HTTP endpoints, or financial replication implemented. Existing `/api/sync` fail-closed gateway retained.

## Evidence
- `node --test server/tests/*.test.mjs`: 78 passed, 0 failed (7 new transport tests).
- `node --check server/syncTransport.mjs`: passed.
- `npm run build`: blocked (`vite: not found`).
- `npm run check`: blocked (`@types/node` and `vite/client` missing).
- ZIP integrity: verified during packaging.

## Remaining blockers
- Real authenticated login/enrollment HTTP handling with TLS, CSRF and rate limiting; deployable identity and transactional storage.
- Authorized ciphertext upload/download routes, backup retention and end-to-end recovery verification.
- Actual encrypted offline-to-online synchronization, durable acknowledgments, replay handling and financial conflict rules.
- Production-grade server hosting/multi-host concurrency, adversarial tests, real browser IndexedDB, full test suite and production build.
- Existing prior-stage code and integration blockers remain in prior stage QA docs.

Stage 8 is INCOMPLETE; Stage 9 not started.
