-- ST28-03: provider-INDEPENDENT durable payment settlement ledger. DEVELOPMENT ONLY: NOT applied to any hosted database.
-- No provider is approved and no money moves here. This records provider-reported facts immutably, applies them through a
-- strict state machine, and proves intent state == replay of its applied events (reconciliation). Service-role only writes.
BEGIN;

CREATE TABLE public.payment_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 submission_key uuid NOT NULL,
 order_ref text CHECK(order_ref IS NULL OR length(order_ref) BETWEEN 1 AND 100),
 provider text NOT NULL CHECK(provider ~ '^[a-z0-9_-]{2,40}$'),
 method text NOT NULL CHECK(method IN ('mobile','card')),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000000000),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','unknown','succeeded','failed','partially_reversed','refunded','charged_back','needs_review')),
 captured_minor bigint NOT NULL DEFAULT 0 CHECK(captured_minor>=0),
 refunded_minor bigint NOT NULL DEFAULT 0 CHECK(refunded_minor>=0),
 charged_back_minor bigint NOT NULL DEFAULT 0 CHECK(charged_back_minor>=0),
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business_id,submission_key),
 CHECK(refunded_minor+charged_back_minor<=captured_minor),
 CHECK(captured_minor=0 OR captured_minor=amount_minor)
);

CREATE TABLE public.payment_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 intent_id uuid NOT NULL REFERENCES public.payment_intents(id),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 provider text NOT NULL,
 provider_event_id text NOT NULL CHECK(length(provider_event_id) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('succeeded','failed','unknown','refund','chargeback','chargeback_reversed')),
 amount_minor bigint CHECK(amount_minor IS NULL OR amount_minor>0),
 event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'),
 occurred_at timestamptz,
 outcome text NOT NULL CHECK(outcome IN ('applied','rejected')),
 reason text CHECK(reason IS NULL OR length(reason)<=200),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(provider,provider_event_id),
 CHECK((outcome='rejected')=(reason IS NOT NULL))
);
CREATE INDEX payment_events_intent ON public.payment_events(intent_id,id);

CREATE FUNCTION private.payment_append_only() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Payment events are append-only' USING ERRCODE='42501'; END $$;
CREATE TRIGGER payment_events_append_only BEFORE UPDATE OR DELETE ON public.payment_events FOR EACH ROW EXECUTE FUNCTION private.payment_append_only();
CREATE TRIGGER payment_events_no_truncate BEFORE TRUNCATE ON public.payment_events FOR EACH STATEMENT EXECUTE FUNCTION private.payment_append_only();

-- Intent rows only change through the state machine below: block direct identity edits and any delete.
CREATE FUNCTION private.payment_intent_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Payment intents cannot be deleted' USING ERRCODE='42501'; END IF;
 IF NEW.business_id<>OLD.business_id OR NEW.submission_key<>OLD.submission_key OR NEW.amount_minor<>OLD.amount_minor
    OR NEW.currency<>OLD.currency OR NEW.provider<>OLD.provider OR NEW.method<>OLD.method THEN
  RAISE EXCEPTION 'Payment intent identity is immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER payment_intents_guard BEFORE UPDATE OR DELETE ON public.payment_intents FOR EACH ROW EXECUTE FUNCTION private.payment_intent_guard();

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY; ALTER TABLE public.payment_intents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY; ALTER TABLE public.payment_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.payment_intents,public.payment_events FROM PUBLIC,anon,authenticated;

-- Pure state machine: returns the new (status,captured,refunded,charged_back) or a rejection reason.
CREATE FUNCTION private.payment_next(p_status text,p_amount bigint,p_captured bigint,p_refunded bigint,p_cb bigint,p_kind text,p_event_amount bigint,
 OUT o_status text,OUT o_captured bigint,OUT o_refunded bigint,OUT o_cb bigint,OUT o_reason text)
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_net bigint;
BEGIN
 o_status:=p_status;o_captured:=p_captured;o_refunded:=p_refunded;o_cb:=p_cb;o_reason:=NULL;
 IF p_kind='succeeded' THEN
  IF p_status NOT IN ('pending','unknown') THEN o_reason:='invalid_transition'; RETURN; END IF;
  IF p_event_amount IS DISTINCT FROM p_amount THEN o_reason:='amount_mismatch'; RETURN; END IF;
  o_status:='succeeded';o_captured:=p_amount;
 ELSIF p_kind='failed' THEN
  IF p_status NOT IN ('pending','unknown') THEN o_reason:='invalid_transition'; RETURN; END IF; o_status:='failed';
 ELSIF p_kind='unknown' THEN
  IF p_status<>'pending' THEN o_reason:='invalid_transition'; RETURN; END IF; o_status:='unknown';
 ELSIF p_kind IN ('refund','chargeback') THEN
  IF p_status NOT IN ('succeeded','partially_reversed') THEN o_reason:='invalid_transition'; RETURN; END IF;
  IF p_event_amount IS NULL OR p_event_amount>p_captured-p_refunded-p_cb THEN o_reason:='exceeds_remaining'; RETURN; END IF;
  IF p_kind='refund' THEN o_refunded:=p_refunded+p_event_amount; ELSE o_cb:=p_cb+p_event_amount; END IF;
 ELSIF p_kind='chargeback_reversed' THEN
  IF p_event_amount IS NULL OR p_event_amount>p_cb THEN o_reason:='exceeds_chargeback'; RETURN; END IF;
  o_cb:=p_cb-p_event_amount;
 ELSE o_reason:='unknown_kind'; RETURN; END IF;
 IF p_kind IN ('refund','chargeback','chargeback_reversed') THEN
  v_net:=o_captured-o_refunded-o_cb;
  o_status:=CASE WHEN v_net=0 AND o_cb>0 THEN 'charged_back' WHEN v_net=0 THEN 'refunded'
                 WHEN o_refunded+o_cb>0 THEN 'partially_reversed' ELSE 'succeeded' END;
 END IF;
