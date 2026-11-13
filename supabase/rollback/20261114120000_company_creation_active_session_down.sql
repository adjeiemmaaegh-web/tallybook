begin;
-- Restore the original business-creation implementation if the candidate is rolled back.
create or replace function private.create_owned_business(business_name text, request_id uuid)
returns public.businesses language plpgsql security definer set search_path = '' as $body$
declare actor uuid := auth.uid(); result public.businesses;
begin
  if actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if request_id is null or business_name is null or length(btrim(business_name)) not between 1 and 80 then raise exception 'Invalid business creation request'; end if;
  insert into public.profiles(id) values(actor) on conflict(id) do nothing;
  insert into public.businesses(owner_id,name,creation_request_id) values(actor,btrim(business_name),request_id)
    on conflict(owner_id,creation_request_id) do nothing;
  select * into strict result from public.businesses where owner_id=actor and creation_request_id=request_id;
  if result.name <> btrim(business_name) then raise exception 'Request ID reused with different details'; end if;
  insert into public.business_members(business_id,user_id,role) values(result.id,actor,'owner') on conflict do nothing;
  return result;
end $body$;
commit;
