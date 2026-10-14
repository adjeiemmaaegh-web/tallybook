-- Supabase migration applied to Tallybook project during Run 2.
-- The reviewer-audit table is intentionally server-only and deny-by-default.
create table if not exists public.company_recovery_approval_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.businesses(id),
  reviewer_id uuid not null references auth.users(id),
  recovery_id text not null unique references public.company_recovery_approvals(id),
  created_at timestamptz not null default now()
);
alter table public.company_recovery_approval_audit enable row level security;
alter table public.company_recovery_approval_audit force row level security;
revoke all on public.company_recovery_approval_audit from public, anon, authenticated;
