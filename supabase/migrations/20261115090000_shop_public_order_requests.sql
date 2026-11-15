-- Photo 13: explicitly owner-enabled guest order REQUESTS (not payment, stock reservation or sale).
-- Existing owner-created online orders, POS, balances and stock remain authoritative.
BEGIN;

CREATE TABLE public.shop_public_order_shares (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 store_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 UNIQUE(business_id,id),
 FOREIGN KEY(business_id,store_id) REFERENCES public.shop_stores(business_id,id)
);
CREATE UNIQUE INDEX shop_public_order_one_active_share
 ON public.shop_public_order_shares(business_id,store_id) WHERE revoked_at IS NULL;

CREATE TABLE public.shop_public_order_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 share_id uuid NOT NULL,
 store_id uuid NOT NULL,
 submission_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 customer_name text NOT NULL CHECK(length(btrim(customer_name)) BETWEEN 2 AND 80),
 contact_phone text NOT NULL CHECK(length(btrim(contact_phone)) BETWEEN 6 AND 60),
 customer_note text NOT NULL CHECK(length(customer_note) <= 240),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
 quoted_total_minor bigint NOT NULL CHECK(quoted_total_minor BETWEEN 0 AND 100000000000000),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','converted','declined')),
 converted_order_id uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(share_id,submission_key),
 UNIQUE(business_id,id),
 FOREIGN KEY(business_id,share_id) REFERENCES public.shop_public_order_shares(business_id,id),
 FOREIGN KEY(business_id,store_id) REFERENCES public.shop_stores(business_id,id),
 FOREIGN KEY(business_id,converted_order_id) REFERENCES public.shop_online_orders(business_id,id),
 CHECK((status='converted')=(converted_order_id IS NOT NULL))
);
CREATE INDEX shop_public_order_requests_recent
 ON public.shop_public_order_requests(business_id,created_at DESC);
CREATE INDEX shop_public_order_requests_rate
 ON public.shop_public_order_requests(share_id,created_at DESC);
CREATE UNIQUE INDEX shop_public_order_single_conversion
 ON public.shop_public_order_requests(business_id,converted_order_id)
 WHERE converted_order_id IS NOT NULL;

ALTER TABLE public.shop_public_order_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_public_order_shares FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shop_public_order_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_public_order_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_public_order_shares,public.shop_public_order_requests
 FROM PUBLIC,anon,authenticated;

