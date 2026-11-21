-- Additive authorization repair; execute only through an approved test/release migration.
-- Preserve the canonical invoker wrapper and owner/membership/input checks.
BEGIN;
CREATE OR REPLACE FUNCTION private.set_cloud_business_type(
 p_business_id uuid, p_business_type text
) RETURNS public.businesses
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE actor uuid := auth.uid(); result public.businesses;
BEGIN
 -- The existing session proof locks the Auth session row through this transaction.
 -- Ownership alone must never authorize a JWT whose session was revoked.
 PERFORM public.tallybook_active_session_proof();
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

COMMIT;
