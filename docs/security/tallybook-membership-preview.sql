-- REVIEW ONLY. Apply only to a separately approved Supabase test project.
-- Existing IndexedDB workspace IDs are NOT cloud company ownership evidence.
create table if not exists public.tallybook_companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  status text not null default 'active' check (status in ('active','disabled'))
);
create table if not exists public.tallybook_company_memberships (
  company_id uuid not null references public.tallybook_companies(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','admin','staff')),
  status text not null check (status in ('active','revoked','pending')),
  primary key (company_id,user_id)
);
alter table public.tallybook_companies enable row level security;
alter table public.tallybook_companies force row level security;
alter table public.tallybook_company_memberships enable row level security;
alter table public.tallybook_company_memberships force row level security;
revoke all on public.tallybook_companies from public, anon, authenticated;
revoke all on public.tallybook_company_memberships from public, anon, authenticated;
grant select on public.tallybook_companies to authenticated;
grant select on public.tallybook_company_memberships to authenticated;
drop policy if exists "members see own records" on public.tallybook_company_memberships;
create policy "members see own records" on public.tallybook_company_memberships
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "active members see companies" on public.tallybook_companies;
create policy "active members see companies" on public.tallybook_companies
for select to authenticated using (
  status = 'active' and exists (
    select 1 from public.tallybook_company_memberships m
    where m.company_id = id and m.user_id = (select auth.uid()) and m.status = 'active'
  )
);
-- No API-client insert/update/delete policies or grants.
-- A reviewed privileged service must provision, revoke and transfer ownership,
-- with serializable transactions, audit records and trusted recovery proofs.
-- No financial records may be exposed until every table has its own company RLS.
