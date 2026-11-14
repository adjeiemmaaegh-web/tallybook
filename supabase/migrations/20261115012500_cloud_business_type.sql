-- Phase B: optional, persistent business classification. Existing companies remain NULL.
-- Do NOT change shop ledger currency, stock, membership or any local device profile.
BEGIN;
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS business_type text;
DO $do$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.businesses'::regclass
   AND conname='businesses_business_type_supported') THEN
   ALTER TABLE public.businesses ADD CONSTRAINT businesses_business_type_supported
     CHECK (business_type IS NULL OR business_type IN ('Retail shop', 'Clothing or fashion', 'Salon or barber', 'Food or restaurant', 'Mechanic or repair', 'Professional service', 'Market trader', 'Wholesale', 'Home-based business', 'Other'));
 END IF;
END $do$;

CREATE OR REPLACE FUNCTION private.set_cloud_business_type(
 p_business_id uuid, p_business_type text
) RETURNS public.businesses
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE actor uuid := auth.uid(); result public.businesses;
BEGIN
 IF actor IS NULL OR p_business_id IS NULL OR p_business_type IS NULL OR
    p_business_type NOT IN ('Retail shop', 'Clothing or fashion', 'Salon or barber', 'Food or restaurant', 'Mechanic or repair', 'Professional service', 'Market trader', 'Wholesale', 'Home-based business', 'Other')
 THEN RAISE EXCEPTION 'Invalid business classification request' USING ERRCODE='42501'; END IF;
 SELECT * INTO result FROM public.businesses WHERE id=p_business_id FOR UPDATE;
 IF NOT FOUND OR result.owner_id<>actor OR NOT EXISTS(
    SELECT 1 FROM public.business_members m
      WHERE m.business_id=p_business_id AND m.user_id=actor AND m.role='owner'
 ) THEN
    RAISE EXCEPTION 'Only the verified business owner may change its classification' USING ERRCODE='42501';
 END IF;
 IF result.business_type IS DISTINCT FROM p_business_type THEN
   UPDATE public.businesses SET business_type=p_business_type,updated_at=clock_timestamp()
     WHERE id=p_business_id RETURNING * INTO result;
 END IF;
 RETURN result;
END $function$;
REVOKE ALL ON FUNCTION private.set_cloud_business_type(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.set_cloud_business_type(uuid,text) TO authenticated;

-- Thin SECURITY INVOKER wrapper: the privileged logic lives only in private.
CREATE OR REPLACE FUNCTION public.set_cloud_business_type(
 p_business_id uuid, p_business_type text
) RETURNS public.businesses
LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
  SELECT private.set_cloud_business_type(p_business_id,p_business_type);
$function$;
REVOKE ALL ON FUNCTION public.set_cloud_business_type(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cloud_business_type(uuid,text) TO authenticated;
COMMIT;
