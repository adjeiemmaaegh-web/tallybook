-- Tallybook V19 Run 5: REVIEW-ONLY / disposable PostgreSQL test project.
-- NEVER apply to production or replay to the existing Supabase project.
-- Run 3 canonical businesses/business_members and its restrictive RLS are
-- prerequisites; review pg_policies and legacy RPC grants before execution.
-- Owner must explicitly authorize a disposable test project separately.
DO $$
BEGIN
  IF current_setting('tallybook.run5_disposable_approved',true)
       IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'RUN 5 SQL is for approved disposable tests only';
  END IF;
END $$;

-- One dedicated NOLOGIN role is GRANTed only to the trusted private server
-- connection role by an administrator outside this document. It is NOT an
-- anon/authenticated/service-role-key browser credential.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tallybook_run5_private') THEN
    CREATE ROLE tallybook_run5_private NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.company_tenant_records (
  company_id uuid NOT NULL REFERENCES public.businesses(id),
  collection text NOT NULL CHECK(collection IN (
    'catalog','inventory','orders','customers','sales','payments','suppliers',
    'purchases','expenses','receivables','wallet','staff','stores','assistant',
    'audit','products','sale-lines','ledger','reports','backups','sync')),
  record_id text NOT NULL CHECK (char_length(record_id) BETWEEN 1 AND 128),
  revision integer NOT NULL CHECK(revision>0),
  payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id,collection,record_id)
);
CREATE INDEX IF NOT EXISTS company_tenant_records_page_idx
  ON public.company_tenant_records(company_id,collection,record_id);

CREATE TABLE IF NOT EXISTS public.company_tenant_data_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.businesses(id),
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  operation text NOT NULL CHECK(operation IN
    ('read','write','delete','import','report','export','backup','assistant','sync')),
  collection text NOT NULL,
  record_id text,
  at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS company_tenant_audit_scope_idx
  ON public.company_tenant_data_audit(company_id,at,id);

ALTER TABLE public.company_tenant_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_tenant_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.company_tenant_data_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_tenant_data_audit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.company_tenant_records FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.company_tenant_data_audit FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.company_tenant_records FROM tallybook_run5_private;
REVOKE ALL ON public.company_tenant_data_audit FROM tallybook_run5_private;

-- The server *must* validate Supabase getUser(), live auth.sessions and
-- canonical membership within the SERIALIZABLE transaction before setting
-- these transaction-local GUCs. Browser roles have no access to either table.
-- This policy is not suitable for a role that clients can SET ROLE into.
DROP POLICY IF EXISTS run5_private_tenant_record_scope ON public.company_tenant_records;
CREATE POLICY run5_private_tenant_record_scope
  ON public.company_tenant_records FOR ALL TO tallybook_run5_private
  USING (
    company_id::text=current_setting('tallybook.run5_company_id',true)
    AND EXISTS (
      SELECT 1 FROM public.business_members m
      JOIN public.businesses b ON b.id=m.business_id
      WHERE m.business_id=company_id
        AND m.user_id::text=current_setting('tallybook.run5_actor_id',true)
        AND m.role IN ('owner','attendant')
        AND (m.role<>'owner' OR b.owner_id=m.user_id)
    )
  )
  WITH CHECK (
    company_id::text=current_setting('tallybook.run5_company_id',true)
    AND EXISTS (
      SELECT 1 FROM public.business_members m
      JOIN public.businesses b ON b.id=m.business_id
      WHERE m.business_id=company_id
        AND m.user_id::text=current_setting('tallybook.run5_actor_id',true)
        AND m.role='owner' AND b.owner_id=m.user_id
    )
  );
DROP POLICY IF EXISTS run5_private_tenant_audit_scope ON public.company_tenant_data_audit;
CREATE POLICY run5_private_tenant_audit_scope
  ON public.company_tenant_data_audit FOR INSERT TO tallybook_run5_private
  WITH CHECK (
    company_id::text=current_setting('tallybook.run5_company_id',true)
    AND actor_id::text=current_setting('tallybook.run5_actor_id',true)
  );

GRANT SELECT,INSERT,UPDATE,DELETE ON public.company_tenant_records TO tallybook_run5_private;
GRANT INSERT ON public.company_tenant_data_audit TO tallybook_run5_private;
GRANT USAGE ON SEQUENCE public.company_tenant_data_audit_id_seq TO tallybook_run5_private;
-- Explicitly NO UPDATE/DELETE grants for audit. No browser table privileges.
-- The private execution role must not own or bypass RLS. Validate the actual
-- auth.sessions, businesses and business_members read grants independently.

-- Disposable test-project checks (do not blindly trust policy definitions):
-- 1. Verify authenticated/anon CRUD on both tables returns 403/zero rows.
-- 2. Check private role without GUC returns zero rows, no writes.
-- 3. Check company A vs B and owner vs attendant against real accounts/RLS.
-- 4. Concurrent owner revoke/transfer must deny stale member after locks.
-- 5. SQL row-version clashes and audit errors must rollback fully.
-- 6. Validate all pre-existing local-only financial tables are NOT cloud
--    replicated through this schema; later Runs 6-14 own those invariants.
