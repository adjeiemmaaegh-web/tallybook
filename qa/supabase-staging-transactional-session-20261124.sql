-- Transactional staging-only active-session proof simulation. No real token issued.
BEGIN;
SAVEPOINT staging_session_test;
DO $pre$ BEGIN IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.businesses) OR EXISTS(SELECT 1 FROM auth.sessions) THEN RAISE EXCEPTION 'STAGING NOT EMPTY'; END IF; END $pre$;
INSERT INTO auth.users(id,email,aud,role) VALUES
('10000000-0000-4000-8000-0000000000a1','role-test@staging.tallybook.invalid','authenticated','authenticated'),
('10000000-0000-4000-8000-0000000000b2','other@staging.tallybook.invalid','authenticated','authenticated');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES
('40000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1',now(),now());
INSERT INTO public.businesses(id,owner_id,name,creation_request_id) VALUES
('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','STG Session A','30000000-0000-4000-8000-0000000000a1'),
('20000000-0000-4000-8000-0000000000b2','10000000-0000-4000-8000-0000000000b2','STG Session B','30000000-0000-4000-8000-0000000000b2');
INSERT INTO public.business_members(business_id,user_id,role) VALUES
('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','owner'),
('20000000-0000-4000-8000-0000000000b2','10000000-0000-4000-8000-0000000000b2','owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-0000000000a1',true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-0000000000a1','session_id','40000000-0000-4000-8000-0000000000a1','exp',floor(extract(epoch from now()))::bigint+600,'role','authenticated')::text,true);
DO $valid$
BEGIN
 IF (public.tallybook_active_session_proof()->>'active') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'VALID_SESSION_NOT_ACCEPTED'; END IF;
 PERFORM public.set_cloud_business_type('20000000-0000-4000-8000-0000000000a1'::uuid,'Retail shop');
END $valid$;
DO $unauthorized$
BEGIN
 BEGIN
   PERFORM public.set_cloud_business_type('20000000-0000-4000-8000-0000000000b2'::uuid,'Retail shop');
   RAISE EXCEPTION 'WRONG_BUSINESS_WAS_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $unauthorized$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-0000000000a1','session_id','40000000-0000-4000-8000-0000000000b2','exp',floor(extract(epoch from now()))::bigint+600,'role','authenticated')::text,true);
DO $revoked$
BEGIN
 BEGIN
   PERFORM public.set_cloud_business_type('20000000-0000-4000-8000-0000000000a1'::uuid,'Retail shop');
   RAISE EXCEPTION 'MISSING_SESSION_WAS_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $revoked$;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub','10000000-0000-4000-8000-0000000000a1','session_id','40000000-0000-4000-8000-0000000000a1','exp',floor(extract(epoch from now()))::bigint-1,'role','authenticated')::text,true);
DO $expired$
BEGIN
 BEGIN
   PERFORM public.set_cloud_business_type('20000000-0000-4000-8000-0000000000a1'::uuid,'Retail shop');
   RAISE EXCEPTION 'EXPIRED_TOKEN_WAS_ACCEPTED';
 EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
 END;
END $expired$;
RESET ROLE;
ROLLBACK TO SAVEPOINT staging_session_test;
COMMIT;
SELECT (SELECT count(*) FROM auth.users)=0 AS users_rolled_back,
       (SELECT count(*) FROM auth.sessions)=0 AS sessions_rolled_back,
       (SELECT count(*) FROM public.businesses)=0 AS businesses_rolled_back;