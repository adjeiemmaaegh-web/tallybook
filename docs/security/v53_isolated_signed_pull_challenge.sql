-- V53: ISOLATED QA PROJECT lmneuqxfyxplrxjswpma ONLY.
-- Do not apply to production qfyydfxwvifdvffdfgeu.
-- One-use, 60-second challenge for possession of an owner-approved device key.
DO $guard$
BEGIN
 IF to_regclass('public.company_device_keys') IS NULL
    OR to_regclass('public.company_device_grants') IS NULL
    OR to_regclass('public.company_signed_sale_events') IS NULL
    OR to_regclass('auth.sessions') IS NULL
    OR to_regprocedure('public.run3_qa_pull_sales(uuid,uuid,uuid,text,timestamp with time zone,text)') IS NULL
 THEN RAISE EXCEPTION 'V53 isolated QA prerequisites missing'; END IF;
 IF to_regclass('public.company_sale_pull_challenges') IS NOT NULL
 THEN RAISE EXCEPTION 'V53 challenge table already exists; review before replay'; END IF;
END $guard$;

CREATE TABLE public.company_sale_pull_challenges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 session_id uuid NOT NULL,
 company_id uuid NOT NULL,
 device_id text NOT NULL,
 nonce_sha256 char(64) NOT NULL CHECK (nonce_sha256 ~ '^[a-f0-9]{64}$'),
 public_key_spki_pem text NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 CONSTRAINT pull_challenge_expiry CHECK (expires_at>issued_at AND expires_at<=issued_at+interval '60 seconds')
);
CREATE INDEX company_sale_pull_challenges_pending_idx
 ON public.company_sale_pull_challenges(actor_id,session_id,company_id,device_id,expires_at)
 WHERE consumed_at IS NULL;
ALTER TABLE public.company_sale_pull_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.company_sale_pull_challenges FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.company_sale_pull_challenges TO service_role;

CREATE FUNCTION public.run3_qa_issue_sale_pull_challenge(
 p_actor uuid,p_session uuid,p_company uuid,p_device text,p_nonce_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 at_time timestamptz := clock_timestamp();
 membership_role text;
 device_key text;
 new_id uuid;
 open_count integer;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_company IS NULL OR
    p_device IS NULL OR p_device !~ '^[A-Za-z0-9:_-]{1,128}$' OR
    p_nonce_hash IS NULL OR p_nonce_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Pull challenge denied' USING ERRCODE='42501'; END IF;

 PERFORM 1 FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_actor
   AND (s.not_after IS NULL OR s.not_after>at_time) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;

 SELECT m.role INTO membership_role FROM public.business_members m
 JOIN public.businesses b ON b.id=m.business_id
 WHERE m.business_id=p_company AND m.user_id=p_actor
   AND ((m.role='owner' AND b.owner_id=p_actor) OR
        (m.role='attendant' AND b.owner_id<>p_actor));
 IF membership_role IS NULL THEN RAISE EXCEPTION 'Membership required' USING ERRCODE='42501'; END IF;

 -- Lock the active device row so concurrent challenges cannot evade the cap.
 SELECT d.public_key_spki_pem INTO device_key
 FROM public.company_device_keys d
 JOIN public.company_store_scopes st
   ON st.company_id=d.company_id AND st.id=d.store_id AND st.status='active'
 JOIN public.company_staff_identities staff
   ON staff.company_id=d.company_id AND staff.id=d.staff_id
     AND staff.user_id=p_actor AND staff.active IS TRUE
 JOIN public.company_staff_store_assignments a
   ON a.company_id=d.company_id AND a.store_id=d.store_id
     AND a.staff_id=d.staff_id AND a.active IS TRUE
 WHERE d.company_id=p_company AND d.id=p_device AND d.user_id=p_actor
   AND d.status='active' AND EXISTS(
     SELECT 1 FROM public.company_device_grants g
     WHERE g.company_id=d.company_id AND g.store_id=d.store_id
       AND g.user_id=p_actor AND g.status='active' AND g.expires_at>at_time)
 FOR UPDATE OF d;
 IF device_key IS NULL OR char_length(device_key)>2048
 THEN RAISE EXCEPTION 'Approved device required' USING ERRCODE='42501'; END IF;

 SELECT count(*)::integer INTO open_count FROM public.company_sale_pull_challenges c
 WHERE c.actor_id=p_actor AND c.session_id=p_session AND c.company_id=p_company
   AND c.device_id=p_device AND c.consumed_at IS NULL AND c.expires_at>at_time;
 IF open_count>=5 THEN RAISE EXCEPTION 'Too many pending pull challenges' USING ERRCODE='42501'; END IF;

 INSERT INTO public.company_sale_pull_challenges
   (actor_id,session_id,company_id,device_id,nonce_sha256,public_key_spki_pem,issued_at,expires_at)
 VALUES(p_actor,p_session,p_company,p_device,p_nonce_hash,device_key,at_time,
   at_time+interval '60 seconds') RETURNING id INTO new_id;
 RETURN jsonb_build_object('companyId',p_company,'deviceId',p_device,
   'challengeId',new_id,'expiresAtEpochMs',
   floor(extract(epoch FROM at_time+interval '60 seconds')*1000)::bigint);
END $function$;

CREATE FUNCTION public.run3_qa_consume_sale_pull_challenge(
 p_actor uuid,p_session uuid,p_company uuid,p_device text,
 p_challenge uuid,p_nonce_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 at_time timestamptz := clock_timestamp();
 held record;
 current_key text;
BEGIN
 IF p_actor IS NULL OR p_session IS NULL OR p_company IS NULL OR p_challenge IS NULL OR
    p_device IS NULL OR p_device !~ '^[A-Za-z0-9:_-]{1,128}$' OR
    p_nonce_hash IS NULL OR p_nonce_hash !~ '^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'Pull proof denied' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM auth.sessions s WHERE s.id=p_session AND s.user_id=p_actor
   AND (s.not_after IS NULL OR s.not_after>at_time) FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active session required' USING ERRCODE='42501'; END IF;
 SELECT * INTO held FROM public.company_sale_pull_challenges c
 WHERE c.id=p_challenge FOR UPDATE;
 IF NOT FOUND OR held.actor_id<>p_actor OR held.session_id<>p_session OR
    held.company_id<>p_company OR held.device_id<>p_device OR
    held.nonce_sha256<>p_nonce_hash OR held.consumed_at IS NOT NULL OR
    held.expires_at<=at_time
 THEN RAISE EXCEPTION 'Pull challenge unavailable' USING ERRCODE='42501'; END IF;
 SELECT d.public_key_spki_pem INTO current_key FROM public.company_device_keys d
 WHERE d.company_id=p_company AND d.id=p_device AND d.user_id=p_actor
   AND d.status='active' FOR SHARE;
 IF current_key IS NULL OR current_key<>held.public_key_spki_pem
 THEN RAISE EXCEPTION 'Device key changed or revoked' USING ERRCODE='42501'; END IF;
 UPDATE public.company_sale_pull_challenges SET consumed_at=at_time
 WHERE id=p_challenge AND consumed_at IS NULL;
 RETURN jsonb_build_object('publicKeySpkiPem',held.public_key_spki_pem);
END $function$;

REVOKE ALL ON FUNCTION public.run3_qa_issue_sale_pull_challenge(uuid,uuid,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.run3_qa_consume_sale_pull_challenge(uuid,uuid,uuid,text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run3_qa_issue_sale_pull_challenge(uuid,uuid,uuid,text,text)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.run3_qa_consume_sale_pull_challenge(uuid,uuid,uuid,text,uuid,text)
 TO service_role;
