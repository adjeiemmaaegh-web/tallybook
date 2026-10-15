-- REVIEW-ONLY migration for the EXISTING Tallybook Supabase schema.
-- Not applied to the active project. Requires security review and test isolation.
-- The tables businesses and business_members already exist and remain canonical.

create table if not exists public.company_recovery_approvals (
  id text primary key check (char_length(id) between 1 and 128),
  company_id uuid not null references public.businesses(id),
  owner_id uuid not null references auth.users(id),
  recipient_id uuid references auth.users(id),
  local_company_id text,
  kind text not null check (kind in ('verified-restore', 'approved-transfer')),
  status text not null default 'unused' check (status in ('unused', 'consumed', 'revoked')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint recovery_kind_fields check (
    (kind = 'verified-restore' and local_company_id is not null and recipient_id is null)
    or (kind = 'approved-transfer' and recipient_id is not null and local_company_id is null)
  )
);
create table if not exists public.company_local_bindings (
  company_id uuid primary key references public.businesses(id),
  local_company_id text not null check (char_length(local_company_id) between 1 and 128),
  owner_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table if not exists public.company_ownership_audit (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in ('company-binding-created','ownership-transferred')),
  company_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  recipient_id uuid references auth.users(id),
  local_company_id text,
  recovery_id text not null references public.company_recovery_approvals(id),
  event_at timestamptz not null default now()
);
create unique index if not exists company_ownership_audit_recovery_unique
  on public.company_ownership_audit(recovery_id);

alter table public.company_recovery_approvals enable row level security;
alter table public.company_recovery_approvals force row level security;
alter table public.company_local_bindings enable row level security;
alter table public.company_local_bindings force row level security;
alter table public.company_ownership_audit enable row level security;
alter table public.company_ownership_audit force row level security;
revoke all on public.company_recovery_approvals from public, anon, authenticated;
revoke all on public.company_local_bindings from public, anon, authenticated;
revoke all on public.company_ownership_audit from public, anon, authenticated;
-- No browser read or write access to server-only recovery evidence.
-- No browser APIs may mint approvals or transfer ownership.
-- Server-issued approvals must be created only after independent backup/restore
-- verification and owner/recipient verification, never from client-provided flags.
-- Transactional server implementation: server/trustedCompanyOwnershipPostgres.mjs
