-- V19 RUN 5 - REVIEW-ONLY ISOLATED TENANT DATA AUTHORIZATION
-- NEVER APPLY TO LIVE SUPABASE WITHOUT EXPLICIT APPROVAL.
-- Approval is not granted by reading this file or checking it into Git.
-- Canonical business ownership and membership remain the Run 3 public tables.
--
-- Preflight: compare all existing pg_policies, RPC EXECUTE grants, trigger
-- behavior, Supabase auth.users/auth.sessions schema and roles, and backup
-- history in an approved disposable project with synthetic test accounts.
-- This script intentionally does not drop any live table or existing policy.
do $$
begin
  if current_setting('tallybook.run5_disposable_only',true)
       is distinct from 'approved'
    then raise exception 'Run 5 is disposable-test-only';
  end if;
end $$;

-- NOLOGIN role must be assigned only to independently approved private
-- backend database login. Never grant this role to anon/authenticated/browser.
do $$
begin
  if not exists(select 1 from pg_roles where rolname='tallybook_run5_service')
    then create role tallybook_run5_service nologin;
  end if;
end $$;
grant usage on schema public to tallybook_run5_service;
grant select on public.businesses,public.business_members to tallybook_run5_service;
-- Canonical tables use RLS. This private role reads the authoritative owner
-- and member rows in order to verify membership BEFORE setting tenant scope.
-- No privileged browser role may inherit the NOLOGIN role.
create policy run5_private_business_review on public.businesses
  for select to tallybook_run5_service using (true);
create policy run5_private_member_review on public.business_members
  for select to tallybook_run5_service using (true);
-- Dedicated private login requires separate SELECT on auth.sessions, not GRANT
-- to authenticated. Validate Auth schema and non-BYPASSRLS privileges first.

create table if not exists public.company_tenant_records(
  company_id uuid not null references public.businesses(id) on delete restrict,
  collection text not null check(collection in(
    'products','customers','suppliers','purchases','sales','sale-lines',
    'payments','expenses','inventory','ledger','assistant','reports','backups','sync')),
  record_id text not null check(record_id ~ '^[A-Za-z0-9:_-]{1,128}$'),
  revision bigint not null default 1 check(revision between 1 and 9007199254740991),
  payload jsonb not null check(jsonb_typeof(payload)='object' and
    octet_length(payload::text)<=32768),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(company_id,collection,record_id)
);
create index if not exists run5_tenant_records_page_idx
  on public.company_tenant_records(company_id,collection,record_id);

create table if not exists public.company_tenant_data_audit(
  id bigint generated always as identity primary key,
  company_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  operation text not null check(operation in('read','write','delete','import')),
  collection text not null,
  record_id text,
  at timestamptz not null
);
create index if not exists run5_data_audit_company_idx
  on public.company_tenant_data_audit(company_id,at,id);

alter table public.company_tenant_records enable row level security;
alter table public.company_tenant_records force row level security;
alter table public.company_tenant_data_audit enable row level security;
alter table public.company_tenant_data_audit force row level security;
revoke all on public.company_tenant_records from public,anon,authenticated;
revoke all on public.company_tenant_data_audit from public,anon,authenticated;
grant select,insert,update,delete on public.company_tenant_records
  to tallybook_run5_service;
grant select,insert on public.company_tenant_data_audit
  to tallybook_run5_service;
grant usage on sequence public.company_tenant_data_audit_id_seq
  to tallybook_run5_service;

-- Session-scoped GUCs are set only after a live auth.sessions FOR SHARE and
-- canonical membership read inside the SAME SERIALIZABLE transaction.
-- This policy is defense-in-depth; security still depends on an uncompromised
-- dedicated server actor. No client can SET the private pool's GUC.
create policy run5_data_scope_select on public.company_tenant_records
 for select to tallybook_run5_service using(
   company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid
   and exists(select 1 from public.business_members m
     where m.business_id=company_id
       and m.user_id=nullif(current_setting('tallybook.run5_actor_id',true),'')::uuid
       and m.role in('owner','attendant'))
 );
create policy run5_data_scope_insert on public.company_tenant_records
 for insert to tallybook_run5_service with check(
   company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid
   and exists(select 1 from public.business_members m
     where m.business_id=company_id
       and m.user_id=nullif(current_setting('tallybook.run5_actor_id',true),'')::uuid
       and m.role in('owner','attendant'))
 );
create policy run5_data_scope_update on public.company_tenant_records
 for update to tallybook_run5_service
 using(company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid)
 with check(company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid);
create policy run5_data_scope_delete on public.company_tenant_records
 for delete to tallybook_run5_service
 using(company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid);

create policy run5_audit_scope_insert on public.company_tenant_data_audit
 for insert to tallybook_run5_service with check(
   company_id=nullif(current_setting('tallybook.run5_company_id',true),'')::uuid
   and actor_id=nullif(current_setting('tallybook.run5_actor_id',true),'')::uuid
 );

-- An actor with an old session, revoked membership or another company's
-- selector must receive 403/0 rows. No remote backup/import/assistant/ledger
-- operation may bypass these controls. No cloud financial sync is enabled.
-- Live PostgreSQL and RLS evaluation are NOT tested by source review.
