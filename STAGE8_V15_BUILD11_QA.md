# Stage 8 V15 — Build 11 QA and development status

Status: **INCOMPLETE** (Stage 8; not a certified release). Stage 9 not started.

## Scope
- Added `server/syncSessionStore.mjs` and `.d.mts`: operator-provisioned read-only session snapshots with strict record validation, duplicate rejection, file-size limits, regular-file and unsafe-permission checks, `O_NOFOLLOW` file opening, and fresh reads for revocation.
- Added `server/tests/syncSessionStore.test.mjs` with seven Node tests covering exact user/session mapping, invalid data, immediate revocation, symlink and permission rejection, and fail-closed behavior.
- `server/index.ts` optionally reads `TALLYBOOK_SYNC_SESSION_FILE`; with no file, the session store is disabled. This **does not** wire up identity directory, session issuance, remote writes or cloud transport. All cloud data transfers remain disabled.

## Executed checks
- `node --test server/tests/*.test.mjs` — **40 passed / 0 failed**.
- `node --check server/syncSessionStore.mjs` — passed.
- `node --check server/tests/syncSessionStore.test.mjs` — passed.
- Archive ZIP integrity verified after packaging.

## Blockers / known limitations
- No trusted login provider issues signed sessions; the file adapter assumes trusted out-of-band provisioning and is **not** production identity storage.
- The identity directory remains intentionally disabled in the live gateway; even valid session records cannot enable cloud traffic.
- No encrypted remote-backup transport, durable remote event journal, server acknowledgements, remote conflict remediation, or end-to-end synchronization.
- Full Vitest suite, semantic TypeScript verification, Vite production build, real browser/IndexedDB and cross-device security QA require installed dependencies and environment support; not asserted to pass.
- Stage 5–7 previously recorded coding/security and verification blockers remain open.
