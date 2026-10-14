-- Development migration; do not execute on a production project without review.
create table if not exists public.tallybook_company_memberships (
  company_id uuid not null,
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner','admin','staff')),
  status text not null check (status in ('active','revoked','pending')),
  primary key (company_id,user_id)
);
alter table public.tallybook_company_memberships enable row level security;
create policy "members see own records" on public.tallybook_company_memberships
for select to authenticated using (user_id = (select auth.uid()));
