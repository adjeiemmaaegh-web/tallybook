-- Security fixes are forward-only; never silently reintroduce the revoked-session bypass.
BEGIN;
DO $guard$ BEGIN
 RAISE EXCEPTION 'Active-session business classification protection cannot be removed; use a reviewed forward corrective migration';
END $guard$;
COMMIT;
