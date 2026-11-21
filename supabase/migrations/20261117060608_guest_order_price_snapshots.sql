-- Add per-line quote evidence to NEW guest requests without rewriting legacy
-- rows or replacing canonical request/conversion RPCs. No reservation/payment.
BEGIN;
CREATE FUNCTION private.shop_public_order_quote_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE
 v_line jsonb;
 v_lines jsonb:='[]'::jsonb;
 v_product uuid;
 v_quantity bigint;
 v_price bigint;
 v_currency text;
 v_total numeric:=0;
 v_order_line public.shop_online_order_lines;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT currency INTO v_currency FROM public.shop_ledgers WHERE business_id=NEW.business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop currency unavailable' USING ERRCODE='23514'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(NEW.lines) LOOP
   v_product:=private.shop_uuid(v_line,'productId');
   v_quantity:=private.shop_int(v_line,'quantity',1,100);
   SELECT unit_price_minor INTO v_price FROM public.shop_products
    WHERE business_id=NEW.business_id AND id=v_product AND active=true FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Product no longer available' USING ERRCODE='23514'; END IF;
   v_total:=v_total+v_quantity::numeric*v_price;
   -- Never accept a customer-supplied price/currency as authoritative.
   v_lines:=v_lines||jsonb_build_array(jsonb_build_object('productId',v_product,
     'quantity',v_quantity,'unitPriceMinor',v_price,'currency',v_currency));
  END LOOP;
  IF v_total<>NEW.quoted_total_minor THEN
   RAISE EXCEPTION 'Prices changed during submission; review a fresh quote' USING ERRCODE='23514';
  END IF;
  NEW.lines:=v_lines;
  RETURN NEW;
 END IF;
 IF NEW.lines IS DISTINCT FROM OLD.lines OR NEW.quoted_total_minor IS DISTINCT FROM OLD.quoted_total_minor
    OR NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.store_id IS DISTINCT FROM OLD.store_id THEN
  RAISE EXCEPTION 'Original guest price evidence cannot be rewritten' USING ERRCODE='23514';
 END IF;
 IF NEW.status='converted' AND OLD.status<>'converted' THEN
  SELECT currency INTO v_currency FROM public.shop_ledgers WHERE business_id=NEW.business_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Shop currency unavailable' USING ERRCODE='23514'; END IF;
  IF (SELECT count(*) FROM public.shop_online_order_lines
      WHERE business_id=NEW.business_id AND order_id=NEW.converted_order_id)<>jsonb_array_length(OLD.lines) THEN
   RAISE EXCEPTION 'Converted order lines differ from guest quote' USING ERRCODE='23514';
  END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(OLD.lines) LOOP
   IF jsonb_typeof(v_line->'unitPriceMinor') IS DISTINCT FROM 'number'
      OR jsonb_typeof(v_line->'currency') IS DISTINCT FROM 'string' THEN
    -- Legacy requests have unknown original unit prices. Preserve them and
    -- require a fresh customer quote instead of inventing historical values.
    RAISE EXCEPTION 'Price snapshot unavailable; request a new customer quote' USING ERRCODE='23514';
   END IF;
   v_product:=private.shop_uuid(v_line,'productId');
   v_quantity:=private.shop_int(v_line,'quantity',1,100);
   v_price:=private.shop_int(v_line,'unitPriceMinor',0,100000000000);
   SELECT * INTO v_order_line FROM public.shop_online_order_lines
    WHERE business_id=NEW.business_id AND order_id=NEW.converted_order_id AND product_id=v_product;
   IF NOT FOUND OR v_order_line.quantity<>v_quantity
      OR v_order_line.quoted_unit_price_minor<>v_price OR (v_line->>'currency')<>v_currency THEN
    RAISE EXCEPTION 'Prices changed; confirm a new quote with the customer before converting' USING ERRCODE='23514';
   END IF;
  END LOOP;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION private.shop_public_order_quote_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER shop_public_order_quote_evidence
 BEFORE INSERT OR UPDATE ON public.shop_public_order_requests
 FOR EACH ROW EXECUTE FUNCTION private.shop_public_order_quote_guard();
COMMIT;
