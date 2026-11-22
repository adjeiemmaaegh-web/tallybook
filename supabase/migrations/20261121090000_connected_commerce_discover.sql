-- Connected Commerce: Tallybook Discover (CC-D) backend. DEVELOPMENT ONLY: NOT applied to any hosted database.
--
-- Owner-chosen public listings and bounded shopper REQUESTS. A request is only a request: no payment, no stock
-- hold, no sale. Nothing is visible publicly unless private.cc_track_enabled(business,'discover') is true at read
-- time (owner consent to the reviewed terms + flag on + platform kill switch clear). The schema deliberately has no
-- stock quantity, cost, customer or staff columns, so none of that can be published by mistake.
BEGIN;

-- New events and payload keys for the outbox (still minimal and PII-free by constraint).
ALTER TABLE public.cc_outbox DROP CONSTRAINT cc_outbox_event_type_check;
ALTER TABLE public.cc_outbox ADD CONSTRAINT cc_outbox_event_type_check CHECK(event_type IN
 ('cc.flag.changed.v1','cc.consent.changed.v1','cc.verification.changed.v1',
  'cc.discover.listing_changed.v1','cc.discover.request_received.v1','cc.discover.request_decided.v1'));
CREATE OR REPLACE FUNCTION private.cc_payload_safe(p jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_typeof(p)='object'
   AND pg_column_size(p)<=1024
   AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(p) k
     WHERE k NOT IN ('track','enabled','consentVersion','action','status','flagVersion','requestId','listingId'))
   AND NOT EXISTS(SELECT 1 FROM jsonb_each(p) e WHERE jsonb_typeof(e.value) NOT IN ('string','boolean','number'))
$$;

CREATE TABLE public.cc_discover_profiles (
 business_id uuid PRIMARY KEY REFERENCES public.businesses(id),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 2 AND 80),
 category text NOT NULL CHECK(category IN ('groceries','fashion','electronics','household','beauty','building','pharmacy','food','services','other')),
 -- A general area the owner types (a town or neighbourhood). Coordinates are never stored.
 area_label text NOT NULL CHECK(length(btrim(area_label)) BETWEEN 2 AND 80 AND area_label !~ '[0-9]{1,3}\.[0-9]{3,}'),
 contact_label text CHECK(contact_label IS NULL OR length(btrim(contact_label)) BETWEEN 6 AND 60),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','unpublished')),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 published_at timestamptz,
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.cc_discover_listings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 2 AND 80),
 description text NOT NULL DEFAULT '' CHECK(length(description)<=280),
 kind text NOT NULL CHECK(kind IN ('good','service')),
 price_minor bigint CHECK(price_minor IS NULL OR price_minor BETWEEN 0 AND 100000000000000),
 currency text NOT NULL DEFAULT 'GHS' CHECK(currency ~ '^[A-Z]{3}$'),
 -- A label the OWNER chooses, with the time they last confirmed it. Never derived from, or equal to, a stock balance.
 availability text NOT NULL CHECK(availability IN ('in_stock','limited','out_of_stock','made_to_order','unknown')),
 availability_asof timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','unpublished','removed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(business_id,id)
);
CREATE INDEX cc_discover_listings_public ON public.cc_discover_listings(status,updated_at DESC,id);
CREATE INDEX cc_discover_listings_owner ON public.cc_discover_listings(business_id,status);

