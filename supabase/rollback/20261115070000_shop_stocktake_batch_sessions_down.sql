-- Non-destructive rollback only. Refuse to destroy any batch session or line history.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.shop_stocktake_batches)
  OR EXISTS(SELECT 1 FROM public.shop_stocktake_batch_lines) THEN
  RAISE EXCEPTION 'Batch stocktake records exist; export and reconcile before a separately approved migration';
 END IF;
END $guard$;
DROP FUNCTION IF EXISTS public.tallybook_shop_stocktake_batches(text,jsonb);
DROP FUNCTION IF EXISTS private.shop_stocktake_batch_action(text,uuid,uuid,jsonb);
DROP TABLE IF EXISTS public.shop_stocktake_batch_lines;
DROP TABLE IF EXISTS public.shop_stocktake_batches;
COMMIT;
