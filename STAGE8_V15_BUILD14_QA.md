# Stage 8 V15 — Build 14: Server-Owned Device Enrollment

Status: DEVELOPMENT FOUNDATION ONLY. Stage 8 remains INCOMPLETE.

## Scope
- Adds `server/syncEnrollment.mjs` / `.d.mts` with a trusted-server-only enrollment registry.
- Organization owners/admins may mint random 256-bit, 10-minute, one-use invitations for **existing active members**. Only invitation SHA-256 hashes are persisted.
- Enrollment rechecks active organization/membership, actor and organization scope, token expiration, and duplicate device IDs at redemption.
- Revocation requires active owner/admin membership and writes revoked status.
- All mutations use one per-process serialization queue, a private (0600) temporary file, fsync, atomic rename and directory fsync. The registry rejects unreadable, permissive, oversized and malformed files.
- Live HTTP routes and business-data replication REMAIN DISABLED. Caller identities must come from authenticated human sessions in a future trusted transport; passing `actorId` directly from a browser would be unsafe.

## Limitations / blockers
- Single-process file store, not a multi-host transactional identity database. Cross-process write serialization, crash-consistent network filesystem behavior, TOCTOU hardening of directory path components, backups, and operational key management are not certified.
- No trusted public enrollment endpoint or TLS/rate limiting. No cryptographic binding to a physical device's private key; device identifier is still server-enrolled metadata.
- The older read-only identity directory is separate from this mutable store; production must use one authoritative transactional store.
- Full Vitest, semantic TypeScript, Vite production build, browser, device, and cross-host integration still required. No cloud upload enabled.

## Security boundaries
- Offline POS and financial records not modified by this build.
- No bypass of server session verification introduced.
- Stage 9 not started.
