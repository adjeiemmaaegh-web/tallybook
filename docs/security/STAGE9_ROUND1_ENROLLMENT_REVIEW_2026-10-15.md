# Stage 9 Round 1 — Review-only owner-approved device enrollment

**Date:** 2026-10-15  
**Development branch:** `stage9/round1-enrollment-lifecycle-20261015`  
**Implementation baseline:** `cea840632e8b4f03ceabe7ae899d0d7c5bfe3da2`  
**Implemented and locally tested code commit:** `d43da289b6020219279a3c8be1048a05521cb8bd`  
**Release:** NO-GO — inactive server-only code; no production credentials, migrations or routes.

## Change

Introduced an enrollment lifecycle rather than creating store/device grants from unauthenticated browser parameters.

- `server/storeDeviceEnrollment.mjs`: verified owner creates a 10-minute, 256-bit, one-use invitation for a specific existing company member and active store; only that authenticated member may redeem it for an 8-hour grant. Grant revocation is owner-scoped. Issuance, consumption, grant writes and audit events take place in one serializable transaction.
- `server/storeDeviceEnrollmentPostgres.mjs`: private PostgreSQL adapter with exact-row compare-and-set updates, locking reads, and rollback on any failure.
- `server/storeDeviceEnrollmentCoordinator.mjs`: composes the existing `createSupabaseOwnershipSessionResolver` with the transaction adapter; verifies the session through Supabase Auth and server-owned `auth.sessions`. A **second, transaction-bound `auth.sessions FOR SHARE` check** rejects revoked/expired sessions during writes.
- `docs/security/STAGE9_ROUND1_ENROLLMENT_SCHEMA_REVIEW.sql`: additive *review-only* invite and audit table definition, tenant-scope foreign keys, restrictive RLS and role revocations.
- Three test modules under `server/tests/storeDeviceEnrollment*.test.mjs` cover positive, negative, replay, authorization, expiry, scope, revocation, SQL parameterization, conditional writes, rollback, and fail-closed composition.

## Trust requirements and warnings

- **Not active:** No HTTP route, private PostgreSQL connection, migration execution, or browser UI exists for these new methods. `main` and deployment remain unaffected.
- An invitation cannot create or transfer cloud ownership. The company and store must already exist, and owner/target membership is read from trusted PostgreSQL.
- The invitation is 256 random bits under the production default, returned once, stored only as SHA-256 digest, and limited to 10 minutes. The target must present the invitation **and** a separately authenticated account session. Replay fails because the unused invitation is consumed atomically.
- The resulting store/device grant is an expiring **bearer handle**, **not an unforgeable hardware identity**. Before commercial activation, add possession-of-device cryptographic keys, enrollment attestation policy, store-specific member assignments and proper grant renewal/recovery design. Never call this current grant hardware-bound.
- The canonical `business_members` model has no independent per-store membership or revoked-status column; it treats an existing row as active. The new invites have ON DELETE CASCADE relationships, so deleting a membership removes outstanding invites. Broader membership revocation and handling of already-created device grants remain to be integrated and tested.
- A server-only privileged PostgreSQL pool must perform each transaction. The schema must be compared to the actual versioned Supabase migration chain before attempting to apply in any isolated test project. **Do not run this SQL against production.**
- The new security functions are intentionally not wired to existing sales, inventory, money, sync, or financial endpoints.

## Actual local QA performed

Linux Node `v22.16.0`; tests executed using:

```bash
node --test server/tests/storeDeviceEnrollment.test.mjs \
  server/tests/storeDeviceEnrollmentPostgres.test.mjs \
  server/tests/storeDeviceEnrollmentCoordinator.test.mjs
```

**19/19 tests passed, 0 failed/skipped**. Tests use independent in-memory transactional doubles and a mocked private PostgreSQL pool. Existing `server/supabaseOwnershipSession.mjs` was mirrored locally with the **same exact Git blob SHA** as the source branch. Before documenting, all newly committed service/adapter/test files were checked for Git blob-hash equality against the locally tested sources.

**Not run:** real Supabase Auth, actual PostgreSQL RLS or SERIALIZABLE behavior under multi-process concurrency, Node 24/Windows, semantic repository TypeScript/Vitest, production build, React/Playwright, real two devices, auth-session revocation races in PostgreSQL, full financial and offline acceptance.

## Next work to finish Round 1

1. Add reviewed, migrated server schema + transactional tests against a disposable PostgreSQL instance.
2. Implement independent, recoverable **cryptographic device possession** and store-scoped membership; block bearer-handle theft and stale/revoked devices.
3. Finish authenticated account-to-existing-local-company binding, backup/restore proof, explicit owner confirmation and isolated cross-account IndexedDB access.
4. Connect enrollment and grant revocation to protected opt-in API endpoints with CSRF/origin/HTTPS/rate-limit safeguards, and propagate revocation to financial server write boundaries.
5. Complete authenticated store creation, staff invitations/removals/roles and negative/rollback tests. Keep AuthGate activation and all Stage 9 commerce/sync features disabled.
6. Resume remaining Rounds 2–8 only after required Round 1 implementation exists; owner will run final full PC acceptance when ready.

**Disposition:** meaningful Round 1 increment delivered, **Round 1 remains PARTIAL**, Tallybook Stage 9 commercial release **NO-GO / INCOMPLETE**.
