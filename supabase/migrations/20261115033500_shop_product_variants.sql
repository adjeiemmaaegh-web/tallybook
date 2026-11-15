-- Stage 14: optional variant metadata attached to EXISTING distinct stock-controlled SKUs.
-- Sale, refund, purchase, stock, historical receipt, prices and product IDs remain unchanged.
BEGIN;
ALTER TABLE public.shop_products
 ADD COLUMN IF NOT EXISTS variant_family text,
 ADD COLUMN IF NOT EXISTS variant_size text,
 ADD COLUMN IF NOT EXISTS variant_color text;
DO $do$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.shop_products'::regclass
   AND conname='shop_products_variant_valid') THEN
  ALTER TABLE public.shop_products ADD CONSTRAINT shop_products_variant_valid CHECK (
   (variant_family IS NULL AND variant_size IS NULL AND variant_color IS NULL)
   OR
   (variant_family IS NOT NULL AND length(btrim(variant_family)) BETWEEN 1 AND 80
    AND variant_family !~ '[[:cntrl:]]'
    AND (variant_size IS NOT NULL OR variant_color IS NOT NULL)
    AND (variant_size IS NULL OR (length(btrim(variant_size)) BETWEEN 1 AND 40 AND variant_size !~ '[[:cntrl:]]'))
    AND (variant_color IS NULL OR (length(btrim(variant_color)) BETWEEN 1 AND 40 AND variant_color !~ '[[:cntrl:]]'))
    AND kind='good' AND track_stock=true)
  );
 END IF;
END $do$;
CREATE UNIQUE INDEX IF NOT EXISTS shop_products_variant_unique
 ON public.shop_products (business_id,lower(variant_family),lower(coalesce(variant_size,'')),lower(coalesce(variant_color,'')))
 WHERE variant_family IS NOT NULL;

CREATE OR REPLACE FUNCTION private.shop_variant_action(
 p_action text,p_actor uuid,p_session uuid,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_company uuid;v_role text;v_product uuid;v_old public.shop_products;
 v_family text;v_size text;v_color text;v_changed boolean;
BEGIN
 IF jsonb_typeof(p_input) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Invalid variant request' USING ERRCODE='22023';END IF;
 v_company:=private.shop_uuid(p_input,'companyId');
 v_role:=private.shop_member_role(p_actor,p_session,v_company);
 IF p_action='list' THEN
  RETURN jsonb_build_object('variants',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'productId',p.id,'variantFamily',p.variant_family,
    'variantSize',p.variant_size,'variantColor',p.variant_color)
    ORDER BY lower(p.variant_family),lower(coalesce(p.variant_size,'')),lower(coalesce(p.variant_color,'')),p.id)
   FROM public.shop_products p
   WHERE p.business_id=v_company AND p.variant_family IS NOT NULL
      AND (v_role='owner' OR p.active)
  ),'[]'::jsonb));
 END IF;
 IF p_action<>'set' THEN RAISE EXCEPTION 'Unsupported variant operation' USING ERRCODE='22023'; END IF;
 IF v_role<>'owner' THEN RAISE EXCEPTION 'Only the business owner can manage variants' USING ERRCODE='42501'; END IF;
 v_product:=private.shop_uuid(p_input,'productId');
 IF (p_input ? 'variantFamily' AND jsonb_typeof(p_input->'variantFamily') NOT IN ('string','null'))
   OR (p_input ? 'variantSize' AND jsonb_typeof(p_input->'variantSize') NOT IN ('string','null'))
   OR (p_input ? 'variantColor' AND jsonb_typeof(p_input->'variantColor') NOT IN ('string','null'))
 THEN RAISE EXCEPTION 'Invalid variant text' USING ERRCODE='22023';END IF;
 v_family:=nullif(btrim(coalesce(p_input->>'variantFamily','')),'');
 v_size:=nullif(btrim(coalesce(p_input->>'variantSize','')),'');
 v_color:=nullif(btrim(coalesce(p_input->>'variantColor','')),'');
 IF (v_family IS NULL AND (v_size IS NOT NULL OR v_color IS NOT NULL)) OR
    (v_family IS NOT NULL AND v_size IS NULL AND v_color IS NULL) OR
    (v_family IS NOT NULL AND (length(v_family)>80 OR v_family ~ '[[:cntrl:]]')) OR
    (v_size IS NOT NULL AND (length(v_size)>40 OR v_size ~ '[[:cntrl:]]')) OR
    (v_color IS NOT NULL AND (length(v_color)>40 OR v_color ~ '[[:cntrl:]]'))
 THEN RAISE EXCEPTION 'Provide a family and a valid size or colour (or clear all fields)' USING ERRCODE='22023'; END IF;
 -- This is the same business ledger lock held by product and stock writes.
 PERFORM 1 FROM public.shop_ledgers WHERE business_id=v_company FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Shop not set up' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_old FROM public.shop_products p
  WHERE p.business_id=v_company AND p.id=v_product FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product access denied' USING ERRCODE='42501'; END IF;
 IF v_family IS NOT NULL AND (v_old.kind<>'good' OR NOT v_old.track_stock)
 THEN RAISE EXCEPTION 'Variants require separately stocked goods' USING ERRCODE='23514'; END IF;
 v_changed:= v_old.variant_family IS DISTINCT FROM v_family
  OR v_old.variant_size IS DISTINCT FROM v_size OR v_old.variant_color IS DISTINCT FROM v_color;
 IF v_changed THEN
  BEGIN
   UPDATE public.shop_products
   SET variant_family=v_family,variant_size=v_size,variant_color=v_color,
      updated_at=clock_timestamp()
   WHERE id=v_product AND business_id=v_company;
  EXCEPTION WHEN unique_violation THEN
   RAISE EXCEPTION 'Another SKU already has this family, size and colour' USING ERRCODE='23505';
  END;
 END IF;
 RETURN jsonb_build_object('productId',v_product,'variantFamily',v_family,
   'variantSize',v_size,'variantColor',v_color,'changed',v_changed);
END $fn$;

REVOKE ALL ON FUNCTION private.shop_variant_action(text,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.tallybook_shop_variants(
 p_action text,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE actor uuid:=auth.uid();sid uuid;
BEGIN
 BEGIN sid:=(auth.jwt()->>'session_id')::uuid;
 EXCEPTION WHEN others THEN sid:=null;END;
 RETURN private.shop_variant_action(p_action,actor,sid,p_input);
END $fn$;
REVOKE ALL ON FUNCTION public.tallybook_shop_variants(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tallybook_shop_variants(text,jsonb) TO authenticated;
COMMIT;
