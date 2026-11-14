-- Stage 3/22: optional company classification; display metadata, never authorization.
-- Existing businesses remain unclassified (NULL). Retail/sector labels grant no capabilities.
begin;
alter table public.businesses add column if not exists business_type text;
alter table public.businesses drop constraint if exists businesses_business_type_valid;
alter table public.businesses add constraint businesses_business_type_valid
  check (business_type is null or business_type in
    ('retail','wholesale','food','services','manufacturing','mixed','other'));
-- Existing business SELECT policy is member-scoped. Do not grant row/identity edits.
revoke update on table public.businesses from anon, authenticated;
grant update (business_type) on table public.businesses to authenticated;
drop policy if exists owner_classifies_business on public.businesses;
create policy owner_classifies_business on public.businesses
  for update to authenticated
  using (owner_id=(select auth.uid()))
  with check (owner_id=(select auth.uid()));
-- No SECURITY DEFINER, no browser service key, and no access to other columns.
commit;
