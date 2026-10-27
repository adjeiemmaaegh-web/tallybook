# V41 resumed Supabase baseline — 2026-10-27

Project `qfyydfxwvifdvffdfgeu` was inspected through the connected Supabase account after the owner resumed it. `get_project` returned `ACTIVE_HEALTHY` in `eu-west-2`, PostgreSQL 17.6.1. This was a **read-only inspection**. No SQL migration, Auth change, route activation, deployment, or data mutation was made.

## Observed live baseline

The `public` schema has seven tables: `profiles`, `businesses`, `business_members`, `company_recovery_approvals`, `company_local_bindings`, `company_ownership_audit`, and `company_recovery_approval_audit`. All seven have RLS enabled. The three browser-readable identity tables have membership/owner-scoped SELECT policies; the four recovery/binding/audit tables have no client policies and are intentionally server-only. `anon` and `authenticated` have **zero direct INSERT, UPDATE, DELETE, or TRUNCATE grants** on public tables. `authenticated` has SELECT grants on `profiles`, `businesses`, and `business_members` only. There were zero businesses, memberships, and local bindings, with one Auth user at inspection time.

The migration ledger contains `business_identity`, `restrict_rls_helper`, `company_binding_recovery_server_only`, and `company_recovery_reviewer_audit`. The ownership baseline is UUID `businesses` / `business_members`, not the separate draft text-ID `tb_businesses` / `tb_memberships` model. The current `business_members` role constraint allows `owner` and `attendant`. `company_local_bindings` maps a UUID cloud company to a text local company ID; its only unique/primary key is `company_id`. A future sync schema must explicitly handle local-ID ambiguity rather than assuming that `local_company_id` is globally unique.

Supabase security advisors reported one warning: leaked-password protection disabled. They also reported four informational `rls_enabled_no_policy` findings on the server-only tables. Those four findings do not by themselves indicate client access because the inspected browser roles have no table grants. Performance advisors reported nine unindexed foreign keys and one unused index; these should be evaluated against workload before adding or dropping indexes. See the [RLS advisory](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) and [password setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Reconciliation decision

Do **not** apply `supabase/migrations/001_core_tables.sql`, `002_rls_policies.sql`, `003_audit_and_views.sql`, or `docs/security/CENTRAL_SALE_INGEST_ISOLATED_SCHEMA.sql` to this project. They target a different `tb_*` identity model. The V40 `centralSaleIngestPostgres.mjs` adapter also queries those absent tables. It remains isolated and unmounted.

Build a forward-only migration against the actual UUID ownership baseline in a disposable project first. It must map a verified cloud company to the immutable local company ID, scope shops/staff/devices under that company, bind the staff account to an existing `business_members` row, enroll and revoke a device public key through owner-approved authenticated flows, and store signed upload claims behind server-only writes. A signed upload is not independent evidence that a historical physical sale occurred. The browser must retain offline operation when cloud services pause.

Then test the migration with two real test Auth accounts in two companies, including owner/attendant permissions, cross-company denial, direct Data API write denial, key revocation, session revocation, exact retries, changed-payload conflict and lost-ACK retry. The live project currently has one Auth account and no business rows, so this inspection **cannot** establish those behavioral results. After isolated tests pass, review the migration and its rollback/restore path before any live DDL. Do not provision fabricated owner or attendant rows directly through SQL.

## Reproduce the structural read-only check

Run this query through the connected Supabase SQL tool on the same project; compare counts and grants before relying on this snapshot:

```sql
select
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r') as public_table_count,
 (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relrowsecurity) as public_tables_with_rls,
 (select count(*) from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated')
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')) as browser_write_grants,
 (select count(*) from pg_policies where schemaname='public') as public_policy_count,
 (select count(*) from public.businesses) as business_count,
 (select count(*) from public.business_members) as membership_count,
 (select count(*) from public.company_local_bindings) as local_binding_count;
```

Observed: `7, 7, 0, 3, 0, 0, 0`. This is a structural snapshot, **not** an authenticated RLS denial test or proof that sync works.
