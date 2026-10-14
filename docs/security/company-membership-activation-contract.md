# Stage 9 Round 1 — canonical Supabase membership contract
**2026-10-14 | Integration candidate, NOT activated or deployed. Release NO-GO.**

Read-only inspection of the connected Tallybook Supabase project confirms the authoritative model: `public.businesses(id, owner_id, ...)` and `public.business_members(business_id, user_id, role, created_at)`, where the role check accepts exactly `owner` and `attendant`. There is **no** deployed `company_memberships` table or persisted `admin/staff/status` role model. Do not create a parallel membership table to accommodate obsolete draft documentation. Revocation removes the business member row, and an absent row means denied.

Both business and membership reads require authenticated RLS. Verified current policies allow users to see only their own membership and businesses in which they hold one; public `anon` has no SELECT grant. Business creation and attendant grants/removal use separately protected RPCs. This documentation does not certify server-side financial authorization or completed live two-user adversarial testing.

External `owner` maps to internal `owner` only when the business `owner_id` agrees. External `attendant` maps to internal `staff` for the limited *identity/access policy* and never automatically gains a store assignment, offline ledger access, posting capability, or an administrator role. The verified cloud user must agree with a current nonexpired session; a user-selected local company is never ownership proof.

PR #4's AuthGate remains disabled by default (`VITE_TALLYBOOK_REQUIRE_AUTH`); PR #7's cloud checker remains unwired to existing finance and local-data access. A signed-in user cannot automatically claim, upload, clear, or import old IndexedDB records.

**Before activation:** design and test explicit offline business ownership/binding with backup and restore; use immutable business/store/device context on sensitive writes; perform two-user and revoked-user Supabase RLS tests; implement durable ledger syncing; verify browser/session switching and Vercel branch deployment policy; run combined CI. No schema, RLS, cloud environment, deployment, production data, financial service or feature-flag changes are authorized by this candidate.
