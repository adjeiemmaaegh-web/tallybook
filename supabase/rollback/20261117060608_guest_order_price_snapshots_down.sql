-- Fail closed: dropping this guard would silently permit changed quotes again.
-- Review a forward corrective migration; never rewrite original quote records.
BEGIN;
DO $$ BEGIN
 RAISE EXCEPTION 'Guest quote protection is forward-only; preserve original price evidence';
END $$;
COMMIT;
