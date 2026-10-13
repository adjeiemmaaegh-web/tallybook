# Stage 8 Build 15 — Encrypted Backup Vault Foundation

Status: **DEVELOPMENT INCREMENT, STAGE 8 INCOMPLETE**.

## Scope

- Added server/syncBackupVault.mjs and its type declarations and seven Node tests.
- Opaque passphrase-encrypted backup package storage (not encryption itself). Caller supplies ciphertext created by existing client encryption flow.
- SHA-256 integrity, canonical base64, 8 MiB ciphertext limit, per-company read scope and strict backup ID validation.
- File creation is exclusive with restrictive permissions and fd sync. Untrusted symlinks are blocked during opens.
- No HTTP routes exposed for upload/download; trusted session, membership, device checks and secure transport still require integration.
- **No sale, payment, inventory or ledger writes. Offline POS remains independent.**

## Tests executed

- `node --test server/tests/*.test.mjs`: **71 passed, zero failed**.
- `node --check server/syncBackupVault.mjs` and test file: passed.
- `npm run build`: unable to execute without Vite dependency.
- `npm run check`: unable to execute with missing type definitions.
- ZIP validation: see packaging evidence.

## Outstanding development and security requirements

1. Authenticated TLS HTTP endpoints with transport limits, session checks, active organization membership and server-recognized device enrollment, and request rate limiting.
2. Actual encryption-format round trip with browser-created recovery packages, validated before restore; no plaintext extraction server-side.
3. Durable sync ingress and server acknowledgements, conflict remediation, and transaction-level safety rules.
4. Production datastore, multi-host concurrency, backup retention/quota, disaster recovery and tenant isolation testing.
5. Full Vitest/TS/Vite build, real IndexedDB and device integration and threat-model review.

Do not claim this vault is a deployed cloud backup service. Prior Stage 5–7 blockers remain open.
