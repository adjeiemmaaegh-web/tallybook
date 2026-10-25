-- Deliberately safe test fixture entry point. Does not create forged auth.users identities.
-- Use isolated test project and an authorized Auth test-user creation harness before provisioning.
begin;
select 'Set up two real test auth identities in isolated project, then provision businesses/shops/memberships' as prerequisite;
rollback;
