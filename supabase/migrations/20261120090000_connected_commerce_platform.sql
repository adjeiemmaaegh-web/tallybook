-- Connected Commerce shared platform foundation (CC-X-01, 02, 03, 07, 08).
-- DEVELOPMENT ONLY: NOT applied to any hosted database. Applying it needs separate owner approval.
--
-- What this adds: per-merchant, per-track opt-in with versioned auditable consent; merchant feature
-- flags that are OFF by default; a platform kill switch; honest merchant verification states; an
-- idempotent owner RPC; a minimal-payload transactional outbox; an append-only audit trail.
-- What this does NOT add: any public listing, shopper identity, payment, messaging or financial
-- posting. Network tracks stay unreachable until a legally reviewed consent text is published AND the
-- owner opts in AND the flag is on AND the kill switch is clear.
BEGIN;

CREATE TABLE public.cc_consent_versions (
 track text NOT NULL CHECK(track IN ('discover','network','supply','clementia','passport')),
 version text NOT NULL CHECK(version ~ '^[A-Za-z0-9._-]{1,40}$'),
 text_sha256 text NOT NULL CHECK(text_sha256 ~ '^[a-f0-9]{64}$'),
 -- Counsel/legal review reference. A consent text without one cannot exist (CC-X-09 gate).
 legal_review_ref text NOT NULL CHECK(length(btrim(legal_review_ref)) BETWEEN 3 AND 200),
 is_current boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(track,version)
);
CREATE UNIQUE INDEX cc_consent_one_current ON public.cc_consent_versions(track) WHERE is_current;

CREATE TABLE public.cc_platform_kill_switch (
 track text PRIMARY KEY CHECK(track IN ('discover','network','supply','clementia','passport')),
 disabled boolean NOT NULL DEFAULT false,
 reason text CHECK(reason IS NULL OR length(reason)<=200),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.cc_merchant_flags (
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 track text NOT NULL CHECK(track IN ('discover','network','supply','clementia','passport')),
 enabled boolean NOT NULL DEFAULT false,
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(business_id,track)
);

CREATE TABLE public.cc_consent_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 track text NOT NULL,
 action text NOT NULL CHECK(action IN ('grant','revoke')),
 consent_version text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 operation_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business_id,operation_key),
 FOREIGN KEY(track,consent_version) REFERENCES public.cc_consent_versions(track,version)
);
CREATE INDEX cc_consent_events_latest ON public.cc_consent_events(business_id,track,id DESC);

CREATE TABLE public.cc_merchant_verification (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id),
 status text NOT NULL CHECK(status IN
   ('self_declared','documents_submitted','reviewed_verified','rejected','suspended')),
 declared_name text NOT NULL CHECK(length(btrim(declared_name)) BETWEEN 2 AND 120),
 evidence_ref text CHECK(evidence_ref IS NULL OR length(evidence_ref) BETWEEN 3 AND 200),
 submitted_by uuid NOT NULL REFERENCES auth.users(id),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reviewed_by uuid,
 reviewed_at timestamptz,
 review_note text CHECK(review_note IS NULL OR length(review_note)<=300),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 -- Only a recorded human review may produce any reviewed status; self-service never can.
 CHECK((status IN ('self_declared','documents_submitted'))=(reviewed_by IS NULL AND reviewed_at IS NULL)),
 CHECK(status<>'documents_submitted' OR evidence_ref IS NOT NULL)
);

CREATE TABLE public.cc_operation_keys (
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 operation_key uuid NOT NULL,
 action text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 PRIMARY KEY(business_id,operation_key)
);

-- Minimal, PII-free event payloads are enforced in the database, not by convention.
CREATE FUNCTION private.cc_payload_safe(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_typeof(p)='object'
   AND pg_column_size(p)<=1024
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k
     WHERE k NOT IN ('track','enabled','consentVersion','action','status','flagVersion'))
   AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE jsonb_typeof(e.value) NOT IN ('string','boolean','number'))
