# Stage 8 V15 Build 19 — Protected Access Route Foundation

## Scope and status
Stage 8 INCOMPLETE. Protected server-side login, invitation creation, enrollment and revocation endpoints added, all opt-in and direct-TLS only. No financial replication, remote event acknowledgement or background syncing enabled.

## Changes
- `server/syncAccessRoutes.mjs` — isolated access actions; signed five-minute sessions through existing trusted login issuer; independent session validation on invitation, enrollment and revocation; bounded in-memory request limiter (single process only).
- `server/syncAccessRoutes.d.mts` — TypeScript contract.
- `server/index.ts` — four explicitly enabled POST routes (`/api/sync/access/login`, `invite`, `enroll`, `revoke`), small JSON limits, no-store cache policy and direct TLS check. Requires `TALLYBOOK_SYNC_ACCESS_ENABLED=true`, `TALLYBOOK_SYNC_LOGIN_DIRECTORY_FILE`, `TALLYBOOK_SYNC_SESSION_FILE`, `TALLYBOOK_SYNC_SESSION_SECRET`, and `TALLYBOOK_SYNC_ENROLLMENT_FILE`.
- `server/tests/syncAccessRoutes.test.mjs` — login, rate limiting, direct TLS check, permissions, one-time enrollment, revocation and absent session regression cases.

## Executed verification
- `node --test server/tests/*.test.mjs`: 97 passed, 0 failed.
- `node --check server/syncAccessRoutes.mjs`: passed.
- `npm run build`: blocked, `vite: not found`.
- `npm run check`: blocked, missing Node type definitions.
- Archive ZIP integrity: validated on packaging.

## Remaining blockers and limitations
- `createServer(app)` is HTTP: the new access endpoints cannot be used under ordinary server startup. Direct TLS must be explicitly implemented and deployed, or authenticated trusted proxy deployment rigorously audited before enabling. Do not bypass the TLS check via untrusted proxy headers.
- In-memory rate limiting is per process, not distributed, and not a substitute for production account-level protection, observability and quotas. Login/password identifiers and IP logging policy require privacy review.
- File-based issuer and enrollment registry use process-local locks; production requires atomic cross-process database transactions and security hardening. The login file and enrollment file are currently separate persisted identities and must be provisioned consistently.
- No complete HTTP integration test, browser flow, production build, real TLS testing, IndexedDB, backup restoration, cloud delivery/acknowledgement or full security review completed.
- Previous Stage 5/6/7 blockers remain in carry-forward QA records. Stage 9 has not started.
