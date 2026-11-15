-- Photo Stage 11: atomic, owner-authorized multi-SKU physical counts.
-- New tables/RPC only: existing one-SKU counts, sales, refunds and transfers remain unchanged.
BEGIN;

CREATE TABLE public.shop_stocktake_batches (
 id uuid PRIMARY KEY,
 business_id uuid NOT NULL REFERENCES public.businesses(id),
 store_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','applied','cancelled')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 applied_by uuid REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 applied_at timestamptz,
 UNIQUE(business_id,id),
 FOREIGN KEY (business_id,store_id) REFERENCES public.shop_stores(business_id,id),
 CHECK ((status='applied')=(applied_at IS NOT NULL))
);
CREATE INDEX shop_stocktake_batches_recent ON public.shop_stocktake_batches(business_id,created_at DESC);

CREATE TABLE public.shop_stocktake_batch_lines (
 business_id uuid NOT NULL,
 batch_id uuid NOT NULL,
 product_id uuid NOT NULL,
 expected_quantity integer NOT NULL CHECK (expected_quantity BETWEEN 0 AND 2147483647),
 counted_quantity integer CHECK (counted_quantity BETWEEN 0 AND 2147483647),
 PRIMARY KEY(batch_id,product_id),
 FOREIGN KEY(business_id,batch_id) REFERENCES public.shop_stocktake_batches(business_id,id),
 FOREIGN KEY(business_id,product_id) REFERENCES public.shop_products(business_id,id)
);

