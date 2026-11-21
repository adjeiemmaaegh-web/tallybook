-- Read-only functions only; no data is held, so this rollback is always safe.
BEGIN;
DROP FUNCTION public.tallybook_shop_shift_reconciliation(text,jsonb);
DROP FUNCTION private.shop_shift_reconciliation(text,uuid,uuid,jsonb);
COMMIT;
