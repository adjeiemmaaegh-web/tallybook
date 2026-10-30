-- V50: read-only sale event pull, ISOLATED QA PROJECT lmneuqxfyxplrxjswpma ONLY.
-- Deliberately does NOT enable automatic upload or public Data API read grants.
-- Use only after signed-sale ingestion and device enrollment test verification.
DO $guard$
BEGIN
 IF to_regclass('public.company_signed_sale_events') IS NULL
  OR to_regclass('public.company_device_keys') IS NULL
  OR to_regclass('public.company_device_grants') IS NULL
  OR to_regclass('public.company_staff_store_assignments') IS NULL
 THEN RAISE EXCEPTION 'QA signed-event prerequisites unavailable'; END IF;
 IF to_regprocedure('public.run3_qa_pull_sales(uuid,uuid,uuid,text,timestamp with time zone,text)') IS NOT NULL
 THEN RAISE EXCEPTION 'QA pull function exists; do not replay blindly'; END IF;
END $guard$;

CREATE FUNCTION public.run3_qa_pull_sales(
 p_actor uuid, p_session uuid, p_company uuid, p_device text,
 p_after timestamptz DEFAULT 'epoch'::timestamptz,
 p_after_operation text DEFAULT ''
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 observed_at timestamptz := clock_timestamp();
 membership_role text;
 scope_store text;
 scope_staff text;
 item_count integer;
 batch jsonb;
 next_time timestamptz;
 next_op text;
 more_available boolean;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_company IS NULL OR
    p_device IS NULL OR p_device !~ '^[A-Za-z0-9:_-]{1,128}$' OR
    p_after IS NULL OR p_after_operation IS NULL OR char_length(p_after_operation)>128
 THEN RAISE EXCEPTION 'Sale pull denied' USING ERRCODE='42501'; END IF;

 PERFORM 1 FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_actor
    AND (s.not_after IS NULL OR s.not_after>observed_at)
 FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sale pull session revoked' USING ERRCODE='42501'; END IF;

 SELECT m.role INTO membership_role FROM public.business_members m
   JOIN public.businesses b ON b.id=m.business_id
   WHERE m.business_id=p_company AND m.user_id=p_actor
     AND m.role IN ('owner','attendant') AND
     ((m.role='owner' AND b.owner_id=p_actor) OR
      (m.role='attendant' AND b.owner_id<>p_actor));
 IF membership_role IS NULL THEN
   RAISE EXCEPTION 'Company membership absent' USING ERRCODE='42501'; END IF;

 -- An account alone is not sufficient: require owner-approved device key,
 -- locally mapped staff, active store assignment, and current device grant.
 SELECT d.store_id,d.staff_id INTO scope_store,scope_staff
 FROM public.company_device_keys d
 JOIN public.company_store_scopes store
  ON store.company_id=d.company_id AND store.id=d.store_id AND store.status='active'
 JOIN public.company_staff_identities staff
  ON staff.company_id=d.company_id AND staff.id=d.staff_id
    AND staff.user_id=p_actor AND staff.active IS TRUE
 JOIN public.company_staff_store_assignments a
  ON a.company_id=d.company_id AND a.store_id=d.store_id
    AND a.staff_id=d.staff_id AND a.active IS TRUE
 WHERE d.company_id=p_company AND d.id=p_device
   AND d.user_id=p_actor AND d.status='active'
   AND EXISTS(SELECT 1 FROM public.company_device_grants g
      WHERE g.company_id=d.company_id AND g.store_id=d.store_id
      AND g.user_id=p_actor AND g.status='active'
      AND g.expires_at>observed_at)
 FOR SHARE OF d,store,staff,a;
 IF scope_store IS NULL OR scope_staff IS NULL
 THEN RAISE EXCEPTION 'Device not provisioned' USING ERRCODE='42501'; END IF;

 -- Stable composite cursor: timestamp alone may produce duplicates or drops.
 -- The 11th row only determines whether another 10-event page is available.
 WITH page AS MATERIALIZED (
   SELECT e.operation_id,e.event_id,e.store_id,e.staff_id,e.actor_id,
     e.payload_sha256,e.payload,e.evidence_status,e.received_at_utc
   FROM public.company_signed_sale_events e
   WHERE e.company_id=p_company AND e.store_id=scope_store
     AND (membership_role='owner' OR e.actor_id=p_actor)
     AND (e.received_at_utc,e.operation_id COLLATE "C")
       >(p_after,p_after_operation COLLATE "C")
   ORDER BY e.received_at_utc,e.operation_id COLLATE "C"
   LIMIT 11
 ), indexed AS (
   SELECT row_number() OVER(ORDER BY received_at_utc,operation_id COLLATE "C") AS rn,
      operation_id,event_id,store_id,staff_id,actor_id,
      payload_sha256,payload,evidence_status,received_at_utc FROM page
 )
 SELECT count(*)::integer,
  COALESCE(jsonb_agg(jsonb_build_object(
   'operationId',operation_id,'eventId',event_id,
   'storeId',store_id,'staffId',staff_id,'actorId',actor_id,
   'payloadSha256',btrim(payload_sha256),'payload',payload,
   'evidenceStatus',evidence_status,'receivedAtUtc',received_at_utc
  ) ORDER BY received_at_utc,operation_id COLLATE "C") FILTER (WHERE rn<=10),'[]'::jsonb),
  max(received_at_utc) FILTER (WHERE rn<=10),
  (array_agg(operation_id ORDER BY received_at_utc DESC,operation_id COLLATE "C" DESC)
    FILTER (WHERE rn<=10))[1]
 INTO item_count,batch,next_time,next_op
 FROM indexed;

 more_available := item_count>10;
 RETURN jsonb_build_object(
  'companyId',p_company,'deviceId',p_device,'storeId',scope_store,
  'events',batch,'hasMore',more_available,'nextReceivedAtUtc',next_time,
  'nextOperationId',next_op);
END $function$;
REVOKE ALL ON FUNCTION public.run3_qa_pull_sales(
 uuid,uuid,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run3_qa_pull_sales(
 uuid,uuid,uuid,text,timestamptz,text) TO service_role;