ALTER TABLE public.shop_stocktake_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_stocktake_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.shop_stocktake_batch_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_stocktake_batch_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.shop_stocktake_batches,public.shop_stocktake_batch_lines FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.shop_stocktake_batch_action(
 p_action text,p_actor uuid,p_session uuid,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_company uuid;
 v_store uuid;
 v_batch uuid;
 v_role text;
 v_status text;
 v_old_store uuid;
 v_product uuid;
 v_ids uuid[] := ARRAY[]::uuid[];
 v_existing uuid[];
 v_input jsonb;
 v_items jsonb;
 v_line record;
 v_current integer;
 v_qty bigint;
 v_delta bigint;
 v_total bigint := 0;
 v_count integer;
 v_actor uuid;
 v_applied_at timestamptz;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid batch request' USING ERRCODE='22023';
 END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 -- Active auth session, business membership and canonical ownership are verified by the database.
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF v_role<>'owner' THEN
  RAISE EXCEPTION 'Only the business owner may manage batch stocktakes' USING ERRCODE='42501';
 END IF;

 IF p_action='list' THEN
  RETURN jsonb_build_object('batches',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'batchId',b.id,'storeId',b.store_id,'status',b.status,
      'createdAt',b.created_at,'appliedAt',b.applied_at,
      'lines',COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
         'productId',l.product_id,'expectedQuantity',l.expected_quantity,
         'countedQuantity',l.counted_quantity) ORDER BY l.product_id)
        FROM public.shop_stocktake_batch_lines l
        WHERE l.business_id=v_company AND l.batch_id=b.id),'[]'::jsonb))
      ORDER BY b.created_at DESC,b.id)
    FROM (SELECT * FROM public.shop_stocktake_batches
      WHERE business_id=v_company ORDER BY created_at DESC,id LIMIT 30) b),'[]'::jsonb));
 END IF;

 IF p_action NOT IN ('start','apply','cancel') THEN
  RAISE EXCEPTION 'Unknown batch operation' USING ERRCODE='22023';
 END IF;

 -- Serialize against existing POS/transfer/stock writes across this business.
 PERFORM 1 FROM public.shop_ledgers WHERE business_id=v_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shop is not configured' USING ERRCODE='42501'; END IF;

 v_batch:=private.shop_uuid(p_input,'batchId');
 SELECT store_id,status,applied_by,applied_at
 INTO v_old_store,v_status,v_actor,v_applied_at
 FROM public.shop_stocktake_batches
 WHERE business_id=v_company AND id=v_batch FOR UPDATE;

 IF p_action='start' THEN
  v_store:=private.shop_uuid(p_input,'storeId');
  v_items:=p_input->'productIds';
  IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_items) NOT BETWEEN 2 AND 50
  THEN RAISE EXCEPTION 'Choose 2 to 50 products' USING ERRCODE='22023'; END IF;
  FOR v_input IN SELECT value FROM jsonb_array_elements(v_items) LOOP
   IF jsonb_typeof(v_input) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION 'Invalid product ID' USING ERRCODE='22023'; END IF;
   v_product:=private.shop_uuid(jsonb_build_object('productId',v_input),'productId');
   IF v_product=ANY(v_ids) THEN RAISE EXCEPTION 'Product selected twice' USING ERRCODE='23505'; END IF;
   v_ids:=array_append(v_ids,v_product);
  END LOOP;
  SELECT array_agg(x ORDER BY x) INTO v_ids FROM unnest(v_ids) x;
  IF v_status IS NOT NULL THEN
   SELECT array_agg(product_id ORDER BY product_id) INTO v_existing
   FROM public.shop_stocktake_batch_lines
   WHERE business_id=v_company AND batch_id=v_batch;
   IF v_old_store IS DISTINCT FROM v_store OR v_existing IS DISTINCT FROM v_ids THEN
    RAISE EXCEPTION 'Batch ID already used with different products' USING ERRCODE='23505';
   END IF;
   RETURN jsonb_build_object('batchId',v_batch,'status',v_status,'replayed',true);
  END IF;
  PERFORM 1 FROM public.shop_stores
   WHERE business_id=v_company AND id=v_store AND status='active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Store unavailable' USING ERRCODE='42501'; END IF;
  IF (SELECT count(*) FROM public.shop_products
      WHERE business_id=v_company AND id=ANY(v_ids)
        AND active AND kind='good' AND track_stock=true)<>array_length(v_ids,1)
  THEN RAISE EXCEPTION 'Select active, separately tracked goods' USING ERRCODE='23514'; END IF;
  INSERT INTO public.shop_stocktake_batches(id,business_id,store_id,created_by)
   VALUES(v_batch,v_company,v_store,p_actor);
  FOREACH v_product IN ARRAY v_ids LOOP
   SELECT quantity INTO v_current FROM public.shop_store_stock
    WHERE business_id=v_company AND store_id=v_store AND product_id=v_product FOR UPDATE;
   INSERT INTO public.shop_stocktake_batch_lines
     (business_id,batch_id,product_id,expected_quantity)
     VALUES(v_company,v_batch,v_product,COALESCE(v_current,0));
  END LOOP;
  RETURN jsonb_build_object('batchId',v_batch,'status','open','replayed',false);
 END IF;

 IF v_status IS NULL THEN RAISE EXCEPTION 'Batch not found' USING ERRCODE='42501'; END IF;

 IF p_action='cancel' THEN
  IF v_status='cancelled' THEN
   RETURN jsonb_build_object('batchId',v_batch,'status','cancelled','replayed',true);
  END IF;
  IF v_status<>'open' THEN
   RAISE EXCEPTION 'Applied batch cannot be cancelled' USING ERRCODE='23514';
  END IF;
  UPDATE public.shop_stocktake_batches SET status='cancelled'
   WHERE business_id=v_company AND id=v_batch;
  RETURN jsonb_build_object('batchId',v_batch,'status','cancelled','replayed',false);
 END IF;

 v_items:=p_input->'lines';
 IF jsonb_typeof(v_items) IS DISTINCT FROM 'array' OR
    jsonb_array_length(v_items) NOT BETWEEN 2 AND 50
 THEN RAISE EXCEPTION 'Submit all 2 to 50 counted products' USING ERRCODE='22023'; END IF;
 FOR v_input IN SELECT value FROM jsonb_array_elements(v_items) LOOP
  IF jsonb_typeof(v_input) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Invalid batch line' USING ERRCODE='22023'; END IF;
  v_product:=private.shop_uuid(v_input,'productId');
  IF v_product=ANY(v_ids) THEN
   RAISE EXCEPTION 'Duplicate counted product' USING ERRCODE='23505';
  END IF;
  v_qty:=private.shop_int(v_input,'countedQuantity',0,2147483647);
  v_ids:=array_append(v_ids,v_product);
 END LOOP;
 IF (SELECT count(*) FROM public.shop_stocktake_batch_lines
       WHERE business_id=v_company AND batch_id=v_batch)<>array_length(v_ids,1)
    OR EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE NOT EXISTS (
       SELECT 1 FROM public.shop_stocktake_batch_lines l
       WHERE l.business_id=v_company AND l.batch_id=v_batch AND l.product_id=x))
 THEN RAISE EXCEPTION 'Count every original product exactly once' USING ERRCODE='23514'; END IF;

 IF v_status='cancelled' THEN
  RAISE EXCEPTION 'Cancelled batch cannot be applied' USING ERRCODE='23514';
 END IF;

 -- Exact replay is allowed; changed quantities under the same ID are never allowed.
 IF v_status='applied' THEN
  FOR v_line IN SELECT product_id,counted_quantity FROM public.shop_stocktake_batch_lines
     WHERE business_id=v_company AND batch_id=v_batch LOOP
   SELECT value INTO v_input FROM jsonb_array_elements(v_items)
     WHERE value->>'productId'=v_line.product_id::text;
   v_qty:=private.shop_int(v_input,'countedQuantity',0,2147483647);
   IF v_qty<>v_line.counted_quantity THEN
    RAISE EXCEPTION 'Batch already posted with different counts' USING ERRCODE='23505';
   END IF;
  END LOOP;
  RETURN jsonb_build_object('batchId',v_batch,'status','applied','replayed',true);
 END IF;

 -- Every change is in this single database transaction. Any stale snapshot
 -- throws, rolling back ALL stock adjustments, batch lines and movements.
 FOR v_line IN SELECT product_id,expected_quantity FROM public.shop_stocktake_batch_lines
   WHERE business_id=v_company AND batch_id=v_batch ORDER BY product_id LOOP
  SELECT value INTO v_input FROM jsonb_array_elements(v_items)
    WHERE value->>'productId'=v_line.product_id::text;
  v_qty:=private.shop_int(v_input,'countedQuantity',0,2147483647);
  INSERT INTO public.shop_store_stock(business_id,store_id,product_id,quantity)
    VALUES(v_company,v_old_store,v_line.product_id,0) ON CONFLICT DO NOTHING;
  SELECT quantity INTO v_current FROM public.shop_store_stock
   WHERE business_id=v_company AND store_id=v_old_store AND product_id=v_line.product_id FOR UPDATE;
  IF v_current IS DISTINCT FROM v_line.expected_quantity THEN
   RAISE EXCEPTION 'Stock changed since this batch was opened; start fresh' USING ERRCODE='23514';
  END IF;
  v_delta:=v_qty-v_current;
  IF v_delta<>0 THEN
   UPDATE public.shop_store_stock SET quantity=v_qty::integer,updated_at=clock_timestamp()
     WHERE business_id=v_company AND store_id=v_old_store AND product_id=v_line.product_id;
   INSERT INTO public.shop_stock_movements(
     business_id,store_id,product_id,delta,quantity_after,reason,operation_id,note,actor_id)
    VALUES(v_company,v_old_store,v_line.product_id,v_delta::integer,v_qty::integer,
     'stocktake',private.shop_derived_uuid(v_batch,'stocktake-batch-'||v_line.product_id::text),
     'Batch count '||v_batch::text,p_actor);
  END IF;
  UPDATE public.shop_stocktake_batch_lines SET counted_quantity=v_qty::integer
   WHERE business_id=v_company AND batch_id=v_batch AND product_id=v_line.product_id;
  v_total:=v_total+v_delta;
 END LOOP;
 UPDATE public.shop_stocktake_batches
    SET status='applied',applied_by=p_actor,applied_at=clock_timestamp()
    WHERE business_id=v_company AND id=v_batch;
 RETURN jsonb_build_object('batchId',v_batch,'status','applied',
   'totalAdjustment',v_total,'replayed',false);
END $fn$;

REVOKE ALL ON FUNCTION private.shop_stocktake_batch_action(text,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.tallybook_shop_stocktake_batches(p_action text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid;
 EXCEPTION WHEN others THEN sid:=null;END;
 RETURN private.shop_stocktake_batch_action(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_shop_stocktake_batches(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_shop_stocktake_batches(text,jsonb) TO authenticated;
COMMIT;
