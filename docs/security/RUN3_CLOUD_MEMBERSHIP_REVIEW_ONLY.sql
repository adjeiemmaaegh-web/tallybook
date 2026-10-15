-- TALLYBOOK V19 RUN 3 - REVIEW-ONLY. DO NOT RUN AGAINST LIVE SUPABASE.
-- Requires separately approved disposable test project and review of ALL
-- existing public.businesses/business_members policies and RPC EXECUTE grants.
-- This extends the actual canonical owner|attendant schema. No new role table.

-- Hard stop unless an operator has explicitly unlocked an ISOLATED disposable
-- database session: SET tallybook.run3_disposable_only = 'approved';
-- Do not set this variable on Tallybook's live Supabase project.
do $
begin
  if current_setting('tallybook.run3_disposable_only',true)
       is distinct from 'approved' then
    raise exception 'RUN 3 schema is approved for disposable tests ONLY';
  end if;
end $;

-- Existing canonical tables must not authorize arbitrary tenant or membership
-- writes from browser credentials. Keep CREATE-BUSINESS RPC security review
-- separate; test its SECURITY DEFINER path before deploying any RLS change.
alter table public.businesses enable row level security;
alter table public.businesses force row level security;
alter table public.business_members enable row level security;
alter table public.business_members force row level security;
revoke all on public.businesses from public,anon;
revoke all on public.business_members from public,anon;
revoke insert,update,delete on public.businesses from authenticated;
revoke insert,update,delete on public.business_members from authenticated;
-- ISOLATED BASELINE: replace all pre-existing policies on these two
-- canonical tables in a disposable test schema before enabling production.
-- A permissive existing SELECT policy can otherwise widen an additive policy.
-- Snapshot the existing pg_policies records first; this is intentionally
-- destructive to test policies, never deploy against production blindly.
do $
declare policy record;
begin
  for policy in select tablename,policyname from pg_policies
    where schemaname='public' and tablename in ('businesses','business_members')
  loop
    execute format('drop policy %I on public.%I',policy.policyname,policy.tablename);
  end loop;
end $;
create policy run3_business_read_member on public.businesses
  for select to authenticated using (
    exists (select 1 from public.business_members m
      where m.business_id=businesses.id and m.user_id=(select auth.uid()))
  );
create policy run3_member_read_own on public.business_members
  for select to authenticated using (user_id=(select auth.uid()));
-- No browser INSERT/UPDATE/DELETE policy on canonical membership tables.
grant select(id,name,owner_id,created_at,updated_at)
  on public.businesses to authenticated;
grant select(business_id,user_id,role,created_at)
  on public.business_members to authenticated;

-- Server-only invitation mutations require a reviewed private role.

create table if not exists public.company_member_invites (
  id uuid primary key,
  company_id uuid not null references public.businesses(id),
  invited_by uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  token_sha256 text not null unique check(token_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check(status in ('pending','accepted','revoked')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  closed_at timestamptz,
  check(target_user_id <> invited_by),
  check(expires_at > created_at and expires_at <= created_at + interval '15 minutes'),
  check((status='pending' and closed_at is null) or
        (status <> 'pending' and closed_at is not null))
);
create index if not exists company_member_invites_scope_idx
  on public.company_member_invites(company_id,target_user_id,status,expires_at);

create table if not exists public.company_membership_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  target_user_id uuid not null references auth.users(id),
  event_type text not null check (event_type in
    ('invited','accepted','member-revoked','invite-revoked')),
  invitation_id uuid references public.company_member_invites(id),
  event_at timestamptz not null
);
create index if not exists company_membership_audit_company_idx
  on public.company_membership_audit(company_id,event_at,id);

alter table public.company_member_invites enable row level security;
alter table public.company_member_invites force row level security;
alter table public.company_membership_audit enable row level security;
alter table public.company_membership_audit force row level security;
revoke all on public.company_member_invites from public,anon,authenticated;
revoke all on public.company_membership_audit from public,anon,authenticated;
-- Deliberately no browser RLS policies on invitation hashes, audit or
-- reviewer history. The private transaction role must have reviewed SQL
-- privileges; it is never browser-accessible or committed to Git.
-- No direct assignment RPC may bypass the invitation acceptance gate.
-- Deny the old direct-grant RPC in the isolated test schema. Signature
-- discovery is read-only from pg_proc; this applies to all public overloads.
-- Review affected callers and creation flow before considering deployment.
do $
declare item record;
begin
  for item in select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='add_business_attendant'
  loop
    execute format('revoke execute on function %s from public,anon,authenticated',
      item.signature);
  end loop;
end $;
-- Review/revoke EXECUTE on legacy add_business_attendant per exact function
-- signature once the disposable project's pg_proc catalog is inspected.

-- Mandatory acceptance queries (read-only) in approved test DB:
-- select tablename,policyname,roles,cmd,qual,with_check from pg_policies
-- where schemaname='public' and tablename in
-- ('businesses','business_members','company_member_invites','company_membership_audit');
-- select grantee,table_name,privilege_type from information_schema.role_table_grants
-- where table_schema='public' and table_name in
-- ('businesses','business_members','company_member_invites','company_membership_audit');
-- select proname,prosecdef,proacl from pg_proc join pg_namespace on
-- pg_namespace.oid=pg_proc.pronamespace
-- where nspname='public' and proname in
-- ('create_owned_business','add_business_attendant');
-- Do not certify RLS until two real accounts (owner+attendant) and a foreign
-- tenant have executed authenticated REST SELECT/INSERT/UPDATE/DELETE probes.
