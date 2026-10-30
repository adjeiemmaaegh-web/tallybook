-- Isolated QA project only. Apply after reviewing the V54 signed-pull RPC.
-- Existing JSONB claims cannot recover their original signed bytes. Keep
-- their payload_base64 NULL and exclude them from financial replay.
DO $guard$
BEGIN
 IF to_regclass('public.company_signed_sale_events') IS NULL
 THEN RAISE EXCEPTION 'Signed sale event table missing'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='company_signed_sale_events'
     AND column_name='payload_base64')
 THEN RAISE EXCEPTION 'Exact payload column already exists; review before replay'; END IF;
END $guard$;

ALTER TABLE public.company_signed_sale_events
 ADD COLUMN payload_base64 text
 CHECK (payload_base64 IS NULL OR
        (char_length(payload_base64) BETWEEN 1 AND 87382 AND
         payload_base64 ~ '^[A-Za-z0-9_-]+$'));

COMMENT ON COLUMN public.company_signed_sale_events.payload_base64 IS
 'Original signed JSON bytes in base64url; NULL means historical exact bytes unavailable and financial replay forbidden.';
