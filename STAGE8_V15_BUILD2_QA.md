# Stage 8 Build 2 — local device registry and opt-in boundaries

Implemented: schema V20 `syncDevices`; registration requiring an existing company and opt-in consent; company-scoped listing; local revocation; active-device check when queuing sync metadata; tests for validation. Existing offline ledger and POS unchanged.

**Security limitation**: this registry is not remote identity, enrollment proof or server-enforced device authorization. Locally stored IDs are not cryptographic credentials. Revocation only affects local queueing; a future server must independently authenticate device credentials, enforce revocation, validate consent, and prevent cross-organization access.

**Deferred**: full Vitest, semantic TypeScript, production Vite build, real IndexedDB migration/transactions, authenticated backend, remote encryption, cross-device sync and loss/recovery testing. Stage 8 remains incomplete. Stage 9 not started.
