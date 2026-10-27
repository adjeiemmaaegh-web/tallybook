-- Additive isolated-test extension to CENTRAL_SALE_UUID_BASELINE_ISOLATED_SCHEMA.sql.
-- Do not apply to the connected live project before full migration review.
create table public.company_device_grants (
 id uuid primary key,
 company_id uuid not null,
 store_id text not null,
 user_id uuid not null,
 status text not null check (status in ('active','revoked')),
 created_at timestamptz not null,
 expires_at timestamptz not null check (expires_at>created_at),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);
create table public.company_device_enrollment_invites (
 id uuid primary key,
 company_id uuid not null,
 store_id text not null,
 target_user_id uuid not null,
 issued_by uuid not null,
 token_digest text not null unique check (token_digest ~ '^[0-9a-f]{64}$'),
 status text not null default 'unused' check (status in ('unused','used','revoked')),
 created_at timestamptz not null,
 expires_at timestamptz not null check (expires_at>created_at),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,target_user_id) references public.business_members(business_id,user_id) on delete cascade,
 foreign key (company_id,issued_by) references public.business_members(business_id,user_id) on delete cascade
);
create table public.company_device_enrollment_audit (
 id bigint generated always as identity primary key,
 action text not null check (action in ('device.invite.issued','device.grant.issued',
   'device.grant.revoked','device.key.enrolled','device.key.revoked')),
 company_id uuid not null references public.businesses(id),
 store_id text not null,
 actor_id uuid not null,
 target_user_id uuid not null,
 grant_id uuid,
 invite_id uuid,
 event_at timestamptz not null,
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id)
);
create index company_device_enrollment_audit_company
 on public.company_device_enrollment_audit(company_id,event_at desc);
alter table public.company_device_grants enable row level security;
alter table public.company_device_enrollment_invites enable row level security;
alter table public.company_device_enrollment_audit enable row level security;
revoke all on public.company_device_grants,public.company_device_enrollment_invites,
 public.company_device_enrollment_audit from public,anon,authenticated;
revoke all on sequence public.company_device_enrollment_audit_id_seq from public,anon,authenticated;