END $$;

CREATE FUNCTION private.payment_action(p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_biz uuid; v_key uuid; v_hash text; v_i public.payment_intents; v_e public.payment_events; v_n record;
 v_provider text; v_pid text; v_kind text; v_amt bigint; v_occ timestamptz; v_ehash text; v_reason text;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 v_biz:=private.shop_uuid(p_input,'companyId');
 IF NOT EXISTS(SELECT 1 FROM public.businesses WHERE id=v_biz) THEN RAISE EXCEPTION 'Business not found' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('pay:'||v_biz::text,0));

 IF p_action='createIntent' THEN
  v_key:=private.shop_uuid(p_input,'submissionKey');
  v_hash:=encode(sha256(convert_to((p_input-'submissionKey')::text,'UTF8')),'hex');
  SELECT * INTO v_i FROM public.payment_intents WHERE business_id=v_biz AND submission_key=v_key;
  IF FOUND THEN
   IF v_i.request_hash<>v_hash THEN RAISE EXCEPTION 'PAY:CONFLICT Submission key reused with different details' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('intentId',v_i.id,'status',v_i.status,'replayed',true);
  END IF;
  INSERT INTO public.payment_intents(business_id,submission_key,order_ref,provider,method,currency,amount_minor,request_hash)
   VALUES(v_biz,v_key,NULLIF(p_input->>'orderRef',''),p_input->>'provider',p_input->>'method',p_input->>'currency',
          private.shop_int(p_input,'amountMinor',1,100000000000000),v_hash) RETURNING * INTO v_i;
  RETURN jsonb_build_object('intentId',v_i.id,'status',v_i.status,'replayed',false);
 END IF;

 IF p_action='ingest' THEN
  v_provider:=p_input->>'provider'; v_pid:=p_input->>'providerEventId'; v_kind:=p_input->>'kind';
  IF v_provider IS NULL OR v_pid IS NULL OR length(v_pid) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid event identity' USING ERRCODE='22023'; END IF;
  IF v_kind IS NULL OR v_kind NOT IN ('succeeded','failed','unknown','refund','chargeback','chargeback_reversed') THEN RAISE EXCEPTION 'Invalid event kind' USING ERRCODE='22023'; END IF;
  IF p_input ? 'amountMinor' AND jsonb_typeof(p_input->'amountMinor')<>'null' THEN v_amt:=private.shop_int(p_input,'amountMinor',1,100000000000000); END IF;
  BEGIN v_occ:=(p_input->>'occurredAt')::timestamptz; EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid occurredAt' USING ERRCODE='22023'; END;
  v_ehash:=encode(sha256(convert_to(concat_ws('|',private.shop_uuid(p_input,'intentId'),v_provider,v_kind,COALESCE(v_amt::text,'')),'UTF8')),'hex');
  SELECT * INTO v_e FROM public.payment_events WHERE provider=v_provider AND provider_event_id=v_pid;
  IF FOUND THEN
   IF v_e.event_hash<>v_ehash OR v_e.business_id<>v_biz THEN RAISE EXCEPTION 'PAY:CONFLICT Provider event id reused with different content' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('outcome',v_e.outcome,'reason',v_e.reason,'replayed',true);
  END IF;
  SELECT * INTO v_i FROM public.payment_intents WHERE id=private.shop_uuid(p_input,'intentId') AND business_id=v_biz AND provider=v_provider FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAY:NOT_FOUND Payment not found for this business and provider' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_n FROM private.payment_next(v_i.status,v_i.amount_minor,v_i.captured_minor,v_i.refunded_minor,v_i.charged_back_minor,v_kind,v_amt);
  v_reason:=v_n.o_reason;
  INSERT INTO public.payment_events(intent_id,business_id,provider,provider_event_id,kind,amount_minor,event_hash,occurred_at,outcome,reason)
   VALUES(v_i.id,v_biz,v_provider,v_pid,v_kind,v_amt,v_ehash,v_occ,CASE WHEN v_reason IS NULL THEN 'applied' ELSE 'rejected' END,v_reason);
  IF v_reason IS NULL THEN
   UPDATE public.payment_intents SET status=v_n.o_status,captured_minor=v_n.o_captured,refunded_minor=v_n.o_refunded,charged_back_minor=v_n.o_cb,
     version=version+1,updated_at=clock_timestamp() WHERE id=v_i.id RETURNING * INTO v_i;
  ELSIF v_reason='amount_mismatch' THEN
   -- A success for a different amount than we asked for is never silently accepted: hold for a human.
   UPDATE public.payment_intents SET status='needs_review',version=version+1,updated_at=clock_timestamp() WHERE id=v_i.id RETURNING * INTO v_i;
  END IF;
  RETURN jsonb_build_object('intentId',v_i.id,'status',v_i.status,'outcome',CASE WHEN v_reason IS NULL THEN 'applied' ELSE 'rejected' END,'reason',v_reason,'replayed',false,
    'capturedMinor',v_i.captured_minor::text,'refundedMinor',v_i.refunded_minor::text,'chargedBackMinor',v_i.charged_back_minor::text);
 END IF;

 IF p_action='reconcile' THEN
  -- Replay every applied event from scratch; the stored intent must equal the replay, and nothing may be unaccounted for.
  RETURN jsonb_build_object('discrepancies',COALESCE((
   WITH RECURSIVE ev AS (
    SELECT e.intent_id,e.id,e.kind,e.amount_minor,row_number() OVER (PARTITION BY e.intent_id ORDER BY e.id) rn
    FROM public.payment_events e WHERE e.business_id=v_biz AND e.outcome='applied'),
   walk AS (
    SELECT i.id intent_id,0::bigint rn,'pending'::text status,0::bigint cap,0::bigint refd,0::bigint cb,i.amount_minor amt FROM public.payment_intents i WHERE i.business_id=v_biz
    UNION ALL
    SELECT w.intent_id,ev.rn,n.o_status,n.o_captured,n.o_refunded,n.o_cb,w.amt
    FROM walk w JOIN ev ON ev.intent_id=w.intent_id AND ev.rn=w.rn+1
    CROSS JOIN LATERAL private.payment_next(w.status,w.amt,w.cap,w.refd,w.cb,ev.kind,ev.amount_minor) n),
   final AS (SELECT DISTINCT ON (intent_id) * FROM walk ORDER BY intent_id,rn DESC)
   SELECT jsonb_agg(jsonb_build_object('intentId',i.id,'stored',i.status,'replayed',f.status,'storedCaptured',i.captured_minor::text,'replayedCaptured',f.cap::text))
   FROM public.payment_intents i JOIN final f ON f.intent_id=i.id
   WHERE i.business_id=v_biz AND i.status<>'needs_review'
     AND (i.status<>f.status OR i.captured_minor<>f.cap OR i.refunded_minor<>f.refd OR i.charged_back_minor<>f.cb)),'[]'::jsonb),
   'netSettledMinor',(SELECT COALESCE(sum(captured_minor-refunded_minor-charged_back_minor),0)::text FROM public.payment_intents WHERE business_id=v_biz),
   'needsReview',(SELECT count(*) FROM public.payment_intents WHERE business_id=v_biz AND status='needs_review'),
   'unresolved',(SELECT count(*) FROM public.payment_intents WHERE business_id=v_biz AND status IN ('pending','unknown')));
 END IF;
 RAISE EXCEPTION 'Unknown payment action' USING ERRCODE='22023';
