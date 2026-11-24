-- Staging only, repeatable SQL impersonation check of the three public SELECT RLS policies.
-- NOT a replacement for real GoTrue JWT/session acceptance. Does not send sign-in emails.
-- Fails if staging holds ANY existing users/businesses: this is for an isolated empty project.
-- The savepoint is rolled back, and the test verifies no synthetic records remain.
BEGIN;
SAVEPOINT rls_test;
DO $empty$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users)
    OR EXISTS(SELECT 1 FROM public.businesses)
    OR EXISTS(SELECT 1 FROM public.business_members)
    OR EXISTS(SELECT 1 FROM public.profiles)
 THEN RAISE EXCEPTION 'STAGING_TEST_REFUSED: database not empty'; END IF;
END $empty$;
INSERT INTO auth.users(id,email,aud,role) VALUES
 ('10000000-0000-4000-8000-0000000000a1','owner-a@staging.tallybook.invalid','authenticated','authenticated'),
 ('10000000-0000-4000-8000-0000000000b2','owner-b@staging.tallybook.invalid','authenticated','authenticated'),
 ('10000000-0000-4000-8000-0000000000c3','attendant@staging.tallybook.invalid','authenticated','authenticated');
INSERT INTO public.profiles(id) VALUES ('10000000-0000-4000-8000-0000000000a1'),('10000000-0000-4000-8000-0000000000b2'),('10000000-0000-4000-8000-0000000000c3');
INSERT INTO public.businesses(id,owner_id,name,creation_request_id) VALUES
 ('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','STG A','30000000-0000-4000-8000-0000000000a1'),
 ('20000000-0000-4000-8000-0000000000b2','10000000-0000-4000-8000-0000000000b2','STG B','30000000-0000-4000-8000-0000000000b2');
INSERT INTO public.business_members(business_id,user_id,role) VALUES
 ('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000a1','owner'),
 ('20000000-0000-4000-8000-0000000000a1','10000000-0000-4000-8000-0000000000c3','attendant'),
 ('20000000-0000-4000-8000-0000000000b2','10000000-0000-4000-8000-0000000000b2','owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-0000000000a1',true);
DO $owner_a$ BEGIN
 IF (SELECT count(*) FROM public.businesses)<>1
    OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE name='STG A')
    OR EXISTS(SELECT 1 FROM public.businesses WHERE name='STG B')
    OR (SELECT count(*) FROM public.business_members)<>1
    OR (SELECT count(*) FROM public.profiles)<>1
 THEN RAISE EXCEPTION 'RLS_FAIL: owner A tenant isolation'; END IF;
END $owner_a$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-0000000000b2',true);
DO $owner_b$ BEGIN
 IF (SELECT count(*) FROM public.businesses)<>1
    OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE name='STG B')
    OR EXISTS(SELECT 1 FROM public.businesses WHERE name='STG A')
    OR (SELECT count(*) FROM public.business_members)<>1
    OR (SELECT count(*) FROM public.profiles)<>1
 THEN RAISE EXCEPTION 'RLS_FAIL: owner B tenant isolation'; END IF;
END $owner_b$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-0000000000c3',true);
DO $attendant$ BEGIN
 IF (SELECT count(*) FROM public.businesses)<>1
    OR NOT EXISTS(SELECT 1 FROM public.businesses WHERE name='STG A')
    OR EXISTS(SELECT 1 FROM public.businesses WHERE name='STG B')
    OR (SELECT count(*) FROM public.business_members)<>1
    OR (SELECT count(*) FROM public.profiles)<>1
 THEN RAISE EXCEPTION 'RLS_FAIL: assigned attendant isolation'; END IF;
END $attendant$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-0000000000d4',true);
DO $unrelated$ BEGIN
 IF EXISTS(SELECT 1 FROM public.businesses)
    OR EXISTS(SELECT 1 FROM public.business_members)
    OR EXISTS(SELECT 1 FROM public.profiles)
 THEN RAISE EXCEPTION 'RLS_FAIL: unrelated user can see tenant rows'; END IF;
 IF has_table_privilege('authenticated','public.businesses','INSERT')
    OR has_table_privilege('authenticated','public.business_members','UPDATE')
 THEN RAISE EXCEPTION 'RLS_FAIL: unexpected identity table direct DML'; END IF;
END $unrelated$;
RESET ROLE;
ROLLBACK TO SAVEPOINT rls_test;
COMMIT;
SELECT (SELECT count(*) FROM auth.users)=0 AS users_rolled_back,
       (SELECT count(*) FROM public.businesses)=0 AS businesses_rolled_back,
       (SELECT count(*) FROM public.business_members)=0 AS memberships_rolled_back,
       (SELECT count(*) FROM public.profiles)=0 AS profiles_rolled_back;
