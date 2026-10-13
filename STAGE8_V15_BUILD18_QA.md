# Stage 8 V15 — Build 18: Restricted Encrypted Backup Upload

**Stage status: INCOMPLETE.** Stage 9 not started.

## Implementation

- Added separate signed `backup:write` capability; `sync:inspect` remains read-only.
- Owner/admin authorization requires a verified short-lived human session, active membership, and an active server-registered device; request org/device and backup envelope must match.
- Validates opaque ciphertext base64 and SHA-256 digest before invoking immutable vault storage. A hash is an integrity check, **not proof that bytes are encrypted**; the client must encrypt before upload.
- `POST /api/sync/backups` disabled unless `TALLYBOOK_SYNC_BACKUP_UPLOAD_ENABLED=true` plus session, directory, and vault locations are configured. Requires direct TLS on `req.socket.encrypted`; proxy TLS termination alone is deliberately *not* accepted.
- No financial data upload, sync event acknowledgement, or client-side auto-backup enabled.

## Executed checks

- `node --test server/tests/*.test.mjs`: **92 passed, 0 failed**, including 8 new upload tests.
- `node --check` on the four changed/new JavaScript modules/test files: passed.
- `npm run build`: blocked, `vite: not found`.
- `npm run check`: blocked, missing `node` and `vite/client` type definitions.
- ZIP integrity tested with `unzip -t` after packaging.

## Remaining issues / requirements

- HTTP server uses plain HTTP by default; direct TLS configuration is not implemented. Route therefore fails closed in the normal deployment. Explicit reverse-proxy trust design and transport-level tests are still required.
- Production identity provisioning, login and enrollment HTTP workflows, backup upload/download end-to-end browser tests, client encryption and recovery checks, multi-host storage/atomicity, event delivery/acknowledgement and conflict remediation remain incomplete.
- The SHA-256 checksum verifies exact bytes only, **not** confidentiality; independent encryption verification and threat assessment required.
- Full Vitest suite, semantic TS checks, production build, real device tests and database migrations blocked or unverified.
- Prior Stage 5–7 blockers remain recorded for final hardening.
