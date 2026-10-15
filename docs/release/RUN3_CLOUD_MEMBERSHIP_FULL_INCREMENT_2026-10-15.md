# Tallybook V19 — Run 3 whole-run source implementation and deferred acceptance
**Date:** 2026-10-15
**Development status:** Run 3 source scope delivered in one increment for review; **NOT PASSED / NOT ACTIVATED**.
**Starting checkpoint:** Run 2 draft PR #13 at `939e06de8eb313b64211beeb1c94e26859b4af5b`.
**Development branch:** `v19/run3-cloud-membership-20261015`. Draft PR targets the Run 2 branch, not `main`.
**Release:** NO-GO / INCOMPLETE.

## Owner's cadence

The owner's latest instruction authorizes proceeding with **complete-run source development in one increment** and documenting unavailable QA for later execution rather than repeatedly stopping at small fixes. This changes **development scheduling**, not the historical acceptance evidence. Run 2 still has unexecuted gates; Run 3 must not be called passed or commercially ready until its actual tests and predecessor release gates pass.

## Run 3 implementation delivered

1. **Canonical identity:** `server/run3MembershipService.mjs` uses existing `public.businesses(id,owner_id)` and `public.business_members(business_id,user_id,role)`, with **owner/attendant** as the only cloud roles. No parallel memberships table, stored admin/staff role, or local IndexedDB authority was introduced. An attendant role never automatically unlocks the local POS.
2. **Owner-issued targeted invitations:** strong 32-byte random one-time bearer invitation, stored as a SHA-256 digest, 15-minute expiry, target Supabase user ID bound to the case, owner membership and target Auth user checked in the transaction, duplicate active invites denied, audit append atomic with issuance. No email enumeration or auto-linking.
3. **Recipient-verified acceptance:** the target's separately validated Supabase JWT is checked again against private `auth.sessions` inside a SERIALIZABLE SQL transaction. Invite is locked, not expired, not used, and must belong to the verified recipient. Canonical current owner/membership are rechecked, attendant inserted once, invitation consumed and audit written atomically. Replay, foreign user, stale owner and duplicate membership deny.
4. **Revocation and roles:** verified owner can revoke an attendant (but not owner, self, or a foreign tenant member), cancel their pending invitations, revoke unredeemed invitations, and list current members of their own company. Ownership transfers remain exclusively in Run 2; no hidden elevation to owner/admin. Canonical revocation deletes the membership; absent row means denied.
5. **Private adapter:** `server/run3MembershipPostgres.mjs` implements parameterized, transaction-bound reads/writes, `SERIALIZABLE` commit/rollback, locked owner/membership/invitation reads, strict row-count assertions and metadata-only append audit.
6. **Deny-by-default transport/runtime:** `server/run3MembershipRoutes.mjs` and `server/run3MembershipRuntime.mjs` implement narrow POST operation allowlists, direct TLS, exact Origin, bearer authorization only (cookie requests denied), JSON field whitelists, generic denial, no-store responses and per-address rate limiting. `server/index.ts` registers the route **disabled**. No automatic private pool, credentials, public feature or payment activation.
7. **Client:** `client/src/cloud/run3MembershipClient.ts` checks current Supabase identity/session before calling the private route, validates receipts and never mutates local finance/IndexedDB. `Run3MembershipPanel.tsx` offers owner invite/revoke/list and recipient acceptance. It is mounted via `VITE_TALLYBOOK_RUN3_MEMBERSHIP_PREVIEW=true` **only**; default is off. The account panel may select among RLS-visible cloud companies without switching the local workspace.
8. **Legacy bypass:** `linkUserToBusiness` in `businessIdentity.ts` now denies the previous browser-invoked direct `add_business_attendant` RPC. Review-only SQL includes a gated REVOKE EXECUTE of legacy overloads for an **approved disposable** environment. Until tested and applied at an authorized deployment, existing server-side RPC privileges in the live project are **not assumed closed**.
9. **Review-only SQL:** `docs/security/RUN3_CLOUD_MEMBERSHIP_REVIEW_ONLY.sql` retains canonical identities; creates private invite/audit tables with forced RLS and no browser policies; protects authenticated canonical table writes; and declares narrow self-membership and own-business SELECT RLS policies in an **isolated reset baseline**. A session-set `tallybook.run3_disposable_only=approved` guard fails closed otherwise. This policy reset drops prior policies in the chosen **disposable test DB**, so never execute against production. Catalog/policy/function permissions and business-creation compatibility must be verified before any future migration design.

## Tests authored and evidence

- `server/tests/run3MembershipService.test.mjs`: **12** checked-in cases for targeted issuance, owner/recipient role, replay, stale/revoked session, expiry, cross-tenant isolation, cancellation, owner protection, audit rollback, member listing, malformed input.
- `server/tests/run3MembershipPostgres.test.mjs`: **5** checked-in tests of serializable transaction, bound SQL values, strict row count and rollback/connection release.
- `server/tests/run3MembershipRoutes.test.mjs`: **6** checked-in tests of default-off routing, direct TLS, Origin/cookie rejection, bad payload, generic denial and rate limit.
- All **23/23** newly checked-in Node-style test cases were executed successfully in isolated V8 runners with substituted Node/crypto/PostgreSQL/HTTP APIs. This is **source-behavior evidence, NOT native Node, real Postgres, real Supabase, browser or GitHub CI**. Synthetic crypto is not a cryptographic-strength test.
- `client/src/cloud/businessIdentity.test.ts` was updated to assert denial of legacy direct assignment and to cover the RLS-visible company list. **Vitest not executed.**
- `qa/run3-real-supabase-rls-probe.mjs` is a **not executed, gated** real-two-company REST/RLS read-only probe. It requires an explicitly approved disposable project, three independent fixture accounts, two fixture companies and refuses the recorded production Supabase host.

## Mandatory deferred acceptance / external QA

- Native pinned Node 24/pnpm frozen install; full `node --test` suite, client Vitest, semantic TypeScript, production build, dependency audit and exact-final-SHA GitHub Actions. Existing Actions jobs were failing before any steps on prior Run 2 source.
- Isolated real Supabase project and PostgreSQL connection (not live production): review all existing `pg_policies`, table privileges, RPC EXECUTE grants, `auth.sessions` schema and `create_owned_business` compatibility with strict RLS before running SQL. Validate **two owners, one attendant, and foreign company** with authenticated REST positive/negative reads, write-denial probes, token expiry/deletion, lock contention, duplicate/replay, partial failure, audit consistency and rollback.
- Secure private least-privilege PostgreSQL pool creation and lifecycle, runtime enablement in a separately authorized isolated deployment, Direct-TLS end-to-end and CSRF/origin/rate-limit verification.
- Real cloud membership invite/accept/revoke UI with account switching, offline working unchanged, and no cached foreign data. Full browser migration and local IndexedDB regression on Windows and supported browsers.
- Verify that existing live `add_business_attendant` RPC permissions cannot bypass the invite flow **before** commercial use, without blindly changing live schema now.
- Threat model and audit of token delivery (one-time plaintext shown only to owner and intended recipient), rate limits across distributed deployments, targeted invitation guessing, audit immutability and forced-RLS policy correctness.
- Historic Run 2 acceptance gaps remain open. Original **47 blocker / 82 acceptance-unit classifications are not upgraded** by a code-only run.

## Status

**Run 3 source development increment delivered for review; Run 3 ACCEPTANCE NOT PASSED.** Run 2 also NOT PASSED; Stage 9 partial; commercial release **NO-GO**. No `main` merge, live Supabase SQL, reviewer provisioning, payments, cloud replication, staging, or production deployment.
