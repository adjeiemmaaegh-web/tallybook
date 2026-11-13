# Tallybook production readiness and fresh-start release — 2026-11-13

Status: **NO-GO / work in progress**. Owner requested production readiness, mandatory sign-in, and permanent deletion of old users and data. This document authorizes planning, not an assertion that the reset or release has happened.

## Verified infrastructure inventory

- Source: `adjeiemmaaegh-web/tallybook`, `main` commit `590e047d24704a7fafc1ad79a3c3756d38a5bd50` at review.
- Vercel project: `prj_VE3g2OymOQcALOK2ZzFxiW7w1yWV`; production deployment `dpl_9Ez5pxEhxAANCzikcxzZmNeSXAPy` at commit `7ec858a0591fc98c5a2702a691920da249c28822`. The two newer READY builds seen in deployment history target previews.
- Production Supabase: `qfyydfxwvifdvffdfgeu` (name: Tallybook). Separate sync test: `lmneuqxfyxplrxjswpma`; never reset it by mistake.
- Read-only database snapshot: 7 `auth.users`, 8 `auth.sessions`, 3 `public.businesses`, 1 `public.shop_sales`; there are additional dependent records. Counts are not immutable.
- GitHub tree: 2,113 entries, including a large client, 147 QA paths, SQL migrations and CI workflows.
- Every inspected public table has RLS enabled. The security advisor nevertheless reports 52 RLS-without-policy findings, apparently consistent with the project's RPC-only design, and flags externally executable SECURITY DEFINER RPCs. These require per-action/tenant authorization audit, not automatic revocation.
- `vercel.json` declares `git.deploymentEnabled=false` and a report-only CSP. The deployed Node server/API capability must be verified separately: Vercel has a Vite static output configuration, while some source session verification uses `/api/run4/session/verify`.
- `client/src/auth/AuthGate.tsx` expressly exempts offline ledger routes from cloud identity. `VITE_TALLYBOOK_REQUIRE_AUTH` defaults to false in `.env.example`; `requiresCloudOwner()` also uses cloud-configured flags. A mandatory-sign-in launch must audit all routes and local data access, not just redirect from the home page.

## Mandatory no-shortcut release gates

1. **Reconcile exact source / deployment / schema.** Freeze release SHA; map every Vercel environment and domain to the correct Supabase project; verify latest migrations and RPC signatures, ownership and grants; inspect git CI and deployment logs. Audit secrets without exposing them.
2. **Complete code + security review.** Authentication callback, login/recovery, session expiration/revocation, user/company tenancy, owner/staff roles, RPC actions (including SECURITY DEFINER), backup/import/sync, offline outbox, local storage, financial ledgers, stock and refunds, payment paths and data exports. Require reproducible regression tests for identified issues.
3. **Require verified account before any business access.** Preserve public welcome, signin, registration and recovery. Deny every ledger and shared-shop route, API, local transaction, backup and import until a verified signed-in identity and permitted company context are available. Fail closed on offline/expired/revoked identity. Remove local PIN-only entry as an alternate authorization route in the production build; local staff PIN may remain a *secondary* control only after account verification. Prevent stale service-worker or cached bundles from bypassing the gate.
4. **Production QA.** Pinned `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm build`, native tests, Vitest, Playwright auth/offline/visual smoke, dependency audit, database/RPC tests against disposable PostgreSQL, then hosted synthetic two-user/two-business isolation and forced session revocation. Verify actual production website routes and `/api` endpoints. Obtain accepted accessibility, recovery, mobile/desktop and operational evidence. No skipped critical checks.
5. **Controlled irreversible reset.** Select exact production project and record schema counts, auth users, sessions, storage buckets, Telegram links, database functions and dependent FK order. Create and RESTORE-TEST an access-controlled encrypted backup before any deletion; separately document retention and legal obligations. Temporarily block new writes/signups and pause live jobs, webhooks and outbox replay. Delete all intended **application** business rows and related objects and old Auth users using authenticated privileged tooling; revoke all sessions and refresh tokens. Do not drop migrations, schema, RPC code or system configuration. Audit sequences, queues, audit records, file storage and support/Telegram integration. Verify emptiness using complete post-reset inventories and new-account isolation probes.
6. **Browser data migration/reset.** Increment an irrevocable release epoch and invalidate prior locally persisted sessions, device bindings, IndexedDB databases, localStorage, Cache Storage and PWA service-worker caches **on next visit**, before any old workspace renders or syncs. Ensure a previous offline browser cannot later re-upload obsolete data. Because previously distributed offline devices can remain disconnected forever, remote deletion of *all* local copies cannot be guaranteed; advise users to clear site data or uninstall old PWA. Test legacy cached build upgrades, multiple tabs and interrupted reset.
7. **Deploy verified release.** Stage and test exact production artifact, then promote to production and verify all domains. After the controlled wipe, create a brand-new test account/business, assert initial zero records, verify all protected routes redirect signed-out visitors, expired old tokens fail, and write/read/refund/security tests work. Check logs and rollback playbook. Be cautious: rollback to old builds after destructive reset can reintroduce unsafe client behavior; rollback must not restore stale accounts without separate owner decision.

## Hard stop conditions

Do not claim production ready or wipe data if: a stale/offline client can access old ledger data; hosted account identity proof or API fails; any signed-in user can cross tenant boundaries; finance regressions fail; protected routes are reachable unsigned; tests or schema remain inconsistent; or backup restore has not been verified.

## As-of-review action log

- [x] Located repository, Vercel production target, active production and separate test Supabase projects.
- [x] Read current README, auth gate/device entry, environment example, deployment config and release QA summary.
- [x] Read-only inspected production table inventory, user/session counts, migration history and Supabase security advisor.
- [ ] Full line-by-line security and application audit.
- [ ] Implemented and tested universal account guard / legacy local data retirement.
- [ ] Frozen production artifact and all end-to-end release checks.
- [ ] Backup restore verification and reset execution.
- [ ] New production release and smoke acceptance.

No production database rows, authentication users, sessions, storage objects or deployments were changed during this initial review.
