# V19 Run 5 — Whole-run tenant data/service authorization increment

**Date:** 2026-10-16  
**Branch:** `v19/run5-tenant-service-authorization-20261016`  
**Base:** V19 Run 4 draft head `f983c7c924b1454c0cf0d2b215498887fd47d01e`  
**Disposition:** BROAD RUN 5 SOURCE INCREMENT DELIVERED; **RUN 5 ACCEPTANCE NOT PASSED / COMMERCIAL NO-GO**.

## Owner's coding directive
Author an entire V19 run within one development increment. If the required runner, Supabase sandbox, browser, real hardware or PostgreSQL environment is not available, **write down exactly what was not executed and continue development**. This is not permission to claim tests passed, merge `main`, run production migrations, enable cloud sync/payments, or deploy.

## Source implemented in this increment

- `server/run5TenantPolicy.mjs` — canonical `owner | attendant` role and protected cloud domain/action matrix, all tenant IDs strict UUIDs, expiry and revocation, company owner consistency, explicit denial of generic financial ledger changes, secure nested ownership validation for returned rows and imported metadata. Attendant cloud visibility is limited to catalog/inventory/orders; owner-only sensitive finance, reports, backups, assistant, import/export/sync. Offline local staff policy remains separate.
- `server/run5TenantService.mjs` — domain-oriented private authorization wrapper for read, owner-only metadata writes, report counts, export manifests, optionally enabled backup/assistant/sync preview and metadata-only imports. Each operation gets the server-resolved principal, checks the live session and canonical company membership, activates RLS scope and performs the operation and audit in one SERIALIZABLE transaction. Backup/import/assistant/sync feature gates default **OFF**; financial cloud mutation intentionally disabled.
- `server/run5TenantDataService.mjs` — independently scoped collection-oriented CRUD/list/pagination/report/assistant/export/import/sync facade consumed by the runtime. The implementation protects owner-only sensitive collections, stale sessions, foreign-company identifiers even nested in payloads, bounded pagination/import, optimistic revision and atomic audits. **Generic POS/financial/customer/stock writes and imports are disabled**; only narrow owner-scoped assistant metadata writes are permitted. Report previews explicitly mark `authoritativeLedger:false`; sync preview reports `replicationEnabled:false`.
- `server/run5TenantPostgres.mjs` — parameterized, company-qualified composite-key SELECT/INSERT/UPDATE/DELETE and metadata adapters, optimistic revision, live `auth.sessions FOR SHARE`, canonical `businesses` and `business_members` lookups, transaction-local GUC scope installed **after** authorization, private `SET LOCAL ROLE tallybook_run5_private`, SERIALIZABLE commit/rollback/connection release and tenant audit writes.
- `server/run5TenantRoutes.mjs` + `server/run5TenantRuntime.mjs` — allowlisted HTTPS, exact Origin, no-cookie bearer-only POST routes, body size/shape limits, generic denials, no-store responses, per-address throttling, explicit injection of private pool/Auth resolver. `server/index.ts` mounts this entire endpoint **disabled by default**, without credentials or cloud activation.
- `client/src/cloud/run5TenantReadClient.ts` — unmounted, read-only cloud catalog preview. Verifies current Supabase identity/session, same account and unchanged token after the response; rejects foreign companies even nested in returned payload, does not access local IndexedDB or expose financial cloud mutations.
- `docs/security/RUN5_TENANT_RECORDS_RLS_DISPOSABLE_REVIEW.sql` — **one canonical REVIEW-ONLY, UNAPPLIED** synthetic tenant-record/immutable-audit schema with composite business keys, forced RLS, anon/authenticated privilege revocation, dedicated NOLOGIN private role, restricted canonical membership lookup policies, transaction-local tenant/actor GUC-scoped policies, owner-only writes and a fail-closed disposable-only session flag. Its SQL was statically reviewed and syntax defects corrected; **real PostgreSQL compilation/behavior was NOT tested**. An older duplicate/conflicting SQL review was deleted rather than leaving two contradictory plans.

