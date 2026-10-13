# Stage 8 V15 Build 13 — Trusted Login Issuance Foundation

## Scope
Added `server/syncLogin.mjs`, `.d.mts`, and `server/tests/syncLogin.test.mjs`. Server-provisioned scrypt password hashes in a private, read-only operator directory are checked using timing-safe comparison. Issuance creates random, server-owned session IDs in a durable, mode-0600 file and produces short-lived (5 minute) HMAC session tokens compatible with `syncSession.mjs`. Each token is verified separately against current revocation state by the existing session authorization service. Concurrent issuance in one Node process is serialized.

## Security limitations
This is a development integration adapter, not a production credential platform: no public login endpoint, MFA, rate limiting, account recovery, TLS termination, durable multi-process transactions, cross-host coordination, or external identity provider. Tokens are not issued to browsers by the running gateway, and the gateway continues denying all sync traffic. Filesystem files and environment secrets must be operator-controlled. The module currently assumes a single server process; do not share writable files between instances. Not safe to claim a production-ready authentication system.

## Verification
- `node --test server/tests/*.test.mjs`: **56/56 passed**, including 8 new login tests.
- `node --check server/syncLogin.mjs`: passed.
- `node --check server/tests/syncLogin.test.mjs`: passed.
- `npm run build`: unavailable due to missing Vite (see actual command output).
- `npm run check`: unavailable due to missing type definitions (see actual command output).
- ZIP integrity verified via `unzip -t` after packaging.

## Stage status
Stage 8 **INCOMPLETE**. Remaining: production organization auth, secure device enrollment, TLS/rate-limited login integration, durable cross-host server store, encrypted backup transport, real sync acknowledgements/conflict recovery, real browser/device/DB integration, full Vitest/types/build and security QA. Stage 9 untouched.
