# Stage 8 V15 Build 17 — authenticated encrypted backup retrieval

## Scope
- Added `server/syncBackupTransport.mjs` and declaration, implementing read-only ciphertext retrieval behind signed inspect capability, independently verified human session, server-owned organization membership, active device validation, and company-scoped vault access.
- Added `GET /api/sync/backups/:backupId` to the Express gateway, disabled unless session file, organization directory and encrypted backup vault are configured.
- Hardened ID validation and response scope verification; no decryption, restore, financial record mutation, or backup upload.
- Added six Node tests for authorized retrieval, malformed identifiers, cross-company denial, revoked sessions, absent vault and cross-company vault response.

## Actual evidence
- `node --test server/tests/*.test.mjs`: 84 passed, 0 failed.
- `node --check server/syncBackupTransport.mjs` and test file: passed.
- `npm run build`: exit 127 (Vite unavailable).
- `npm run check`: exit 2 (missing TypeScript type definitions/dependencies).
- ZIP checked with `unzip -t` after creation.

## Limitations / Stage 8 blockers
- Endpoint read-only only; no upload endpoint, no cloud backup lifecycle UI, and no end-to-end browser/recovery test.
- Requires external TLS deployment and server-owned identity/session/vault configuration; these are not automatically provisioned.
- Current `sync:inspect` capability is deliberately NOT an upload permission. Write capabilities, rate limiting, durable atomic acknowledgements, client/server replication, conflict remediation, cross-device QA and full production build remain missing.
- Existing Stage 5–7 blockers remain unresolved. Stage 8 INCOMPLETE; Stage 9 not started.