Existing local reports and backups already filter on `businessProfileId`, and assistant storage and sync outbox use active-company/service scope checks. Their current code was reviewed for scope patterns. This increment did not rewrite every legacy local function or claim a browser account is secure ownership evidence. The actual local browser database remains protected by local staff policies, not cloud RLS. **No migration, import, remote backup, or cloud sync of local data was performed.**

## Regression evidence honestly executed

Authored/retained **57 focused native-style test cases** in:
- `server/tests/run5TenantPolicy.test.mjs`: 8
- `server/tests/run5TenantPolicyIsolation.test.mjs`: 10
- `server/tests/run5TenantDataService.test.mjs`: 17
- `server/tests/run5TenantService.test.mjs`: 10
- `server/tests/run5TenantPostgres.test.mjs`: 6
- `server/tests/run5TenantRoutes.test.mjs`: 6

All **57/57 passed in isolated V8 executions** against checked-in JS modules, with simulated auth/SQL/HTTP instead of Node's actual module/runtime, PostgreSQL and Supabase. Corrected two initial test-harness expectations and a distinct two-company fixture. **This is not native Node QA and not a release acceptance PASS.** New read-only TypeScript client and reviewed SQL are not included in this 57-case execution.

## Deferred acceptance and source integration limitations

1. Native pinned Node/pnpm full suite, existing release-validation jobs, Vitest/semantic `tsc`/Vite/build, native Playwright, Windows device/IndexedDB and dependency/security audits on final exact SHA. GitHub Actions has repeatedly failed before executing job steps on prior draft heads; inspect final-head run separately.
2. In an **explicitly approved disposable Supabase project** only: inspect actual `pg_policies`, roles, permissions, functions, legacy grants, `auth.sessions` locks, canonical businesses/memberships. Compile/run reviewed SQL in disposable DB and prove role activation, absent GUC denial, privilege and policy interactions. Test two genuine distinct owner accounts + companies and attendant; cross-tenant read/write/export/import/report/backup/assistant/sync denial, revocation, expiry, owner transfer and concurrent rollback/replay. No live production SQL is approved.
3. Verify all existing cloud and offline legacy read/write/report/backup/restore/assistant/sync entrypoints under real tenant/account changes. Run 5 adapters do **not** create full service-side financial authorization for every legacy POS route; later Runs 6–14 must integrate invariant-safe writes, staff, atomicity, financial reconciliation and opt-in sync. Keep the unreviewed paths **non-cloud** until proved.
4. Build the approved private runtime/least-privilege pool and immutable audit retention, inspect transaction isolation errors/retries, test JWT deadline during locks and read-before-revoke races; no service role or private DB password is allowed in the browser.
5. Verify editor/writer conflict handling, response poisoning and nested payload limits on actual Postgres jsonb and browser. Review audit immutability via permissions/DDL (and any additional trigger constraints), backup confidentiality and per-company encryption policy before enabling backup retrieval/export.
6. Finish real UI account/tenant switching and protected read-only preview browser tests. The Run 5 client is **unmounted**; the route is disabled, so no functional live cloud data preview is claimed.
7. Reconcile Run 2/3/4 acceptance results and historical **47 blocker / 82 acceptance-unit classifications** only with new independent evidence; source-only delivery never promotes PASS.

## No-go controls and next coding increment

All prior Runs 2–4 remain **NOT PASSED**, and **Run 5 NOT PASSED**. Historical Run 1 PASS remains pinned to its own prior SHA. Alchemy's Tallybook is offline-first and company-configurable; no automatic local-company linking or data upload, no production Supabase changes, no payments, no staging/deployment, and no merge into `main`. Commercial release **NO-GO**.

Under the owner's one-full-run coding cadence, the next development increment is **V19 Run 6 — staff role/PIN, authorization, supervisor approvals, shifts, and audit**. All deferred Run 2–5 acceptance testing remains recorded.