$$;

CREATE TABLE public.cc_outbox (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 event_type text NOT NULL CHECK(event_type IN
   ('cc.flag.changed.v1','cc.consent.changed.v1','cc.verification.changed.v1')),
 payload jsonb NOT NULL CHECK(private.cc_payload_safe(payload)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 published_at timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0)
);
CREATE INDEX cc_outbox_pending ON public.cc_outbox(id) WHERE published_at IS NULL;

CREATE TABLE public.cc_audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL CHECK(length(action) BETWEEN 3 AND 60),
 outcome text NOT NULL CHECK(outcome IN ('ok','replayed')),
 operation_key uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- Evidence tables are append-only: no update, delete or truncate, for anyone, including the table owner.
CREATE FUNCTION private.cc_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Connected Commerce evidence is append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER cc_consent_events_append_only BEFORE UPDATE OR DELETE ON public.cc_consent_events
 FOR EACH ROW EXECUTE FUNCTION private.cc_append_only();
CREATE TRIGGER cc_consent_events_no_truncate BEFORE TRUNCATE ON public.cc_consent_events
 FOR EACH STATEMENT EXECUTE FUNCTION private.cc_append_only();
CREATE TRIGGER cc_audit_events_append_only BEFORE UPDATE OR DELETE ON public.cc_audit_events
 FOR EACH ROW EXECUTE FUNCTION private.cc_append_only();
CREATE TRIGGER cc_audit_events_no_truncate BEFORE TRUNCATE ON public.cc_audit_events
 FOR EACH STATEMENT EXECUTE FUNCTION private.cc_append_only();