CREATE TABLE public.cc_discover_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 listing_id uuid NOT NULL,
 listing_version integer NOT NULL,
 listing_title text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 20),
 buyer_name text NOT NULL CHECK(length(btrim(buyer_name)) BETWEEN 2 AND 60),
 buyer_contact text NOT NULL CHECK(buyer_contact ~ '^[+0-9 ()-]{6,40}$'),
 contact_hash text NOT NULL CHECK(contact_hash ~ '^[a-f0-9]{64}$'),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=200),
 contact_consent boolean NOT NULL CHECK(contact_consent),
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','accepted','declined','cancelled')),
 operation_key uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 cancel_token_hash text NOT NULL CHECK(cancel_token_hash ~ '^[a-f0-9]{64}$'),
 decided_by uuid REFERENCES auth.users(id),
 decided_at timestamptz,
 decision_note text CHECK(decision_note IS NULL OR length(decision_note)<=200),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(listing_id,operation_key),
 FOREIGN KEY(business_id,listing_id) REFERENCES public.cc_discover_listings(business_id,id),
 CHECK((status IN ('accepted','declined'))=(decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
-- One open request per shopper contact per item: repeated taps cannot flood a shop.
CREATE UNIQUE INDEX cc_discover_one_open_request ON public.cc_discover_requests(listing_id,contact_hash) WHERE status='new';
CREATE INDEX cc_discover_requests_recent ON public.cc_discover_requests(business_id,created_at DESC);
CREATE INDEX cc_discover_requests_rate_listing ON public.cc_discover_requests(listing_id,created_at DESC);
CREATE INDEX cc_discover_requests_rate_contact ON public.cc_discover_requests(business_id,contact_hash,created_at DESC);

ALTER TABLE public.cc_discover_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_discover_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_discover_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_discover_listings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cc_discover_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cc_discover_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cc_discover_profiles,public.cc_discover_listings,public.cc_discover_requests FROM PUBLIC,anon,authenticated;

-- ---------------------------------------------------------------- owner
CREATE FUNCTION private.cc_discover_owner_action(p_action text,p_actor uuid,p_session uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_company uuid; v_role text; v_key uuid; v_hash text; v_prior public.cc_operation_keys;
 v_on boolean; v_resp jsonb; v_expected integer;
 v_profile public.cc_discover_profiles; v_listing public.cc_discover_listings; v_req public.cc_discover_requests;
 v_listing_id uuid; v_status text; v_decision text; v_note text;
 v_name text; v_cat text; v_area text; v_contact text; v_title text; v_desc text; v_kind text; v_cur text; v_avail text; v_price bigint;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF v_role<>'owner' THEN RAISE EXCEPTION 'CC:NOT_AUTHORIZED Only the business owner may manage Discover' USING ERRCODE='42501'; END IF;
 IF p_action NOT IN ('getProfile','saveProfile','publishProfile','unpublishProfile','saveListing','confirmAvailability',
                     'setListingStatus','listListings','listRequests','decideRequest') THEN
  RAISE EXCEPTION 'Unknown Discover action' USING ERRCODE='22023'; END IF;
 v_on:=private.cc_track_enabled(v_company,'discover');

 IF p_action='getProfile' THEN
  SELECT * INTO v_profile FROM public.cc_discover_profiles WHERE business_id=v_company;
  RETURN jsonb_build_object('enabled',v_on,'profile',CASE WHEN v_profile.business_id IS NULL THEN NULL ELSE jsonb_build_object(
    'displayName',v_profile.display_name,'category',v_profile.category,'areaLabel',v_profile.area_label,
    'contactLabel',v_profile.contact_label,'status',v_profile.status,'version',v_profile.version) END);
 END IF;
 IF p_action='listListings' THEN
  RETURN jsonb_build_object('listings',COALESCE((SELECT jsonb_agg(jsonb_build_object('listingId',id,'title',title,'description',description,
    'kind',kind,'priceMinor',price_minor::text,'currency',currency,'availability',availability,'availabilityAsOf',availability_asof,
    'status',status,'version',version) ORDER BY updated_at DESC,id) FROM (SELECT * FROM public.cc_discover_listings
     WHERE business_id=v_company AND status<>'removed' ORDER BY updated_at DESC,id LIMIT 200) l),'[]'::jsonb));
 END IF;
 IF p_action='listRequests' THEN
  RETURN jsonb_build_object('requests',COALESCE((SELECT jsonb_agg(jsonb_build_object('requestId',id,'listingId',listing_id,'listingTitle',listing_title,
    'quantity',quantity,'buyerName',buyer_name,'buyerContact',buyer_contact,'note',note,
    'status',CASE WHEN status='new' AND created_at<clock_timestamp()-interval '14 days' THEN 'expired' ELSE status END,
    'createdAt',created_at,'decisionNote',decision_note,'paymentCollected',false,'stockReserved',false) ORDER BY created_at DESC,id)
    FROM (SELECT * FROM public.cc_discover_requests WHERE business_id=v_company ORDER BY created_at DESC,id LIMIT 100) r),'[]'::jsonb));
 END IF;

 -- Mutations: idempotent by operation key, one writer per merchant.
 v_key:=private.shop_uuid(p_input,'operationKey');
 v_hash:=encode(sha256(convert_to(p_action||':'||(p_input-'operationKey')::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('cc:'||v_company::text,0));
 SELECT * INTO v_prior FROM public.cc_operation_keys WHERE business_id=v_company AND operation_key=v_key;
 IF FOUND THEN
  IF v_prior.request_hash<>v_hash OR v_prior.action<>'discover.'||p_action THEN
   RAISE EXCEPTION 'CC:CONFLICT This operation key was already used for a different request' USING ERRCODE='23505'; END IF;
  RETURN v_prior.response||jsonb_build_object('replayed',true);
 END IF;

 -- Turning things OFF is always allowed. Anything that can make data public or accept a shopper needs the service on.
 IF NOT v_on AND NOT (p_action='unpublishProfile' OR (p_action='setListingStatus' AND p_input->>'status' IN ('unpublished','removed'))
                      OR (p_action='decideRequest' AND p_input->>'decision'='decline')) THEN
  RAISE EXCEPTION 'CC:REQUIRES_CONFIRMATION Turn on Tallybook Discover first (accept the current terms in Connected Commerce settings)' USING ERRCODE='42501';
 END IF;

 IF p_action='saveProfile' THEN
  v_name:=btrim(COALESCE(p_input->>'displayName','')); v_cat:=p_input->>'category'; v_area:=btrim(COALESCE(p_input->>'areaLabel',''));
  v_contact:=NULLIF(btrim(COALESCE(p_input->>'contactLabel','')),'');
  IF length(v_name) NOT BETWEEN 2 AND 80 OR v_name ~ '[\x00-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid displayName' USING ERRCODE='22023'; END IF;
  IF length(v_area) NOT BETWEEN 2 AND 80 OR v_area ~ '[\x00-\x1f\x7f]' OR v_area ~ '[0-9]{1,3}\.[0-9]{3,}' THEN RAISE EXCEPTION 'Invalid areaLabel (use a town or neighbourhood, not coordinates)' USING ERRCODE='22023'; END IF;
  IF v_contact IS NOT NULL AND (length(v_contact) NOT BETWEEN 6 AND 60 OR v_contact ~ '[\x00-\x1f\x7f]') THEN RAISE EXCEPTION 'Invalid contactLabel' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_profile FROM public.cc_discover_profiles WHERE business_id=v_company FOR UPDATE;
  IF p_input ? 'expectedVersion' THEN
   v_expected:=private.shop_int(p_input,'expectedVersion',0,2147483647);
   IF v_expected<>COALESCE(v_profile.version,0) THEN RAISE EXCEPTION 'CC:STALE_VERSION The profile changed elsewhere; reload and try again' USING ERRCODE='40001'; END IF;
  END IF;
  INSERT INTO public.cc_discover_profiles(business_id,display_name,category,area_label,contact_label,updated_by)
   VALUES(v_company,v_name,v_cat,v_area,v_contact,p_actor)
   ON CONFLICT(business_id) DO UPDATE SET display_name=EXCLUDED.display_name,category=EXCLUDED.category,area_label=EXCLUDED.area_label,
     contact_label=EXCLUDED.contact_label,version=public.cc_discover_profiles.version+1,updated_by=p_actor,updated_at=clock_timestamp();
 ELSIF p_action='publishProfile' OR p_action='unpublishProfile' THEN
  SELECT * INTO v_profile FROM public.cc_discover_profiles WHERE business_id=v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CC:REQUIRES_CONFIRMATION Save your shop profile first' USING ERRCODE='42501'; END IF;
  v_status:=CASE WHEN p_action='publishProfile' THEN 'published' ELSE 'unpublished' END;
  UPDATE public.cc_discover_profiles SET status=v_status,version=version+1,updated_by=p_actor,updated_at=clock_timestamp(),
    published_at=CASE WHEN v_status='published' THEN clock_timestamp() ELSE published_at END WHERE business_id=v_company;
  PERFORM private.cc_emit(v_company,'cc.discover.listing_changed.v1',jsonb_build_object('status',v_status));
 ELSIF p_action='saveListing' OR p_action='confirmAvailability' THEN
  v_listing_id:=NULLIF(p_input->>'listingId','')::uuid;
  v_avail:=p_input->>'availability';
  IF v_avail IS NULL OR v_avail NOT IN ('in_stock','limited','out_of_stock','made_to_order','unknown') THEN RAISE EXCEPTION 'Invalid availability' USING ERRCODE='22023'; END IF;
  IF p_action='confirmAvailability' THEN
   IF v_listing_id IS NULL THEN RAISE EXCEPTION 'Invalid listingId' USING ERRCODE='22023'; END IF;
   UPDATE public.cc_discover_listings SET availability=v_avail,availability_asof=clock_timestamp(),version=version+1,updated_at=clock_timestamp()
     WHERE business_id=v_company AND id=v_listing_id AND status<>'removed' RETURNING * INTO v_listing;
   IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Listing not found' USING ERRCODE='42501'; END IF;
  ELSE
   v_title:=btrim(COALESCE(p_input->>'title','')); v_desc:=COALESCE(p_input->>'description',''); v_kind:=p_input->>'kind'; v_cur:=COALESCE(p_input->>'currency','GHS');
   IF length(v_title) NOT BETWEEN 2 AND 80 OR v_title ~ '[\x00-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid title' USING ERRCODE='22023'; END IF;
   IF length(v_desc)>280 OR v_desc ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid description' USING ERRCODE='22023'; END IF;
   IF v_kind IS NULL OR v_kind NOT IN ('good','service') THEN RAISE EXCEPTION 'Invalid kind' USING ERRCODE='22023'; END IF;
   IF v_cur !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid currency' USING ERRCODE='22023'; END IF;
   IF p_input ? 'priceMinor' AND jsonb_typeof(p_input->'priceMinor')<>'null' THEN v_price:=private.shop_int(p_input,'priceMinor',0,100000000000000); ELSE v_price:=NULL; END IF;
   IF v_listing_id IS NULL THEN
    IF (SELECT count(*) FROM public.cc_discover_listings WHERE business_id=v_company AND status<>'removed')>=200 THEN
     RAISE EXCEPTION 'CC:NOT_AVAILABLE The listing limit (200) is reached' USING ERRCODE='54000'; END IF;
    INSERT INTO public.cc_discover_listings(business_id,title,description,kind,price_minor,currency,availability,created_by)
     VALUES(v_company,v_title,v_desc,v_kind,v_price,v_cur,v_avail,p_actor) RETURNING * INTO v_listing;
   ELSE
    SELECT * INTO v_listing FROM public.cc_discover_listings WHERE business_id=v_company AND id=v_listing_id AND status<>'removed' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Listing not found' USING ERRCODE='42501'; END IF;
    IF p_input ? 'expectedVersion' THEN
     v_expected:=private.shop_int(p_input,'expectedVersion',1,2147483647);
     IF v_expected<>v_listing.version THEN RAISE EXCEPTION 'CC:STALE_VERSION The listing changed elsewhere; reload and try again' USING ERRCODE='40001'; END IF;
    END IF;
    UPDATE public.cc_discover_listings SET title=v_title,description=v_desc,kind=v_kind,price_minor=v_price,currency=v_cur,availability=v_avail,
      availability_asof=clock_timestamp(),version=version+1,updated_at=clock_timestamp() WHERE id=v_listing_id RETURNING * INTO v_listing;
   END IF;
  END IF;
  PERFORM private.cc_emit(v_company,'cc.discover.listing_changed.v1',jsonb_build_object('listingId',v_listing.id,'status',v_listing.status));
  v_resp:=jsonb_build_object('listingId',v_listing.id,'version',v_listing.version,'status',v_listing.status,'availabilityAsOf',v_listing.availability_asof);
 ELSIF p_action='setListingStatus' THEN
  v_listing_id:=private.shop_uuid(p_input,'listingId'); v_status:=p_input->>'status';
  IF v_status IS NULL OR v_status NOT IN ('published','unpublished','removed') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
  UPDATE public.cc_discover_listings SET status=v_status,version=version+1,updated_at=clock_timestamp()
    WHERE business_id=v_company AND id=v_listing_id AND status<>'removed' RETURNING * INTO v_listing;
  IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Listing not found' USING ERRCODE='42501'; END IF;
  PERFORM private.cc_emit(v_company,'cc.discover.listing_changed.v1',jsonb_build_object('listingId',v_listing.id,'status',v_status));
  v_resp:=jsonb_build_object('listingId',v_listing.id,'version',v_listing.version,'status',v_listing.status);
 ELSE -- decideRequest
  v_decision:=p_input->>'decision'; v_note:=NULLIF(btrim(COALESCE(p_input->>'note','')),'');
  IF v_decision NOT IN ('accept','decline') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  IF v_note IS NOT NULL AND (length(v_note)>200 OR v_note ~ '[\x00-\x1f\x7f]') THEN RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_req FROM public.cc_discover_requests WHERE business_id=v_company AND id=private.shop_uuid(p_input,'requestId') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Request not found' USING ERRCODE='42501'; END IF;
  IF v_req.status<>'new' THEN RAISE EXCEPTION 'CC:CONFLICT This request was already %', v_req.status USING ERRCODE='23514'; END IF;
  IF v_req.created_at<clock_timestamp()-interval '14 days' THEN RAISE EXCEPTION 'CC:CONFLICT This request has expired; ask the shopper to send a new one' USING ERRCODE='23514'; END IF;
  UPDATE public.cc_discover_requests SET status=CASE WHEN v_decision='accept' THEN 'accepted' ELSE 'declined' END,decided_by=p_actor,
    decided_at=clock_timestamp(),decision_note=v_note,updated_at=clock_timestamp() WHERE id=v_req.id RETURNING * INTO v_req;
  PERFORM private.cc_emit(v_company,'cc.discover.request_decided.v1',jsonb_build_object('requestId',v_req.id,'status',v_req.status));
  -- Accepting a request is NOT a sale, a payment or a stock hold; those stay in the existing authorized workflows.
  v_resp:=jsonb_build_object('requestId',v_req.id,'status',v_req.status,'paymentCollected',false,'stockReserved',false,'saleRecorded',false);
 END IF;

 v_resp:=COALESCE(v_resp,jsonb_build_object('ok',true))||jsonb_build_object('replayed',false);
 INSERT INTO public.cc_operation_keys(business_id,operation_key,action,request_hash,response)
   VALUES(v_company,v_key,'discover.'||p_action,v_hash,v_resp);
 INSERT INTO public.cc_audit_events(business_id,actor_id,action,outcome,operation_key)
   VALUES(v_company,p_actor,left('discover.'||p_action,60),'ok',v_key);
 RETURN v_resp;
END $fn$;

-- ---------------------------------------------------------------- public (anonymous)
CREATE FUNCTION private.cc_discover_public_action(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_q text; v_cat text; v_area text; v_limit integer; v_after_ts timestamptz; v_after_id uuid; v_rows jsonb;
 v_listing public.cc_discover_listings; v_profile public.cc_discover_profiles;
 v_id uuid; v_key uuid; v_hash text; v_existing public.cc_discover_requests; v_token uuid; v_req public.cc_discover_requests;
 v_qty bigint; v_name text; v_contact text; v_note text; v_contact_hash text; v_tokhash text;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid request' USING ERRCODE='22023'; END IF;
 IF p_action NOT IN ('search','listing','request','status','cancel') THEN RAISE EXCEPTION 'Unknown Discover action' USING ERRCODE='22023'; END IF;

 IF p_action='search' THEN
  v_q:=btrim(COALESCE(p_input->>'q','')); v_cat:=NULLIF(p_input->>'category',''); v_area:=btrim(COALESCE(p_input->>'area',''));
  IF length(v_q)>60 OR length(v_area)>40 OR v_q ~ '[\x00-\x1f\x7f]' OR v_area ~ '[\x00-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid search' USING ERRCODE='22023'; END IF;
  IF v_cat IS NOT NULL AND v_cat NOT IN ('groceries','fashion','electronics','household','beauty','building','pharmacy','food','services','other') THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023'; END IF;
  v_limit:=COALESCE(private.shop_int(jsonb_build_object('l',COALESCE(p_input->'limit','20'::jsonb)),'l',1,20),20);
  IF p_input ? 'after' AND jsonb_typeof(p_input->'after')='object' THEN
   BEGIN v_after_ts:=(p_input->'after'->>'updatedAt')::timestamptz; v_after_id:=(p_input->'after'->>'id')::uuid;
   EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END;
  END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_ts DESC,x.sort_id),'[]'::jsonb) INTO v_rows FROM (
   SELECT l.updated_at AS sort_ts,l.id AS sort_id,l.id AS "listingId",l.title,l.description,l.kind,l.price_minor::text AS "priceMinor",l.currency,
     l.availability,l.availability_asof AS "availabilityAsOf",
     jsonb_build_object('name',p.display_name,'category',p.category,'area',p.area_label,'contact',p.contact_label,
       'verification',private.cc_verification_label(v.status),'externallyVerified',COALESCE(v.status='reviewed_verified',false)) AS shop
   FROM public.cc_discover_listings l
   JOIN public.cc_discover_profiles p ON p.business_id=l.business_id AND p.status='published'
   LEFT JOIN public.cc_merchant_verification v ON v.business_id=l.business_id
   WHERE l.status='published' AND private.cc_track_enabled(l.business_id,'discover')
     AND (v_cat IS NULL OR p.category=v_cat)
     AND (v_area='' OR p.area_label ILIKE '%'||replace(replace(replace(v_area,'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\')
     AND (v_q='' OR l.title ILIKE '%'||replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\'
          OR l.description ILIKE '%'||replace(replace(replace(v_q,'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\')
     AND (v_after_ts IS NULL OR (l.updated_at,l.id)<(v_after_ts,v_after_id))
   ORDER BY l.updated_at DESC,l.id LIMIT v_limit) x;
  RETURN jsonb_build_object('results',(SELECT COALESCE(jsonb_agg(e-'sort_ts'-'sort_id'),'[]'::jsonb) FROM jsonb_array_elements(v_rows) e),
    'next',CASE WHEN jsonb_array_length(v_rows)=v_limit THEN (SELECT jsonb_build_object('updatedAt',e->>'sort_ts','id',e->>'sort_id') FROM jsonb_array_elements(v_rows) e ORDER BY (e->>'sort_ts')::timestamptz ASC,(e->>'sort_id') DESC LIMIT 1) END,
    'note','Availability is the shop''s own statement at the time shown. Listings are not reservations.');
 END IF;

 IF p_action='listing' THEN
  v_id:=private.shop_uuid(p_input,'listingId');
  SELECT l.* INTO v_listing FROM public.cc_discover_listings l JOIN public.cc_discover_profiles p ON p.business_id=l.business_id AND p.status='published'
   WHERE l.id=v_id AND l.status='published' AND private.cc_track_enabled(l.business_id,'discover');
  IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Listing not found' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_profile FROM public.cc_discover_profiles WHERE business_id=v_listing.business_id;
  RETURN jsonb_build_object('listingId',v_listing.id,'title',v_listing.title,'description',v_listing.description,'kind',v_listing.kind,
    'priceMinor',v_listing.price_minor::text,'currency',v_listing.currency,'availability',v_listing.availability,'availabilityAsOf',v_listing.availability_asof,
    'shop',jsonb_build_object('name',v_profile.display_name,'category',v_profile.category,'area',v_profile.area_label,'contact',v_profile.contact_label,
      'verification',private.cc_verification_label((SELECT status FROM public.cc_merchant_verification WHERE business_id=v_listing.business_id)),
      'externallyVerified',COALESCE((SELECT status='reviewed_verified' FROM public.cc_merchant_verification WHERE business_id=v_listing.business_id),false)));
 END IF;

 IF p_action='request' THEN
  v_id:=private.shop_uuid(p_input,'listingId'); v_key:=private.shop_uuid(p_input,'operationKey');
  IF p_input->'consent' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'CC:REQUIRES_CONFIRMATION You must agree that the shop may contact you about this request' USING ERRCODE='42501'; END IF;
  v_qty:=private.shop_int(p_input,'quantity',1,20);
  v_name:=btrim(COALESCE(p_input->>'buyerName','')); v_contact:=btrim(COALESCE(p_input->>'buyerContact','')); v_note:=btrim(COALESCE(p_input->>'note',''));
  IF length(v_name) NOT BETWEEN 2 AND 60 OR v_name ~ '[\x00-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid buyerName' USING ERRCODE='22023'; END IF;
  IF v_contact !~ '^[+0-9 ()-]{6,40}$' THEN RAISE EXCEPTION 'Invalid buyerContact (use a phone number)' USING ERRCODE='22023'; END IF;
  IF length(v_note)>200 OR v_note ~ '[\x00-\x1f\x7f]' THEN RAISE EXCEPTION 'Invalid note' USING ERRCODE='22023'; END IF;
  v_contact_hash:=encode(sha256(convert_to(regexp_replace(v_contact,'[^0-9]','','g'),'UTF8')),'hex');
  v_hash:=encode(sha256(convert_to('request:'||(p_input-'operationKey')::text,'UTF8')),'hex');
  SELECT l.* INTO v_listing FROM public.cc_discover_listings l JOIN public.cc_discover_profiles p ON p.business_id=l.business_id AND p.status='published'
   WHERE l.id=v_id AND l.status='published' AND private.cc_track_enabled(l.business_id,'discover') FOR SHARE OF l;
  IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Listing not found' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ccd:'||v_listing.id::text,0));
  SELECT * INTO v_existing FROM public.cc_discover_requests WHERE listing_id=v_listing.id AND operation_key=v_key;
  IF FOUND THEN
   IF v_existing.request_hash<>v_hash THEN RAISE EXCEPTION 'CC:CONFLICT This submission key was already used for a different request' USING ERRCODE='23505'; END IF;
   RETURN jsonb_build_object('requestId',v_existing.id,'status',v_existing.status,'replayed',true,'cancelTokenIssued',false,
     'paymentCollected',false,'stockReserved',false,'accepted',v_existing.status='accepted');
  END IF;
  IF (SELECT count(*) FROM public.cc_discover_requests WHERE listing_id=v_listing.id AND created_at>clock_timestamp()-interval '1 hour')>=20
     OR (SELECT count(*) FROM public.cc_discover_requests WHERE business_id=v_listing.business_id AND contact_hash=v_contact_hash AND created_at>clock_timestamp()-interval '1 hour')>=5 THEN
   RAISE EXCEPTION 'CC:RATE_LIMITED Too many requests. Please try again later.' USING ERRCODE='54000'; END IF;
  IF EXISTS(SELECT 1 FROM public.cc_discover_requests WHERE listing_id=v_listing.id AND contact_hash=v_contact_hash AND status='new') THEN
   RAISE EXCEPTION 'CC:CONFLICT You already have an open request for this item' USING ERRCODE='23505'; END IF;
  v_token:=gen_random_uuid(); v_tokhash:=encode(sha256(convert_to(v_token::text,'UTF8')),'hex');
  INSERT INTO public.cc_discover_requests(business_id,listing_id,listing_version,listing_title,quantity,buyer_name,buyer_contact,contact_hash,note,
    contact_consent,operation_key,request_hash,cancel_token_hash)
   VALUES(v_listing.business_id,v_listing.id,v_listing.version,v_listing.title,v_qty,v_name,v_contact,v_contact_hash,v_note,true,v_key,v_hash,v_tokhash)
   RETURNING * INTO v_req;
  PERFORM private.cc_emit(v_listing.business_id,'cc.discover.request_received.v1',jsonb_build_object('requestId',v_req.id,'listingId',v_listing.id,'status','new'));
  RETURN jsonb_build_object('requestId',v_req.id,'status','new','replayed',false,'cancelToken',v_token,'cancelTokenIssued',true,
    'paymentCollected',false,'stockReserved',false,'accepted',false,
    'message','Request sent. The shop has not accepted it yet. Nothing is paid and nothing is reserved.');
 END IF;

 -- status / cancel: need the one-time token issued with the request.
 v_id:=private.shop_uuid(p_input,'requestId');
 BEGIN v_token:=(p_input->>'cancelToken')::uuid; EXCEPTION WHEN others THEN v_token:=NULL; END;
 SELECT * INTO v_req FROM public.cc_discover_requests WHERE id=v_id
   AND v_token IS NOT NULL AND cancel_token_hash=encode(sha256(convert_to(v_token::text,'UTF8')),'hex') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'CC:NOT_FOUND Request not found' USING ERRCODE='42501'; END IF;
 IF p_action='cancel' THEN
  IF v_req.status IN ('accepted','declined') THEN RAISE EXCEPTION 'CC:CONFLICT The shop already answered this request' USING ERRCODE='23514'; END IF;
  IF v_req.status='new' THEN UPDATE public.cc_discover_requests SET status='cancelled',updated_at=clock_timestamp() WHERE id=v_req.id RETURNING * INTO v_req; END IF;
 END IF;
 RETURN jsonb_build_object('requestId',v_req.id,'listingTitle',v_req.listing_title,
   'status',CASE WHEN v_req.status='new' AND v_req.created_at<clock_timestamp()-interval '14 days' THEN 'expired' ELSE v_req.status END,
   'decisionNote',v_req.decision_note,'paymentCollected',false,'stockReserved',false);
END $fn$;

REVOKE ALL ON FUNCTION private.cc_discover_owner_action(text,uuid,uuid,jsonb),private.cc_discover_public_action(text,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tallybook_cc_discover(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid; EXCEPTION WHEN others THEN sid:=null; END;
 RETURN private.cc_discover_owner_action(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_cc_discover(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_cc_discover(text,jsonb) TO authenticated;

CREATE FUNCTION public.tallybook_cc_discover_public(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RETURN private.cc_discover_public_action(p_action,p_input); END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_cc_discover_public(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tallybook_cc_discover_public(text,jsonb) TO anon,authenticated;
COMMIT;