-- Only a bearer of an active, unguessable share token can read a public
-- catalog or send a limited request. Neither operation can read private
-- finance, cost, customers, members, stock quantities, or other requests.
CREATE FUNCTION private.shop_guest_order_action(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_token uuid;
 v_share public.shop_public_order_shares;
 v_name text;
 v_store_name text;
 v_currency text;
 v_key uuid;
 v_customer text;
 v_phone text;
 v_note text;
 v_lines jsonb;
 v_line jsonb;
 v_product uuid;
 v_qty bigint;
 v_name_item text;
 v_price bigint;
 v_seen uuid[]:=ARRAY[]::uuid[];
 v_total numeric:=0;
 v_hash text;
 v_id uuid;
 v_existing public.shop_public_order_requests;
 v_now timestamptz:=clock_timestamp();
 v_validated jsonb:='[]'::jsonb;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR
    p_action NOT IN ('catalog','submit') THEN
  RAISE EXCEPTION 'Unsupported public order operation' USING ERRCODE='22023';
 END IF;
 v_token:=private.shop_uuid(p_input,'shareToken');
 IF p_action='catalog' THEN
  SELECT s.* INTO v_share FROM public.shop_public_order_shares s
   JOIN public.shop_stores st ON st.business_id=s.business_id AND st.id=s.store_id
   WHERE s.token_hash=encode(sha256(convert_to(v_token::text,'UTF8')),'hex')
     AND s.revoked_at IS NULL AND st.status='active';
 ELSE
  -- Serialize anonymous submissions per explicitly shared storefront.
  SELECT s.* INTO v_share FROM public.shop_public_order_shares s
   JOIN public.shop_stores st ON st.business_id=s.business_id AND st.id=s.store_id
   WHERE s.token_hash=encode(sha256(convert_to(v_token::text,'UTF8')),'hex')
     AND s.revoked_at IS NULL AND st.status='active' FOR UPDATE OF s;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'This order link is unavailable' USING ERRCODE='42501'; END IF;

 IF p_action='catalog' THEN
  SELECT b.name,l.currency,st.name INTO v_name,v_currency,v_store_name
   FROM public.businesses b
   JOIN public.shop_ledgers l ON l.business_id=b.id
   JOIN public.shop_stores st ON st.business_id=b.id AND st.id=v_share.store_id
   WHERE b.id=v_share.business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'The shop is unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
   'businessName',v_name,'storeName',v_store_name,'currency',v_currency,
   'products',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'productId',p.id,'name',p.name,'unitPriceMinor',p.unit_price_minor,
     'category',p.category,'kind',p.kind) ORDER BY lower(p.name),p.id)
    FROM (SELECT * FROM public.shop_products
       WHERE business_id=v_share.business_id AND active=true
       ORDER BY lower(name),id LIMIT 200) p),'[]'::jsonb),
   'catalogLimited',(SELECT count(*)>200 FROM public.shop_products
      WHERE business_id=v_share.business_id AND active=true),
   'paymentCollected',false,'stockReserved',false);
 END IF;

 v_key:=private.shop_uuid(p_input,'submissionKey');
 IF jsonb_typeof(p_input->'customerName') IS DISTINCT FROM 'string'
   OR jsonb_typeof(p_input->'contactPhone') IS DISTINCT FROM 'string'
   OR (p_input ? 'customerNote' AND jsonb_typeof(p_input->'customerNote') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'Invalid contact details' USING ERRCODE='22023'; END IF;
 v_customer:=btrim(p_input->>'customerName');
 v_phone:=btrim(p_input->>'contactPhone');
 v_note:=btrim(COALESCE(p_input->>'customerNote',''));
 IF length(v_customer) NOT BETWEEN 2 AND 80 OR v_customer ~ '[[:cntrl:]]'
    OR length(v_phone) NOT BETWEEN 6 AND 60
    OR v_phone !~ '^[+0-9][0-9 ()+-]{5,59}$'
    OR length(v_note)>240 OR v_note ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Invalid contact details' USING ERRCODE='22023'; END IF;
 v_lines:=p_input->'lines';
 IF jsonb_typeof(v_lines) IS DISTINCT FROM 'array'
    OR jsonb_array_length(v_lines) NOT BETWEEN 1 AND 30
 THEN RAISE EXCEPTION 'Select 1 to 30 products' USING ERRCODE='22023'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines) LOOP
  IF jsonb_typeof(v_line) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid order line' USING ERRCODE='22023'; END IF;
  v_product:=private.shop_uuid(v_line,'productId');
  v_qty:=private.shop_int(v_line,'quantity',1,100);
  IF v_product=ANY(v_seen) THEN RAISE EXCEPTION 'Duplicate product' USING ERRCODE='23505'; END IF;
  v_seen:=array_append(v_seen,v_product);
  -- Never trust browser-supplied price or availability.
  SELECT name,unit_price_minor INTO v_name_item,v_price FROM public.shop_products
   WHERE business_id=v_share.business_id AND id=v_product AND active=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product no longer available' USING ERRCODE='23514'; END IF;
  v_total:=v_total+v_qty::numeric*v_price::numeric;
  IF v_total>100000000000000 THEN RAISE EXCEPTION 'Order total exceeds allowed limit' USING ERRCODE='22003'; END IF;
  v_validated:=v_validated||jsonb_build_array(jsonb_build_object(
    'productId',v_product,'quantity',v_qty));
 END LOOP;
 v_hash:=encode(sha256(convert_to(jsonb_build_object(
  'customer',v_customer,'phone',v_phone,'note',v_note,'lines',v_validated)::text,'UTF8')),'hex');
 SELECT * INTO v_existing FROM public.shop_public_order_requests
  WHERE share_id=v_share.id AND submission_key=v_key FOR UPDATE;
 IF FOUND THEN
  IF v_existing.request_hash<>v_hash THEN
   RAISE EXCEPTION 'Submission ID already used for different details' USING ERRCODE='23505';
  END IF;
  RETURN jsonb_build_object('requestId',v_existing.id,'status',v_existing.status,
   'quotedTotalMinor',v_existing.quoted_total_minor::text,
   'replayed',true,'paymentCollected',false,'accepted',false);
 END IF;
 -- Bounded anonymous traffic per public share. This limits spam but is not a CAPTCHA.
 IF (SELECT count(*) FROM public.shop_public_order_requests
     WHERE share_id=v_share.id AND created_at>v_now-interval '1 minute')>=8
 THEN RAISE EXCEPTION 'Too many order requests; try again later' USING ERRCODE='53300'; END IF;
 INSERT INTO public.shop_public_order_requests(
   business_id,share_id,store_id,submission_key,request_hash,
   customer_name,contact_phone,customer_note,lines,quoted_total_minor)
 VALUES(v_share.business_id,v_share.id,v_share.store_id,v_key,v_hash,
   v_customer,v_phone,v_note,v_validated,v_total::bigint)
 RETURNING id INTO v_id;
 RETURN jsonb_build_object('requestId',v_id,'status','new',
   'quotedTotalMinor',v_total::text,'replayed',false,
   'paymentCollected',false,'accepted',false);