ALTER TABLE public.cc_consent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_consent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_platform_kill_switch ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_platform_kill_switch FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_merchant_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_merchant_flags FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_consent_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_merchant_verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_merchant_verification FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_operation_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_operation_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_audit_events FORCE ROW LEVEL SECURITY;
-- Deny by default: no policies exist, and no role can touch a table except through the RPC below.
REVOKE ALL ON TABLE public.cc_consent_versions,public.cc_platform_kill_switch,public.cc_merchant_flags,
 public.cc_consent_events,public.cc_merchant_verification,public.cc_operation_keys,
 public.cc_outbox,public.cc_audit_events FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.cc_verification_label(p_status text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_status
  WHEN 'self_declared' THEN 'Not reviewed (details declared by the owner)'
  WHEN 'documents_submitted' THEN 'Documents submitted, review pending'
  WHEN 'reviewed_verified' THEN 'Verified by Tallybook review'
  WHEN 'rejected' THEN 'Verification declined'
  WHEN 'suspended' THEN 'Verification suspended'
  ELSE 'Not submitted' END
$$;

CREATE FUNCTION private.cc_emit(p_company uuid,p_type text,p_payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 INSERT INTO public.cc_outbox(business_id,event_type,payload) VALUES(p_company,p_type,p_payload)
$$;

-- Effective state for ONE track. Every future Connected Commerce RPC must gate on this.
CREATE FUNCTION private.cc_track_state(p_company uuid,p_track text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_flag public.cc_merchant_flags;
 v_last public.cc_consent_events;
 v_current text;
 v_sha text;
 v_killed boolean;
 v_consent text:='none';
BEGIN
 SELECT * INTO v_flag FROM public.cc_merchant_flags WHERE business_id=p_company AND track=p_track;
 SELECT * INTO v_last FROM public.cc_consent_events
   WHERE business_id=p_company AND track=p_track ORDER BY id DESC LIMIT 1;
 SELECT version,text_sha256 INTO v_current,v_sha FROM public.cc_consent_versions WHERE track=p_track AND is_current;
 SELECT COALESCE(disabled,false) INTO v_killed FROM public.cc_platform_kill_switch WHERE track=p_track;
 v_killed:=COALESCE(v_killed,false);
 IF v_last.id IS NOT NULL THEN v_consent:=CASE WHEN v_last.action='grant' THEN 'granted' ELSE 'revoked' END; END IF;
 RETURN jsonb_build_object('track',p_track,'consent',v_consent,
   'consentVersion',CASE WHEN v_consent='granted' THEN v_last.consent_version END,
   'currentConsentVersion',v_current,
   -- The client may offer "accept" only for text it can display whose SHA-256 equals this value.
   'currentConsentSha256',v_sha,
   'flagEnabled',COALESCE(v_flag.enabled,false),'flagVersion',COALESCE(v_flag.version,0),
   'killed',v_killed,
   'effective',COALESCE(v_flag.enabled,false) AND v_consent='granted'
     AND v_current IS NOT NULL AND v_last.consent_version=v_current AND NOT v_killed);
END $$;

CREATE FUNCTION private.cc_track_enabled(p_company uuid,p_track text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT COALESCE((private.cc_track_state(p_company,p_track)->>'effective')::boolean,false)
$$;

CREATE FUNCTION private.cc_status(p_company uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ver public.cc_merchant_verification; v_tracks jsonb:='{}'::jsonb; t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['discover','network','supply','clementia','passport'] LOOP
  v_tracks:=v_tracks||jsonb_build_object(t,private.cc_track_state(p_company,t));
 END LOOP;
 SELECT * INTO v_ver FROM public.cc_merchant_verification WHERE business_id=p_company;
 RETURN jsonb_build_object('tracks',v_tracks,'verification',jsonb_build_object(
   'status',COALESCE(v_ver.status,'none'),
   'label',private.cc_verification_label(v_ver.status),
   'externallyVerified',COALESCE(v_ver.status='reviewed_verified',false),
   'declaredName',v_ver.declared_name,'version',COALESCE(v_ver.version,0)),
   'publicationDefault','off');
END $$;

CREATE FUNCTION private.cc_platform_action(
 p_action text,p_actor uuid,p_session uuid,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_company uuid;
 v_role text;
 v_track text;
 v_key uuid;
 v_hash text;
 v_prior public.cc_operation_keys;
 v_resp jsonb;
 v_version text;
 v_expected integer;
 v_enabled boolean;
 v_state jsonb;
 v_flag public.cc_merchant_flags;
 v_last public.cc_consent_events;
 v_ver public.cc_merchant_verification;
 v_name text;
 v_evidence text;
 v_status text;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023';
 END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF v_role<>'owner' THEN
  RAISE EXCEPTION 'CC:NOT_AUTHORIZED Only the business owner may manage Connected Commerce' USING ERRCODE='42501';
 END IF;
 IF p_action='status' THEN RETURN private.cc_status(v_company); END IF;
 IF p_action NOT IN ('grantConsent','revokeConsent','setFlag','submitVerification') THEN
  RAISE EXCEPTION 'Unknown Connected Commerce action' USING ERRCODE='22023';
 END IF;
 v_key:=private.shop_uuid(p_input,'operationKey');
 v_hash:=encode(sha256(convert_to(p_action||':'||(p_input-'operationKey')::text,'UTF8')),'hex');
 -- One writer per merchant at a time: replays and races both see a stable history.
 PERFORM pg_advisory_xact_lock(hashtextextended('cc:'||v_company::text,0));
 SELECT * INTO v_prior FROM public.cc_operation_keys WHERE business_id=v_company AND operation_key=v_key;
 IF FOUND THEN
  IF v_prior.request_hash<>v_hash OR v_prior.action<>p_action THEN
   RAISE EXCEPTION 'CC:CONFLICT This operation key was already used for a different request' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.cc_audit_events(business_id,actor_id,action,outcome,operation_key)
    VALUES(v_company,p_actor,p_action,'replayed',v_key);
  RETURN v_prior.response||jsonb_build_object('replayed',true);
 END IF;

 IF p_action IN ('grantConsent','revokeConsent','setFlag') THEN
  v_track:=p_input->>'track';
  IF v_track IS NULL OR v_track NOT IN ('discover','network','supply','clementia','passport') THEN
   RAISE EXCEPTION 'Invalid track' USING ERRCODE='22023';
  END IF;
 END IF;

 IF p_action='grantConsent' THEN
  v_version:=p_input->>'consentVersion';
  IF v_version IS NULL OR v_version !~ '^[A-Za-z0-9._-]{1,40}$' THEN
   RAISE EXCEPTION 'Invalid consentVersion' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cc_consent_versions WHERE track=v_track AND is_current) THEN
   RAISE EXCEPTION 'CC:REQUIRES_CONFIRMATION No reviewed consent text is published for this track yet' USING ERRCODE='42501';
  END IF;
  IF p_input->>'textSha256' IS NULL OR p_input->>'textSha256' !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION 'Invalid textSha256' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cc_consent_versions WHERE track=v_track AND version=v_version AND is_current
      AND text_sha256=p_input->>'textSha256') THEN
   RAISE EXCEPTION 'CC:STALE_VERSION The consent text has changed; review the current version' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.cc_consent_events(business_id,track,action,consent_version,actor_id,operation_key)
    VALUES(v_company,v_track,'grant',v_version,p_actor,v_key);
  PERFORM private.cc_emit(v_company,'cc.consent.changed.v1',
    jsonb_build_object('track',v_track,'action','grant','consentVersion',v_version));
 ELSIF p_action='revokeConsent' THEN
  SELECT * INTO v_last FROM public.cc_consent_events
    WHERE business_id=v_company AND track=v_track ORDER BY id DESC LIMIT 1;
  IF v_last.id IS NOT NULL AND v_last.action='grant' THEN
   INSERT INTO public.cc_consent_events(business_id,track,action,consent_version,actor_id,operation_key)
     VALUES(v_company,v_track,'revoke',v_last.consent_version,p_actor,v_key);
   PERFORM private.cc_emit(v_company,'cc.consent.changed.v1',
     jsonb_build_object('track',v_track,'action','revoke','consentVersion',v_last.consent_version));
  END IF;
  -- Revocation always switches the track off immediately, even if there was nothing to revoke.
  UPDATE public.cc_merchant_flags SET enabled=false,version=version+1,updated_by=p_actor,
    updated_at=clock_timestamp() WHERE business_id=v_company AND track=v_track AND enabled;
  IF FOUND THEN
   SELECT version INTO v_expected FROM public.cc_merchant_flags WHERE business_id=v_company AND track=v_track;
   PERFORM private.cc_emit(v_company,'cc.flag.changed.v1',
     jsonb_build_object('track',v_track,'enabled',false,'flagVersion',v_expected));
  END IF;
 ELSIF p_action='setFlag' THEN
  IF jsonb_typeof(p_input->'enabled') IS DISTINCT FROM 'boolean' THEN
   RAISE EXCEPTION 'Invalid enabled' USING ERRCODE='22023';
  END IF;
  v_enabled:=(p_input->>'enabled')::boolean;
  SELECT * INTO v_flag FROM public.cc_merchant_flags WHERE business_id=v_company AND track=v_track FOR UPDATE;
  IF p_input ? 'expectedVersion' THEN
   v_expected:=private.shop_int(p_input,'expectedVersion',0,2147483647);
   IF v_expected<>COALESCE(v_flag.version,0) THEN
    RAISE EXCEPTION 'CC:STALE_VERSION The setting changed elsewhere; reload and try again' USING ERRCODE='40001';
   END IF;
  END IF;
  IF v_enabled THEN
   v_state:=private.cc_track_state(v_company,v_track);
   IF (v_state->>'killed')::boolean THEN
    RAISE EXCEPTION 'CC:NOT_AVAILABLE This service is temporarily switched off by Tallybook' USING ERRCODE='42501';
   END IF;
   IF v_state->>'consent'<>'granted' OR v_state->>'consentVersion' IS DISTINCT FROM v_state->>'currentConsentVersion' THEN
    RAISE EXCEPTION 'CC:REQUIRES_CONFIRMATION Accept the current consent before turning this on' USING ERRCODE='42501';
   END IF;
  END IF;
  INSERT INTO public.cc_merchant_flags(business_id,track,enabled,updated_by)
    VALUES(v_company,v_track,v_enabled,p_actor)
   ON CONFLICT(business_id,track) DO UPDATE SET enabled=EXCLUDED.enabled,
     version=public.cc_merchant_flags.version+1,updated_by=p_actor,updated_at=clock_timestamp()
   RETURNING * INTO v_flag;
  PERFORM private.cc_emit(v_company,'cc.flag.changed.v1',
    jsonb_build_object('track',v_track,'enabled',v_enabled,'flagVersion',v_flag.version));
 ELSE
  v_name:=btrim(COALESCE(p_input->>'declaredName',''));
  IF length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[\x00-\x1f\x7f]' THEN
   RAISE EXCEPTION 'Invalid declaredName' USING ERRCODE='22023';
  END IF;
  v_evidence:=NULLIF(btrim(COALESCE(p_input->>'evidenceRef','')),'');
  IF v_evidence IS NOT NULL AND (length(v_evidence) NOT BETWEEN 3 AND 200 OR v_evidence ~ '[\x00-\x1f\x7f]') THEN
   RAISE EXCEPTION 'Invalid evidenceRef' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_ver FROM public.cc_merchant_verification WHERE business_id=v_company FOR UPDATE;
  IF v_ver.status='suspended' THEN
   RAISE EXCEPTION 'CC:NOT_AUTHORIZED Verification is suspended; contact Tallybook support' USING ERRCODE='42501';
  END IF;
  -- Owner input can only ever produce an UNREVIEWED state. Editing a reviewed record voids the review.
  v_status:=CASE WHEN v_evidence IS NULL THEN 'self_declared' ELSE 'documents_submitted' END;
  INSERT INTO public.cc_merchant_verification(business_id,status,declared_name,evidence_ref,submitted_by)
    VALUES(v_company,v_status,v_name,v_evidence,p_actor)
   ON CONFLICT(business_id) DO UPDATE SET status=EXCLUDED.status,declared_name=EXCLUDED.declared_name,
     evidence_ref=EXCLUDED.evidence_ref,submitted_by=p_actor,submitted_at=clock_timestamp(),
     reviewed_by=NULL,reviewed_at=NULL,review_note=NULL,
     version=public.cc_merchant_verification.version+1;
  PERFORM private.cc_emit(v_company,'cc.verification.changed.v1',jsonb_build_object('status',v_status));
 END IF;

 v_resp:=private.cc_status(v_company)||jsonb_build_object('replayed',false);
 INSERT INTO public.cc_operation_keys(business_id,operation_key,action,request_hash,response)
   VALUES(v_company,v_key,p_action,v_hash,v_resp);
 INSERT INTO public.cc_audit_events(business_id,actor_id,action,outcome,operation_key)
   VALUES(v_company,p_actor,p_action,'ok',v_key);
 RETURN v_resp;
END $fn$;

REVOKE ALL ON FUNCTION private.cc_platform_action(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.cc_track_state(uuid,text),private.cc_track_enabled(uuid,text),
 private.cc_status(uuid),private.cc_emit(uuid,text,jsonb),private.cc_verification_label(text),
 private.cc_payload_safe(jsonb),private.cc_append_only() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tallybook_cc_platform(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid;
 EXCEPTION WHEN others THEN sid:=null;END;
 RETURN private.cc_platform_action(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_cc_platform(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_cc_platform(text,jsonb) TO authenticated;
COMMIT;
