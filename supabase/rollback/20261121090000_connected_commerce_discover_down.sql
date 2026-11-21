-- Removes Discover ONLY while it holds no shopper requests, owner-published profiles/listings or Discover audit/outbox evidence.
-- Shopper requests contain personal data and audit rows are evidence: fail closed, use a forward repair instead.
BEGIN;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.cc_discover_requests)
    OR EXISTS(SELECT 1 FROM public.cc_discover_profiles)
    OR EXISTS(SELECT 1 FROM public.cc_discover_listings)
    OR EXISTS(SELECT 1 FROM public.cc_outbox WHERE event_type LIKE 'cc.discover.%')
    OR EXISTS(SELECT 1 FROM public.cc_audit_events WHERE action LIKE 'discover.%')
    OR EXISTS(SELECT 1 FROM public.cc_operation_keys WHERE action LIKE 'discover.%') THEN
  RAISE EXCEPTION 'Discover data exists; use a forward repair (kill switch + corrective migration), not a rollback';
 END IF;
END $$;
DROP FUNCTION public.tallybook_cc_discover_public(text,jsonb);
DROP FUNCTION public.tallybook_cc_discover(text,jsonb);
DROP FUNCTION private.cc_discover_public_action(text,jsonb);
DROP FUNCTION private.cc_discover_owner_action(text,uuid,uuid,jsonb);
DROP TABLE public.cc_discover_requests,public.cc_discover_listings,public.cc_discover_profiles;
ALTER TABLE public.cc_outbox DROP CONSTRAINT cc_outbox_event_type_check;
ALTER TABLE public.cc_outbox ADD CONSTRAINT cc_outbox_event_type_check CHECK(event_type IN
 ('cc.flag.changed.v1','cc.consent.changed.v1','cc.verification.changed.v1'));
CREATE OR REPLACE FUNCTION private.cc_payload_safe(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_typeof(p)='object'
   AND pg_column_size(p)<=1024
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k
     WHERE k NOT IN ('track','enabled','consentVersion','action','status','flagVersion'))
   AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE jsonb_typeof(e.value) NOT IN ('string','boolean','number'))
$$;
COMMIT;
