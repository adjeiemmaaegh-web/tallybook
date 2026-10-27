# Tallybook V19 V47 — isolated targeted membership schema

**Date:** 2026-10-27  **Branch:** `development/v19-unified-reconciliation`  **Release:** NO-GO.

## Database change performed

Applied Supabase migration `20261027132708_test_run3_targeted_membership_invites` **only** to the pre-existing isolated test project `lmneuqxfyxplrxjswpma` (`Tallybook V19 Sync Test`). The application/production Tallybook project `qfyydfxwvifdvffdfgeu` was **not** modified. The SQL has been preserved in `docs/security/20261027_test_run3_targeted_membership_invites.sql` as an isolated test source-equivalent, not a production migration.

- Created `public.company_member_invites` (UUID company and Auth-user foreign keys, SHA-256 token digest, 15-minute maximum expiry, pending/accepted/revoked state) and `public.company_membership_audit` (actor, target, event, timestamp), with scoped indexes.
- Both new tables have RLS **enabled and forced**, no policies, and no `authenticated` SELECT/INSERT privilege. Browser roles have no table-write grants. The audit identity sequence also has browser grants revoked.
- Revoked `authenticated` and other browser EXECUTE privileges on the legacy direct attendant add/remove RPCs in both `public` and `private` schemas **on this disposable project only**, preserving `create_owned_business(text, uuid)` execution and the existing canonical read policies.
- No accounts, businesses, member records, invitations, or audit rows were created.

## Verification performed

1. `apply_migration` returned `success: true` and the migration ledger recorded `20261027132708 / test_run3_targeted_membership_invites`.
2. SQL catalog reads confirmed both new tables `relrowsecurity=true`, `relforcerowsecurity=true`, `authenticated_read=false`, `authenticated_write=false`.
3. SQL privilege reads confirmed `authenticated_can_execute=false` for `public/private.add_business_attendant` and `public/private.remove_business_attendant`, while `authenticated_can_execute=true` for both `create_owned_business` wrappers.
4. Database row-count read returned **0 Auth users / 0 companies / 0 memberships / 0 invitations / 0 audit rows**.
5. Local Node 22 static migration safety tests `node --test qa/run3-isolated-invite-schema.test.mjs`: **5/5 passed**, 0 failed. These checks assert SQL contract strings, not the behavior of real authenticated users.
6. Separate `auth.sessions` metadata check confirmed `id`, `user_id`, `not_after` fields used by the private Run3 adapter exist in the test project.

## Critical remaining blockers

- **Real owner and attendant sign-in:** The isolated project has zero Auth users, and there are no consenting inbox-controlled credentials to complete email confirmation or authenticated acceptance. Do not create fake Auth rows in SQL. The existing `qa/run3-real-supabase-rls-probe.mjs` needs three independent JWTs and two test companies.
- **HTTP availability:** The shipped `server/index.ts` has `installRun3MembershipRuntime(..., enabled:false)` and the site is a static Vercel SPA with catch-all rewrites. A deployed, protected private Node/Edge API has not been configured. Merely enabling a client preview would not make invitations work.
- **Financial sync:** No signed sale upload or second-device download is enabled. Staff PIN authorization, device-key enrollment, revocation, replays, and reconciliation must be verified with real sessions before any financial upload.
- **Production:** The live project still exposes the legacy owner-authorized direct attendant assignment RPC. Its removal needs a separate reviewed live migration after replacement acceptance. No change to production was authorized or made here.
- **Regression:** Full TypeScript, Vitest, native server suite, browser CI, historical backup migration, real Windows/Android acceptance and release gates remain open. This checkpoint is **NOT** a working end-to-end account or sync demonstration.

## Next action

In a separate test-host that can run the authenticated private API, use real disposable Auth accounts to test owner creation, targeted invitation, recipient acceptance, cross-company RLS, revocation, wrong-account denial and missing/stale session denial; then securely deploy a preview backend and run device sync. Do not touch the live database or deploy finances until tests and explicit review are complete.
