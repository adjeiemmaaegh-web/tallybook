# V46 — RLS-scoped cloud business selection (development only)
Date: 2026-10-27. Branch: `development/v19-unified-reconciliation`.

## Delivered
- Cloud business previews now require **both** read-only RLS-scoped `businesses` and `business_members` rows, consistent with the same server-validated Supabase Auth user.
- A mismatched owner/member role, missing membership, account switch during reads, duplicate/extra or truncated results, malformed UUIDs, and offline state all **fail closed**.
- The owner/attendant label and invitation preview gating use the verified membership role; they no longer trust `businesses.owner_id` alone for preview ownership.
- A cloud-business creation receipt is insufficient for owner UI: the account must re-read the freshly created company and its owner membership through RLS.
- Fifteen standalone Node security tests were executed and passed **15/15** for the pure membership boundary. Two additional UI regression scenarios were added; they have **not** been executed here.
- No change to Supabase schema, live Auth, Vercel production, cloud financial synchronization, local staff PIN requirements, or device enrollment.

## Limitations
- This is a **read-only UI proof**, not an authority grant. Server-side RLS and scoped authorization remain mandatory on every write.
- Run 3 invitation runtime, real owner-approved local staff/shop binding, and central signed-sales upload are still disabled in shipped server source.
- Two genuine user accounts on the isolated test project, actual invitation redemption, owner/attendant cross-tenant RLS probes, and full recovery flow are unverified.
- The full repository TypeScript, Vitest, server suite and browser builds need running from an installed clean checkout. No automated deployments or PRs.
- Production release decision remains **NO-GO**.

## Next
1. Complete a two-account browser and isolated Supabase probe without impersonation or inserting fake Auth rows.
2. Wire owner invitations and explicit staff/shop provisioning to an authenticated **server-only** route, guarded by live session/membership checks and source-side exact scope evidence.
3. Prove signed-sales upload/download with duplicates/retries/revocation and later approved operation kinds, then Windows/Android physical acceptance.
