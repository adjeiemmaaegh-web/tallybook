# Production readiness audit evidence — 2026-11-14

**Release decision: NO-GO.** This report separates checked evidence from incomplete gates; it is not a claim of a completed exhaustive manual review.

## Source / release boundaries

- Main GitHub baseline inspected: `590e047d24704a7fafc1ad79a3c3756d38a5bd50`; tree has 2,113 entries.
- Work in progress: PR #86 (`security/mandatory-online-account-boundary-20261113`), with a tested strict login branch, live-session proof, browser local-data retirement and CodeQL. Its review status and CI should be read from the final head SHA, not an earlier passing SHA.
- Production Vercel project ID `prj_VE3g2OymOQcALOK2ZzFxiW7w1yWV`. The `vercel.json` disables auto-deploy from Git. Until a tested deployment is promoted and verified, main/preview changes are not the production release.
- Active production Supabase project ID `qfyydfxwvifdvffdfgeu`; distinct test project `lmneuqxfyxplrxjswpma`. Never reset the test project.

## Read-only hosted database inspection

- `auth.users`: 7; `auth.identities`: 7; `auth.sessions`: 8; `auth.refresh_tokens`: 31.
- `public.businesses`: 3; `public.shop_sales`: 1; other business/product/stock/sale records exist.
- `storage.buckets`: 0 and `storage.objects`: 0 at inspection.
- All 55 inspected public tables had RLS enabled, none exposed direct table privileges to `anon`; three granted some direct privileges to `authenticated` with RLS still in force.
- Twelve public SECURITY DEFINER functions were inventoried. Their six account-facing RPC wrappers are callable only by `authenticated`, not `anon`; the inspected wrappers forward `auth.uid()` and JWT session IDs to private functions. `private.shop_member_role` checks `auth.sessions` against `auth.uid()` and company membership before allowing access. **Not every function/action branch has received an independent adversarial proof.**
- The public `tallybook_active_session_proof()` RPC exists on the sync test project; anonymous execution was denied (42501), authenticated execution granted, and its definition checks `auth.sessions`. It was absent from the production project at inspection; production cannot enable mandatory strict mode until migration and real hosted acceptance.
- Many foreign keys involving `auth.users` use NO ACTION and do not cascade. A simple `DELETE FROM auth.users` against populated production is not a correct full reset.

## Backup and irreversible wipe blocker

- Supabase organization `iqjoxrvlwefoylmwkuig` is on the **Free** tier.
- Supabase's Database Backups guidance says automatic daily backups are provided for Pro/Team/Enterprise. Free-tier projects should export with the CLI `supabase db dump` and keep an off-site backup: https://supabase.com/docs/guides/platform/backups
- There is no verified recoverable off-site snapshot, no restore-test evidence, and no owner-approved retention classification available in the connected tools. Database deletion at this point would be unprotected and must not be represented as production readiness.
- Storage inventory was empty, but auth identities, sessions, refresh tokens, and 55 public tables still require transactionally coordinated reset, validated in disposable database first.
- The new browser retirement code clears old IndexedDB databases, local/session storage, Cache Storage and service-worker registrations before mounting the new app, **only when configured with an explicit release epoch and mandatory auth**. This operates on clients only when they revisit and load the new build; it cannot reach disconnected devices indefinitely.

## Reviewed source gaps and mitigations

1. Former `AuthGate` did not gate local ledger routes; strict-mode `FriendsTestGate` with active-session proof now gates those routes under PR #86. Main/production unchanged until merge/promote.
2. Prior locally cached owner could return offline; strict mode rejects cached offline identity and requires a fresh server check.
3. Shared-shop cache rendered from local state when offline; strict mode denies it outside active server-verified sessions.
4. PWA/IndexedDB/localStorage persisted across server resets; one-way early boot retirement added behind explicit epoch, with fail-closed behavior and unit and browser acceptance cases.
5. Source `vercel.json` CSP remains report-only, requiring a tested enforced policy before hardening the production edge.
6. End-to-end hosted OAuth, real independent users/businesses, session revocation, email recovery, data reset, payment/provider and real-device acceptance are still open.

## Verification links

- Mandatory account and reset candidate: https://github.com/adjeiemmaaegh-web/tallybook/pull/86
- PR #86 previously passed release, UI, Edge/WebKit and reference visual GitHub Actions on `d79a7f1675f06fddb44753ed91d4bea56aada366`; this predates local retirement changes. **Do not reuse those passes for the new head.**
- Pin/source audit workflow `.github/workflows/security-code-audit.yml` runs CodeQL security-extended for JS/TS. A successful workflow does not establish zero findings without reviewing the uploaded alerts.
- Preview deployment for tested code at `0b9427bf3245773bc0e980cf5e777678d6c4ccf6`: `dpl_CpSEwKDWFwJHpurxDqnbYfmFfoji`; preview routes `/welcome` and `/signin` returned HTTP 200 on 14 November. This is not proof of a successful sign-in session, local reset, or production behavior.

## Remaining irreversible go-live checklist

1. Complete all final SHA CI suites and inspect CodeQL findings (not merely workflow status).
2. Verify hosted account creation, login, account switching, revocation and cross-company isolation against disposable accounts. Confirm migration parity.
3. Export a full off-site database/auth backup, separately store an authenticated recovery secret, and restore-test it against a disposable environment. Retain only as permitted.
4. Enter maintenance mode, stop webhooks/queues and registrations, freeze exact targets and inventories, execute a reviewed transactionally safe reset of all intended public and auth data, validate zero residual business/user/session rows. Retain migration history and database configuration.
5. Enable `VITE_TALLYBOOK_MANDATORY_ONLINE_AUTH=true` and a unique `VITE_TALLYBOOK_FRESH_START_EPOCH` on the exact production build, stage/promote it, and verify fresh signup plus no accessible old records. Do not rely solely on client data clearing to revoke old tokens.
6. Verify the same release from legacy PWA clients, multi-tab/blocking storage cases and current supported browsers. Disconnected devices are never assured remotely wiped.

## Additional account authorization finding and source remedy

The exposed authenticated `public.create_owned_business` wrapper invokes `private.create_owned_business`. The production version checks `auth.uid()` but not whether `auth.jwt().session_id` still appears in an active `auth.sessions` row. A revoked but otherwise unexpired signed JWT may therefore retain business-creation authority (subject to normal API/JWT verification). PR #86 adds `supabase/migrations/20261114120000_company_creation_active_session.sql` with a session/actor match, expiration check, and row lock, plus rollback and synthetic PGlite tests. This is **source-only**, not applied to production; verify hosted before release.

The authenticated `private` function inventory showed 48 routines, 38 SECURITY DEFINER, no anonymous EXECUTE privileges and only one directly authenticated-executable private function: `create_owned_business`. Its public wrapper was reviewed. Other RPC actions still require complete action-specific authorization review before claiming exhaustive security acceptance.
