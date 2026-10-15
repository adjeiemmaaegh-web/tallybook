-- TALLYBOOK V19 RUN 2 / STAGE 9 ROUND 1. REVIEW-ONLY. DO NOT APPLY TO PRODUCTION.
-- This is a proposed private schema, NOT an assertion that a restore drill passed.
-- A separately reviewed, authenticated human/backup verification workflow must
-- produce evidence. Neither browser IndexedDB nor account email proves ownership.
-- Pre-existing migration 20261014113009 / reviewer audit 20261014115304 already
-- exist in the named Supabase project: DO NOT REAPPLY THOSE MIGRATIONS.

-- Provision reviewers only through independently approved privileged operations.
-- No route, service or seed that creates an authorized reviewer is supplied here.
create table if not exists public.company_recovery_reviewers (
  user_id uuid primary key references auth.users(id),
  status text not null check (status in ('active','revoked')),
  authorized_by uuid not null references auth.users(id),
  authorized_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((status='active' and revoked_at is null) or (status='revoked' and revoked_at is not null)),
  check (user_id <> authorized_by)
);

-- External restoration review must bind both the original backup manifest and
-- independent restore-check receipt by a real reviewer, not submitted booleans.
-- Do NOT infer that SHA-256 strings alone prove backup or restore authenticity.
-- Provisioning requires two independently approved operators; this record is
-- inserted atomically with the reviewer by the private operator-only service.
create table if not exists public.company_recovery_reviewer_approvals (
  id uuid primary key,
  reviewer_id uuid not null references public.company_recovery_reviewers(user_id),
  operator_a uuid not null references auth.users(id),
  operator_b uuid not null references auth.users(id),
  approval_digest text not null check (approval_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  check (operator_a <> operator_b and reviewer_id <> operator_a and reviewer_id <> operator_b)
);

create table if not exists public.company_recovery_verified_evidence (
  id text primary key check (char_length(id) between 1 and 128),
  company_id uuid not null references public.businesses(id),
  owner_id uuid not null references auth.users(id),
  reviewer_id uuid not null references public.company_recovery_reviewers(user_id),
  kind text not null check (kind in ('verified-restore','approved-transfer')),
  requested_at timestamptz not null default now(),
  backup_artifact_id text check (char_length(backup_artifact_id) between 1 and 128),
  recipient_id uuid references auth.users(id),
  local_company_id text check (char_length(local_company_id) between 1 and 128),
  -- Evidence is UNVERIFIED by default; only a separately approved and audited
  -- human+restore verification process may promote pending -> verified.
  status text not null default 'pending' check (status in ('pending','verified','consumed','revoked')),
  verified_at timestamptz,
  check ((status='pending' and verified_at is null) or
         (status in ('verified','consumed') and verified_at is not null) or
         status='revoked'),
  backup_manifest_sha256 text,
  restore_receipt_sha256 text,
  transfer_review_sha256 text,
  check (reviewer_id <> owner_id),
  -- Transfer recipient must not be their own independent reviewer.
  check (recipient_id is null or reviewer_id <> recipient_id),
  constraint evidence_kind_fields check (
    (kind='verified-restore' and local_company_id is not null and recipient_id is null
      and backup_artifact_id is not null and transfer_review_sha256 is null)
    or (kind='approved-transfer' and recipient_id is not null and local_company_id is null
      and backup_artifact_id is null and backup_manifest_sha256 is null
      and restore_receipt_sha256 is null)
  ),
  constraint evidence_digest_lifecycle check (
    (status='pending' and backup_manifest_sha256 is null and
      restore_receipt_sha256 is null and transfer_review_sha256 is null)
    or (status in ('verified','consumed') and
      ((kind='verified-restore' and backup_manifest_sha256 ~ '^[a-f0-9]{64}$' and
        restore_receipt_sha256 ~ '^[a-f0-9]{64}$')
        or (kind='approved-transfer' and transfer_review_sha256 ~ '^[a-f0-9]{64}$')))
    or status='revoked'
  )
);
create table if not exists public.company_recovery_evidence_audit (
  id bigint generated always as identity primary key,
  evidence_id text not null references public.company_recovery_verified_evidence(id),
  company_id uuid not null references public.businesses(id),
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('requested','verified','revoked')),
  created_at timestamptz not null
);
create index if not exists company_recovery_evidence_company_status_idx
  on public.company_recovery_verified_evidence(company_id,status,verified_at);

alter table public.company_recovery_reviewer_approvals enable row level security;
alter table public.company_recovery_reviewer_approvals force row level security;
alter table public.company_recovery_evidence_audit enable row level security;
alter table public.company_recovery_evidence_audit force row level security;
alter table public.company_recovery_reviewers enable row level security;
alter table public.company_recovery_reviewers force row level security;
alter table public.company_recovery_verified_evidence enable row level security;
alter table public.company_recovery_verified_evidence force row level security;
revoke all on public.company_recovery_reviewer_approvals from public,anon,authenticated;
revoke all on public.company_recovery_evidence_audit from public,anon,authenticated;
revoke all on public.company_recovery_reviewers from public,anon,authenticated;
revoke all on public.company_recovery_verified_evidence from public,anon,authenticated;
-- No browser client access or public reviewer provisioning is authorized.
-- A real test-DB migration, privileges and rollback plan need separate approval.