END $fn$;

REVOKE ALL ON FUNCTION private.shop_guest_order_action(text,jsonb)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tallybook_guest_order(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 RETURN private.shop_guest_order_action(p_action,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_guest_order(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tallybook_guest_order(text,jsonb) TO anon,authenticated;

CREATE FUNCTION private.shop_public_order_admin_action(
 p_action text,p_actor uuid,p_session uuid,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_company uuid;
 v_role text;
 v_store uuid;
 v_share uuid;
 v_token uuid;
 v_request uuid;
 v_row public.shop_public_order_requests;
 v_order_id uuid;
 v_result jsonb;
 v_lines jsonb;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid public order administration request' USING ERRCODE='22023';
 END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF v_role<>'owner' THEN
  RAISE EXCEPTION 'Only the business owner may administer guest orders' USING ERRCODE='42501';
 END IF;
 IF p_action='list' THEN
  RETURN jsonb_build_object(
    'shares',COALESCE((SELECT jsonb_agg(jsonb_build_object(
     'shareId',id,'storeId',store_id,'createdAt',created_at,'revoked',revoked_at IS NOT NULL)
     ORDER BY created_at DESC) FROM (SELECT * FROM public.shop_public_order_shares
      WHERE business_id=v_company ORDER BY created_at DESC LIMIT 50) s),'[]'::jsonb),
    'requests',COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'requestId',id,'storeId',store_id,'customerName',customer_name,
      'contactPhone',contact_phone,'customerNote',customer_note,
      'lines',lines,'quotedTotalMinor',quoted_total_minor::text,
      'status',status,'convertedOrderId',converted_order_id,'createdAt',created_at)
      ORDER BY created_at DESC) FROM (SELECT * FROM public.shop_public_order_requests
       WHERE business_id=v_company ORDER BY created_at DESC LIMIT 100) r),'[]'::jsonb));
 END IF;
 IF p_action NOT IN ('createShare','revokeShare','convert','decline') THEN
  RAISE EXCEPTION 'Unknown public order administration action' USING ERRCODE='22023';
 END IF;
 -- Mirrors the company-wide serializing lock used by POS and online orders.
 PERFORM 1 FROM public.shop_ledgers WHERE business_id=v_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure the shop first' USING ERRCODE='42501'; END IF;
 IF p_action='createShare' THEN
  v_store:=private.shop_uuid(p_input,'storeId');
  PERFORM 1 FROM public.shop_stores WHERE business_id=v_company AND id=v_store AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Store not available' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM public.shop_public_order_shares
     WHERE business_id=v_company AND store_id=v_store AND revoked_at IS NULL)
  THEN RAISE EXCEPTION 'Revoke the existing public link before creating another' USING ERRCODE='23505'; END IF;
  v_token:=gen_random_uuid();
  INSERT INTO public.shop_public_order_shares(business_id,store_id,token_hash,created_by)
    VALUES(v_company,v_store,encode(sha256(convert_to(v_token::text,'UTF8')),'hex'),p_actor)
    RETURNING id INTO v_share;
  -- Raw bearer token returned ONLY ONCE. The DB keeps only its SHA-256 hash.
  RETURN jsonb_build_object('shareId',v_share,'shareToken',v_token,'storeId',v_store);
 END IF;
 IF p_action='revokeShare' THEN
  v_share:=private.shop_uuid(p_input,'shareId');
  UPDATE public.shop_public_order_shares SET revoked_at=clock_timestamp()
    WHERE business_id=v_company AND id=v_share AND revoked_at IS NULL;
  IF NOT FOUND AND NOT EXISTS(SELECT 1 FROM public.shop_public_order_shares
     WHERE business_id=v_company AND id=v_share) THEN
    RAISE EXCEPTION 'Public link not found' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('shareId',v_share,'revoked',true);
 END IF;
 v_request:=private.shop_uuid(p_input,'requestId');
 SELECT * INTO v_row FROM public.shop_public_order_requests
  WHERE business_id=v_company AND id=v_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Guest order request not found' USING ERRCODE='42501'; END IF;
 IF p_action='decline' THEN
  IF v_row.status='declined' THEN
   RETURN jsonb_build_object('requestId',v_request,'status','declined','replayed',true);
  END IF;
  IF v_row.status<>'new' THEN
   RAISE EXCEPTION 'Converted request cannot be declined' USING ERRCODE='23514';
  END IF;
  UPDATE public.shop_public_order_requests SET status='declined',updated_at=clock_timestamp()
    WHERE business_id=v_company AND id=v_request;
  RETURN jsonb_build_object('requestId',v_request,'status','declined','replayed',false);
 END IF;
 IF v_row.status='converted' THEN
  RETURN jsonb_build_object('requestId',v_request,'status','converted',
    'orderId',v_row.converted_order_id,'replayed',true);
 END IF;
 IF v_row.status<>'new' THEN
  RAISE EXCEPTION 'Declined request cannot be converted' USING ERRCODE='23514'; END IF;
 v_order_id:=private.shop_derived_uuid(v_request,'guest-order-conversion');
 -- Re-use existing owner-only product pricing, ordered line and audit logic.
 -- Revalidate prices: changed prices require re-agreement with the guest.
 v_result:=private.shop_stage_d_online_action('createOnlineOrder',p_actor,p_session,
    jsonb_build_object('companyId',v_company,'orderId',v_order_id,
     'storeId',v_row.store_id,'customerReference',v_row.customer_name,
     'lines',v_row.lines));
 IF (v_result->>'quotedTotalMinor')::numeric<>v_row.quoted_total_minor THEN
  RAISE EXCEPTION 'Prices changed; confirm a new quote with the customer before converting' USING ERRCODE='23514';
 END IF;
 UPDATE public.shop_public_order_requests SET
   status='converted',converted_order_id=v_order_id,updated_at=clock_timestamp()
  WHERE business_id=v_company AND id=v_request;
 RETURN jsonb_build_object('requestId',v_request,'status','converted',
   'orderId',v_order_id,'replayed',false,'stockReserved',false);
END $fn$;

REVOKE ALL ON FUNCTION private.shop_public_order_admin_action(text,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.tallybook_public_order_admin(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid;
 EXCEPTION WHEN others THEN sid:=null;END;
 RETURN private.shop_public_order_admin_action(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_public_order_admin(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_public_order_admin(text,jsonb) TO authenticated;
COMMIT;
