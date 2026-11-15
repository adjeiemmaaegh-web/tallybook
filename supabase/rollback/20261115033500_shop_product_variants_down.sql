-- Refuse to destroy a configured variant matrix without an explicit reviewed migration.
BEGIN;
DO $do$ BEGIN
 IF EXISTS(SELECT 1 FROM public.shop_products WHERE variant_family IS NOT NULL
           OR variant_size IS NOT NULL OR variant_color IS NOT NULL) THEN
  RAISE EXCEPTION 'Product variant metadata exists. Export and reconcile variants before rollback';
 END IF;
END $do$;
DROP FUNCTION IF EXISTS public.tallybook_shop_variants(text,jsonb);
DROP FUNCTION IF EXISTS private.shop_variant_action(text,uuid,uuid,jsonb);
DROP INDEX IF EXISTS public.shop_products_variant_unique;
ALTER TABLE public.shop_products DROP CONSTRAINT IF EXISTS shop_products_variant_valid;
ALTER TABLE public.shop_products DROP COLUMN IF EXISTS variant_color;
ALTER TABLE public.shop_products DROP COLUMN IF EXISTS variant_size;
ALTER TABLE public.shop_products DROP COLUMN IF EXISTS variant_family;
COMMIT;
