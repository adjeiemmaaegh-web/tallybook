-- Explicit, owner-approved rollback only; fail if any saved business classification would be lost.
BEGIN;
DO $do$ BEGIN
 IF EXISTS(SELECT 1 FROM public.businesses WHERE business_type IS NOT NULL) THEN
   RAISE EXCEPTION 'Business categories exist; export and obtain owner approval before dropping this field';
 END IF;
END $do$;
DROP FUNCTION IF EXISTS public.set_cloud_business_type(uuid,text);
DROP FUNCTION IF EXISTS private.set_cloud_business_type(uuid,text);
ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_business_type_supported;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS business_type;
COMMIT;
