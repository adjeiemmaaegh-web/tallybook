-- REVIEW-ONLY; NOT APPLIED. Canonical cloud business IDs are UUIDs.
-- Requires a migration and store-ID mapping plan before use with offline stores.
create table if not exists public.company_store_scopes (
 id text primary key check (char_length(id) between 1 and 128),
 company_id uuid not null references public.businesses(id),
 label text not null check (char_length(label) between 1 and 80),
 status text not null default 'active' check (status in ('active','disabled')),
 created_at timestamptz not null default now(),
 unique(company_id,id)
);
create table if not exists public.company_device_grants (
 id text primary key check (char_length(id) between 1 and 128),
 company_id uuid not null,
 store_id text not null,
 user_id uuid not null references auth.users(id),
 status text not null default 'active' check (status in ('active','revoked')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now(),
 foreign key(company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key(company_id,user_id) references public.business_members(business_id,user_id)
);
create index if not exists company_device_grants_active_lookup
 on public.company_device_grants(company_id,user_id,store_id,status,expires_at);
alter table public.company_store_scopes enable row level security;
alter table public.company_store_scopes force row level security;
alter table public.company_device_grants enable row level security;
alter table public.company_device_grants force row level security;
revoke all on public.company_store_scopes from public,anon,authenticated;
revoke all on public.company_device_grants from public,anon,authenticated;
-- No grants or browser RLS policies. Only a reviewed, privately-authenticated
-- server issuer may create/renew/revoke grants; never trust client assertions.
