-- STAGE 9 ROUND 1: REVIEW-ONLY, NOT DEPLOYED.
-- Requires private privileged PostgreSQL actor. No grant to anon/authenticated.
-- Existing company_store_scopes and company_device_grants schema must be
-- reviewed, reconciled and applied BEFORE this migration in a test project.
-- Hard security limitation: the grant ID is currently a bearer device handle;
-- an unforgeable device public-key proof is still needed for hardware binding.

create table if not exists public.company_device_enrollment_invites (
  id uuid primary key,
  company_id uuid not null references public.businesses(id),
  store_id text not null,
  target_user_id uuid not null,
  issued_by uuid not null,
  token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
  status text not null default 'unused' check (status in ('unused','used','revoked')),
  created_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > created_at),
  foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
  foreign key (company_id,target_user_id) references public.business_members(business_id,user_id) on delete cascade,
  foreign key (company_id,issued_by) references public.business_members(business_id,user_id) on delete cascade
);
create index if not exists company_device_enrollment_invites_lookup
 on public.company_device_enrollment_invites(company_id,store_id,target_user_id,status,expires_at);
create table if not exists public.company_device_enrollment_audit (
  id bigint generated always as identity primary key,
  action text not null check (action in ('device.invite.issued','device.grant.issued','device.grant.revoked')),
  company_id uuid not null references public.businesses(id),
  store_id text not null,
  actor_id uuid not null,
  target_user_id uuid not null,
  grant_id uuid,
  invite_id uuid,
  event_at timestamptz not null,
  foreign key (company_id,store_id) references public.company_store_scopes(company_id,id)
);
create index if not exists company_device_enrollment_audit_company
 on public.company_device_enrollment_audit(company_id,event_at desc);
alter table public.company_device_enrollment_invites enable row level security;
alter table public.company_device_enrollment_invites force row level security;
alter table public.company_device_enrollment_audit enable row level security;
alter table public.company_device_enrollment_audit force row level security;
revoke all on public.company_device_enrollment_invites from public,anon,authenticated;
revoke all on public.company_device_enrollment_audit from public,anon,authenticated;
revoke all on sequence public.company_device_enrollment_audit_id_seq from public,anon,authenticated;
-- No public API/UI routes, tables grants, client functions or payment activity.
