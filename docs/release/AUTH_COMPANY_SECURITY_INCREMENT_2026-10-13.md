# Tallybook V19 — company access security increment (2026-10-13)

**Status: SOURCE IMPLEMENTATION / UNVERIFIED. Release: NO-GO.**

## Verified baseline
Private GitHub `main` at `8390c59acb40dbd8e497848674a2558bed3a5fa8`. Changes live only on branch `security/auth-company-boundary-20261013`.

## Actual scope
1. `activeCompany.persistActiveBusinessProfileId` rejects nonexisting company IDs before modifying the saved company selector or in-memory selection. This is an offline workspace-integrity check, **not user/company authorization**.
2. New pure `companyAccessPolicy.ts` denies missing/expired principals, missing/pending/revoked or foreign memberships, mismatched account IDs, invalid runtime roles and insufficient role privileges. Its inputs must come from a trusted identity/membership backend and **cannot be populated from locally editable IndexedDB alone**.
3. Vitest tests added for the pure policy and nonexistent company selection. Not executed here.

## Why AuthGate and membership binding are NOT yet enabled
- The currently configured Google/Supabase sign-in UI does not establish owner-of-local-company identity, nor a production RLS-verified membership mapping.
- Existing local records can include multiple companies without account assignment. Turning on an unconditional AuthGate before specifying a safe migration/recovery path would deny owners access to valuable offline records.
- No authorized Supabase test project, authenticated membership schema/RLS policy, independent two-identity validation or real browser migration evidence is available.
- A local membership list or user ID imported from browser state cannot safely be used to claim that access is protected.

## Next security increment
- Owner-reviewed legacy-offline account binding and data recovery protocol (do not rewrite or delete legacy IndexedDB).
- Create authoritative memberships in a separately authorized TEST project, default-deny row-level security and negative two-user/two-company database tests.
- Add opt-in AuthGate after a verified session/membership service exists; gate service boundaries as well as pages; revoke on signout, session expiry and membership removal.
- Reconcile local staff roles with cloud user/company membership and audit all reads/writes/exports.
- Run Node 24.19.0/pnpm 10.34.0 Vitest, types, build, real IndexedDB tests and Windows/browser tests; do not claim success until executed.

**No cloud service, live OAuth, production keys, payments, public deployment or schema migration enabled.** Do not merge into main until reviewed and tested. Broad SEC-001 and CLOUD-001 remain unresolved.
