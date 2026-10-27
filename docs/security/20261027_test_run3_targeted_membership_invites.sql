-- Tallybook V19 Run3 migration, applied ONLY to disposable Supabase project
-- lmneuqxfyxplrxjswpma as version 20261027132708.
-- This file is an exact source-equivalent, replay record. DO NOT replay against
-- production or reapply to the same test DB. It is NOT a production migration.
DO $safety$
BEGIN
  IF to_regclass('public.company_member_invites') IS NOT NULL
     OR to_regclass('public.company_membership_audit') IS NOT NULL THEN
    RAISE EXCEPTION 'Run3 invitation tables already exist; review manually';
  END IF;
END $safety$;
CREATE TABLE public.company_member_invites (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.businesses(id),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  token_sha256 text NOT NULL UNIQUE CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  CHECK (target_user_id <> invited_by),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '15 minutes'),
  CHECK ((status = 'pending' AND closed_at IS NULL)
       OR (status <> 'pending' AND closed_at IS NOT NULL))
);
CREATE INDEX company_member_invites_scope_idx
  ON public.company_member_invites (company_id,target_user_id,status,expires_at);
CREATE TABLE public.company_membership_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.businesses(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid NOT NULL REFERENCES auth.users(id),
  event_type text NOT NULL
    CHECK (event_type IN ('invited','accepted','member-revoked','invite-revoked')),
  invitation_id uuid REFERENCES public.company_member_invites(id),
  event_at timestamptz NOT NULL
);
CREATE INDEX company_membership_audit_company_idx
  ON public.company_membership_audit (company_id,event_at,id);
ALTER TABLE public.company_member_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_member_invites FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_membership_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_membership_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_member_invites FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.company_membership_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON SEQUENCE public.company_membership_audit_id_seq FROM PUBLIC,anon,authenticated;
-- Disposable test project only: disable direct assignment/grant/removal bypass.
-- Keep create_owned_business and canonical member-business SELECT RLS unchanged.
REVOKE EXECUTE ON FUNCTION public.add_business_attendant(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.remove_business_attendant(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION private.add_business_attendant(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION private.remove_business_attendant(uuid,uuid) FROM PUBLIC,anon,authenticated;
