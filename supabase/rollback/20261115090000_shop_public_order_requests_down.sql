-- Fail-closed rollback: a share or request is business data, even when revoked/declined.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.shop_public_order_shares)
   OR EXISTS(SELECT 1 FROM public.shop_public_order_requests) THEN
  RAISE EXCEPTION 'Public order records exist; export and reconcile before approved irreversible migration';
 END IF;
END $guard$;
DROP FUNCTION IF EXISTS public.tallybook_public_order_admin(text,jsonb);
DROP FUNCTION IF EXISTS private.shop_public_order_admin_action(text,uuid,uuid,jsonb);
DROP FUNCTION IF EXISTS public.tallybook_guest_order(text,jsonb);
DROP FUNCTION IF EXISTS private.shop_guest_order_action(text,jsonb);
DROP TABLE IF EXISTS public.shop_public_order_requests;
DROP TABLE IF EXISTS public.shop_public_order_shares;
COMMIT;
