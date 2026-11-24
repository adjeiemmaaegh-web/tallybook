-- Read/write-neutral rollback test of append-only evidence TRUNCATE barriers.
-- Each TRUNCATE must raise SQLSTATE 42501 *before* any data changes.
-- No synthetic or production records are inserted, and all statements stay in a transaction.
BEGIN;
SAVEPOINT append_only_assertions;
DO $evidence$
DECLARE count_refused int := 0;
BEGIN
  BEGIN
    TRUNCATE TABLE public.cc_audit_events;
    RAISE EXCEPTION 'GATE_FAIL: CC audit events truncated';
  EXCEPTION WHEN SQLSTATE '42501' THEN count_refused := count_refused + 1;
  END;
  BEGIN
    TRUNCATE TABLE public.cc_consent_events;
    RAISE EXCEPTION 'GATE_FAIL: consent evidence truncated';
  EXCEPTION WHEN SQLSTATE '42501' THEN count_refused := count_refused + 1;
  END;
  BEGIN
    TRUNCATE TABLE public.payment_events;
    RAISE EXCEPTION 'GATE_FAIL: payment evidence truncated';
  EXCEPTION WHEN SQLSTATE '42501' THEN count_refused := count_refused + 1;
  END;
  IF count_refused<>3 THEN
    RAISE EXCEPTION 'GATE_FAIL: not all audit/payment evidence TRUNCATE operations were refused';
  END IF;
END $evidence$;
ROLLBACK TO SAVEPOINT append_only_assertions;
COMMIT;
SELECT to_regclass('public.cc_audit_events') IS NOT NULL AS audit_table_preserved,
       to_regclass('public.cc_consent_events') IS NOT NULL AS consent_table_preserved,
       to_regclass('public.payment_events') IS NOT NULL AS payment_table_preserved;