# Company membership database activation contract — review only

The Tallybook V19 offline-first app must **not** turn on the cloud company access checker or AuthGate merely because a Supabase session exists.

## Tenant membership table contract
A future separately approved Supabase **test** environment must supply a `company_memberships` table with:
- `company_id`: authoritative tenant/company identifier, linked to a company table, never inferred from the current IndexedDB selected company;
- `user_id`: references a Supabase Auth user;
- `role`: owner, admin or staff;
- `status`: active, pending or revoked;
- uniqueness on the user/company pair and authenticated-only, company-scoped access.

The public/anonymous database roles must not be able to create, edit, grant, revoke or delete memberships. Read-only membership access must be limited by **database-enforced row-level security** to the authenticated user. Creating tenants, accepting invitations, transferring ownership and revoking membership require a separate reviewed and audited privileged service with server-side actor checks. No browser `service_role` key may be used.

All future cloud sales, inventory, customer, finance and backup tables require their own independent deny-by-default company RLS policies and tests. A membership check in React is not a substitute for database authorization.

## Required adversarial checks before activation
1. User A belongs to Company A. User B belongs to Company B. A cannot read or mutate B membership or financial data using a forged ID, direct REST request or normal UI.
2. Pending/revoked members cannot read company data. Revocation takes effect for every new authorized request, including after tab switching or session refresh.
3. Staff cannot change owner/admin privileges. Owners may only grant/revoke through authorized server-side operations and cannot bypass company boundaries.
4. Expired/replaced/absent credentials fail closed. Concurrent user switching cannot authorize old in-flight company operations.
5. Local data belonging to legacy offline workspaces is preserved until the owner has reviewed and tested an explicit, recoverable mapping to authenticated accounts.
6. Run the complete pinned Node/pnpm types/tests/build and real IndexedDB/Windows/browser matrix. Maintain release NO-GO until all relevant gates pass.

## Increment status (2026-10-13)
- The existing `verifyCloudCompanyAccess.ts` remains opt-in/unwired; it calls authenticated `getUser`, checks session expiry and exactly one membership, and applies the pure role policy.
- `verifyCloudCompanyAccess.test.ts` now includes mocked positive/negative cases. These are source tests, not live RLS proof, and were **not executed** in this environment.
- No migration, deployment, live test project, account grant, payment operation, or production authorization was performed.
