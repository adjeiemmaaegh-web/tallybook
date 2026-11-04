# Mission GO Package 1 — incomplete engineering checkpoint

Continuation: [2026-10-31 scoped key-vault implementation](PACKAGE_1_KEY_VAULT_2026-10-31.md). That increment adds real key wrapping and lock integration; it does not complete protected ledger storage or offline authorization. This document preserves the earlier checkpoint evidence.

This supersedes earlier optional-auth rollout instructions. Baseline: `ea165a5ddfbcf6dcda6af0684acb3c5c3f271516`, verified at local HEAD and fetched GitHub main/development. Work targets only `development/v19-unified-reconciliation`. No deployment, main merge, production Supabase change, data migration or payment activation is part of this checkpoint.

**DO NOT DEPLOY: Package 1 is not complete. This checkpoint prevents unauthorized access but also blocks legitimate operational workspace entry until provisioning is implemented. It is not a usable release candidate.** Packages 2–6 have not been completed by this increment. No historical acceptance register item is promoted to complete by these changes.

## Implemented source

- `client/src/auth/AuthGate.tsx`: mandatory boundary outside database providers; direct operational routes require verified identity plus an in-memory workspace grant. Historical `enabled=false` cannot bypass it. Sign-in/account/recovery remain accessible.
- `client/src/App.tsx`: removes FriendsTestGate from the application path and installs cross-tab revocation handling. Auth changes revoke workspace access.
- `client/src/auth/workspaceBoundary.ts`: memory-only grants, expiry, company/database validation, immutable permissions, transaction abortion on lock, stale request rejection, cross-tab revocation and bounded workspace HTTP verification. Cached session alone is insufficient; Supabase getUser is required. This is a CLIENT CONTRACT, not an implemented trusted provisioning service.
- `client/src/auth/workspaceDatabaseBoundary.ts` and `db/TallybookDB.ts`: Dexie transaction and operation guards apply outside React. They do not encrypt storage or protect native browser IndexedDB access.
- `client/src/features/staff/staff.ts`: permission checks additionally require the workspace company, permission and bound local staff identity. An empty staff table cannot grant operational authority.
- `client/src/auth/useRun4CloudSession.ts`: failed verification and offline transitions lock the workspace; signout locks before awaiting remote signout.
- `client/src/auth/WorkspaceOnboarding.tsx` and `cloud/CloudBusinessPanel.tsx`: owner/employee setup choice; employee mode cannot create a company; account-only setup never mounts the legacy enrollment panel requiring local records. Choosing owner does not claim legacy businesses.
- `client/src/pages/GoogleSignInPage.tsx`: explains mandatory workspace authorization and preservation of legacy records without falsely claiming encryption.
- `.env.example`: historical bypass flags documented as deprecated.

## Critical incomplete work — exact continuation

1. **Trusted provisioning is absent.** `/api/workspace/access` is a proposed contract, not an implemented endpoint. HTML SPA fallbacks are rejected. Implement the isolated trusted service using verified membership, store/staff/device binding and proof of device key possession. Never issue grants from browser-selected roles, company identifiers or localStorage. The response's `storageProtection` marker is not evidence of actual encryption and must never be used as its substitute.
2. **Protected storage is absent.** The existing `db` singleton still names `tallybook-db`; contract grants deliberately reject that name. Implement and verify encrypted per-account/company storage, unlocked key lifecycle and application database selection before connecting successful provisioning. Review indexes, recovery, browser restart, crash consistency and exposure through native IndexedDB. Do not merely rename the plaintext database to match the proposed protected namespace.
3. **Offline reauthentication is absent.** All offline operational access currently denies. Implement an authenticated provisioning flow, protected local credential, device/account/company-bound signed lease, expiry, reconnect checks and key disposal. Test wrong credential, other account, expired/revoked lease and reload after signout. Short staff PINs alone must not be encryption keys.
4. **Safe legacy migration is absent.** No customer database has been changed by this increment. Add explicit verified ownership, pre-migration export, integrity checks, rollback and recovery before any local data conversion. Existing raw plaintext records remain readable to someone with browser-profile access. A synthetic sentinel-preservation test is not customer-history migration acceptance.
5. **Onboarding is incomplete.** Connect verified owner business/store/local staff/security/refund setup and employee invitation redemption to actual protected provisioning. Current role selection and cloud forms do not complete those journeys.
6. **Legacy test compatibility is unresolved.** The sampled existing staff regression fails in anonymous fixture initialization before reaching its intended assertion. Other legacy suites may have the same prerequisite mismatch; no full-suite result is claimed. Build an explicit authorized provisioning harness after the real workflow exists, preserving tenant, staff, financial and migration assertions. Do not add a global bypass or convert all domain tests to denial-only tests.
7. **Store-level record authorization remains unfinished.** Workspace grants contain store IDs, but the new generic Dexie boundary is database scoped, not per-row/per-store filtering. Preserve existing service checks and add complete read/write isolation before admitting employee workspaces.

These are implementation gaps, not requests for more devices or user approvals. Continue Package 1 before the mobile-shell package. Use the existing Mission GO registers for subsequent finance, refunds, replay and release work; do not interpret this new checkpoint as replacing that scope.

## Verification and reproduction

Logs are copied into `docs/mission-go/evidence/package-1-checkpoint/`. Run from the repository root with lockfile-pinned dependencies. On this Windows host TEMP/TMP point to `artifacts/qa-temp`; child-process execution required sandbox escalation. No security bypass was added to the shared test setup.

```powershell
$env:TEMP=(Resolve-Path artifacts/qa-temp).Path
$env:TMP=$env:TEMP
& .\node_modules\.bin\vitest.cmd run client/src/auth/workspaceBoundary.test.ts client/src/auth/workspaceDatabaseBoundary.test.ts client/src/auth/AuthGate.test.tsx client/src/auth/auth.test.tsx client/src/pages/CloudAccountRecovery.test.tsx client/src/pages/GoogleSignInPage.test.tsx client/src/cloud/CloudBusinessPanel.test.tsx --maxWorkers=1 --no-file-parallelism
node --test qa/milestone1-supabase-preservation.test.mjs qa/stage9-auth-shell-contract.test.mjs
& .\node_modules\.bin\tsc.cmd --noEmit
npm run build
& .\node_modules\.bin\vitest.cmd run client/src/features/staff/staff.test.ts -t 'does not reopen a protected company' --maxWorkers=1 --no-file-parallelism
```

The final measured outcomes accompany the logs. Workspace contract success tests use mocked trusted responses; they prove client validation/revocation only, not hosted provisioning, encryption, real-account RLS or offline sales. Native tests include source-contract checks, not browser journeys. Physical acceptance, full-suite regression, hosted identities and encrypted migration acceptance remain unexecuted for this checkpoint.

## Recovery and package handling

The existing live site and main remain at the previous baseline. Do not promote this development checkpoint. Preserve earlier ZIPs. `scripts/package-unified-source.py` packages the exact committed tree and generates per-file/ZIP SHA-256 evidence; its ZIP is a reproducible source checkpoint, not a release declaration.

### Final measured result

- Focused client tests: 7 files, 56 passed (39.33 seconds).
- Native source-contract checks: 10 passed, 0 failed.
- TypeScript semantic check: exit 0 (empty diagnostic log).
- Complete npm build (Vite/PWA plus esbuild server): exit 0. Bundle-size and upstream annotation warnings remain.
- Legacy staff compatibility sample: 1 failed during unauthorized setup, 12 skipped by the explicit name filter; no pass claimed.
- Full suite, browser journeys, provisioned offline access and real encrypted migration: not run/not implemented in this checkpoint.
