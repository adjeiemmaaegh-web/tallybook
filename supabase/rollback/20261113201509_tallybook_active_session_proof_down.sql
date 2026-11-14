begin;
-- Rollback removes only the opt-in session proof endpoint; no data is touched.
drop function if exists public.tallybook_active_session_proof();
commit;