END $fn$;
REVOKE ALL ON FUNCTION private.payment_append_only(),private.payment_intent_guard() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.payment_action(text,jsonb),private.payment_next(text,bigint,bigint,bigint,bigint,text,bigint) FROM PUBLIC,anon,authenticated;

-- Server-side only (service role). Never reachable by shoppers, staff or browsers.
CREATE FUNCTION public.tallybook_payment_ledger(p_action text,p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN private.payment_action(p_action,p_input); END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_payment_ledger(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tallybook_payment_ledger(text,jsonb) TO service_role;

-- Owner-visible read model (no provider secrets exist here; amounts and states only).
CREATE FUNCTION public.tallybook_payment_status(p_input jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;v_biz uuid;v_role text;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN others THEN sid:=null; END;
 v_biz:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(actor,sid,v_biz);
 IF v_role NOT IN ('owner','manager') THEN RAISE EXCEPTION 'Only the owner or a manager may view payments' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('intentId',id,'orderRef',order_ref,'method',method,'currency',currency,
   'amountMinor',amount_minor::text,'status',status,'capturedMinor',captured_minor::text,'refundedMinor',refunded_minor::text,
   'chargedBackMinor',charged_back_minor::text,'simulated',false) ORDER BY created_at DESC,id)
   FROM (SELECT * FROM public.payment_intents WHERE business_id=v_biz ORDER BY created_at DESC,id LIMIT 100) x),'[]'::jsonb));
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_payment_status(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_payment_status(jsonb) TO authenticated;
COMMIT;
