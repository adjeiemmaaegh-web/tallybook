-- Production session hardening for initial business creation.
-- A signed JWT's user ID is not enough after its Supabase auth.sessions row is revoked.
begin;
create or replace function private.create_owned_business(business_name text, request_id uuid)
returns public.businesses language plpgsql security definer set search_path = '' as $body$
declare
  actor uuid := auth.uid();
  sid uuid;
  result public.businesses;
  checked_at timestamptz := clock_timestamp();
begin
  begin
    sid := (auth.jwt()->>'session_id')::uuid;
  exception when invalid_text_representation then sid := null;
  end;
  if actor is null or sid is null then
    raise exception 'Active Auth session required' using errcode = '42501';
  end if;
  perform 1 from auth.sessions s
   where s.id = sid and s.user_id = actor
     and (s.not_after is null or s.not_after > checked_at)
   for share;
  if not found then
    raise exception 'Active Auth session required' using errcode = '42501';
  end if;
  if request_id is null or business_name is null or length(btrim(business_name)) not between 1 and 80 then
    raise exception 'Invalid business creation request';
  end if;
  insert into public.profiles(id) values(actor) on conflict(id) do nothing;
  insert into public.businesses(owner_id,name,creation_request_id) values(actor,btrim(business_name),request_id)
    on conflict(owner_id,creation_request_id) do nothing;
  select * into strict result from public.businesses where owner_id=actor and creation_request_id=request_id;
  if result.name <> btrim(business_name) then raise exception 'Request ID reused with different details'; end if;
  insert into public.business_members(business_id,user_id,role) values(result.id,actor,'owner') on conflict do nothing;
  return result;
end $body$;
commit;
