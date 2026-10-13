# Stage 8 V15 Build 20 — Direct HTTPS transport

Status: development increment, Stage 8 INCOMPLETE.

## Changes
- `server/syncHttps.mjs`: explicit HTTP/HTTPS listener selection. Production requires HTTPS. Access and backup write configuration fail closed on HTTP; TLS cert/key must be absolute-path regular files; reject symlinks and group/world writable files; verify cert/key public keys match and certificate validity window; enforce TLS 1.2+.
- `server/index.ts`: starts HTTPS directly when configured, defaults to HTTPS in production, logs actual scheme. Existing auth and read/write capability separation retained; financial sync still disabled.
- `server/syncHttps.d.mts`: TypeScript declaration.
- `server/tests/syncHttps.test.mjs`: HTTP failure modes, certificate validation, actual HTTPS request, unsafe key permission checks.

## Required deployment configuration
- `TALLYBOOK_SERVER_TRANSPORT=https`
- `TALLYBOOK_TLS_CERT_FILE=/absolute/path/certificate.pem`
- `TALLYBOOK_TLS_KEY_FILE=/absolute/path/private-key.pem`
- Provide real trusted certificates; self-signed certs are for isolated tests only. Ordinary HTTP development remains possible with all sensitive write/access endpoints disabled. Production fails at startup if HTTPS is missing/misconfigured.

## Executed checks
- `node --test server/tests/*.test.mjs`: 100 passed, 0 failed.
- `node --check server/syncHttps.mjs`: passed.
- Actual HTTPS loopback request using a generated self-signed test certificate: passed.
- `npm run build`: BLOCKED (`vite: not found`).
- `npm run check`: BLOCKED (missing `node` and `vite/client` type definitions).
- ZIP integrity: passed.

## Remaining stage blockers
Real browser/deployment TLS and reverse-proxy analysis, secure session persistence and rate limiting at scale, authenticated event delivery/acknowledgements, offline-to-online replication, conflict remediation, and complete integration/security/semantic-type/build tests. Previous stage blockers remain tracked independently.
