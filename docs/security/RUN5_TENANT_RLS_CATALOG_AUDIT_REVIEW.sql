-- Tallybook V19 Run 5: READ-ONLY PostgreSQL tenant/RLS audit.
-- Run ONLY in an approved isolated Supabase test project.
-- This file performs NO CREATE, ALTER, UPDATE, DELETE or GRANT.
-- Do not infer authorization from these metadata checks alone.
--
-- Confirm canonical membership owner/attendant and forced private tables.
select
  n.nspname as schema_name, c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  c.relkind as relation_kind
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p')
order by n.nspname,c.relname;

-- Policies can be permissive OR combined. Inspect ALL, not merely one.
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public'
order by tablename,policyname;

-- Grants must be evaluated with RLS and RPC privileges. Server-only
-- invitation, recovery, binding and evidence tables must not be public.
select table_schema,table_name,grantee,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('PUBLIC','anon','authenticated','service_role')
order by table_name,grantee,privilege_type;

-- SECURITY DEFINER RPCs may otherwise bypass owner-approved invitations,
-- recovery and membership policy. Review definitions before any mutation.
select n.nspname,p.proname,p.oid::regprocedure as signature,
  p.prosecdef,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('create_owned_business','add_business_attendant')
order by p.proname;

-- Detect public tables with company or business tenant identifiers.
-- Actual cloud financial/backup/assistant/sync tables may not exist yet;
-- absent tables CANNOT be claimed to have tested RLS.
select t.table_name,t.column_name,t.data_type
from information_schema.columns t
where t.table_schema='public'
  and t.column_name in ('company_id','business_id','business_profile_id')
order by t.table_name,t.column_name;

-- Manual acceptance after reviewing results:
-- 1. Every cloud financial, report, backup, import, export, assistant, sync
--    read/write has the same authenticated tenant scope and transaction.
-- 2. Browser must never have direct INSERT/UPDATE/DELETE on server-only tables.
-- 3. Test 2 owners / 2 businesses / attendant / revoked user / expired session.
-- 4. REST SELECT/INSERT/UPDATE/DELETE against foreign business IDs must deny.
-- 5. Verify direct RPCs, PostgREST, service functions, bucket/storage objects,
--    notifications, signed links and pending async jobs cannot bypass RLS.
-- 6. No local IndexedDB staff/finance operation is cloud-authorized solely
--    because a user signed in: local staff auth is a separate Run 6 gate.
