# Stage 8 V15 Build 9 — Read-only server identity-directory adapter

## Scope
- `server/syncDirectory.mjs`: immutable validated, server-owned organization/membership/device directory snapshot; duplicate and cross-organization records fail closed.
- Opt-in read-only JSON-file adapter for local server integration development, reloading snapshot per authorization to observe revocation.
- Reject unsafe file permissions, symlinks, oversized/malformed directories and unknown identities. No browser write endpoint or user-supplied identity mutations.
- `server/syncDirectory.d.mts`: TypeScript surface, and `server/tests/syncDirectory.test.mjs` regression tests.

## Important boundary
- **Not wired into live `/api/sync` handler:** no verified human identity session or issuer and no durable production identity database. `server/index.ts` continues to call deny-all `disabledSyncIdentityDirectory` with undefined actor ID, so uploads and remote reads remain disabled.
- File snapshot is a constrained development fixture, NOT a production persistent multi-tenant identity service. It is not an authentication mechanism; file admins must control provisioning and permissions. Atomic replacement is a deployment responsibility, while invalid partial reads fail closed.
- No sync acknowledgement, remote writes, remote backup upload, or financial ledger changes enabled.

## Commands executed
- `node --test server/tests/*.test.mjs`: **23 passed, 0 failed**, including 4 new directory tests.
- `node --check server/syncDirectory.mjs`: passed.
- `node --check server/tests/syncDirectory.test.mjs`: passed.
- `unzip -t` on resulting archive: passed.
- `npm test -- --run`: failed to start (`vitest: not found`, exit 127).
- `npm run check`: failed (missing Node and Vite type definitions, TS2688, exit 2).
- `npm run build`: failed to start (`vite: not found`, exit 127).
- Deployed/browser integration was not executed; none of these were counted as passes.

## Incomplete Stage 8 acceptance requirements
Production identity/account login and verified server session; persistent transactional directory and auditable enrollment/revocation; authenticated encrypted backup transport and restoration; durable idempotent replication and server acknowledgements; safe conflict remediation; offline/online device integration and production verification. All previous Stage 5–7 blockers remain tracked for final hardening. Stage 9 is untouched.

**Stage status: INCOMPLETE.**
