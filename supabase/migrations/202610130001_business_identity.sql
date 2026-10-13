-- Apply through Supabase migrations. No service key belongs in browser code.
begin;
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(btrim(name)) between 1 and 80),
  creation_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, creation_request_id)
);
create table public.business_members (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'attendant')),
  created_at timestamptz not null default now(),
  primary key(business_id, user_id)
);
create index business_members_user on public.business_members(user_id);
alter table public.profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
revoke all on public.profiles, public.businesses, public.business_members from anon, authenticated;
grant select on public.profiles, public.businesses, public.business_members to authenticated;
create policy own_profile on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy own_membership on public.business_members for select to authenticated using (user_id = (select auth.uid()));
create policy member_business on public.businesses for select to authenticated using (
  exists (select 1 from public.business_members m where m.business_id = businesses.id and m.user_id = (select auth.uid()))
);

-- Atomic, retry-safe creation: no caller-selected owner and no orphan business.
create function public.create_owned_business(business_name text, request_id uuid)
returns public.businesses language plpgsql security definer set search_path = '' as $$
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
end $$;

create function public.add_business_attendant(target_business uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.businesses where id=target_business and owner_id=auth.uid()) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  if target_user is null then raise exception 'Account required'; end if;
  insert into public.business_members(business_id,user_id,role) values(target_business,target_user,'attendant') on conflict do nothing;
end $$;

create function public.remove_business_attendant(target_business uuid, target_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.businesses where id=target_business and owner_id=auth.uid()) then
    raise exception 'Owner access required' using errcode='42501';
  end if;
  delete from public.business_members where business_id=target_business and user_id=target_user and role='attendant';
end $$;
revoke all on function public.create_owned_business(text,uuid), public.add_business_attendant(uuid,uuid), public.remove_business_attendant(uuid,uuid) from public, anon;
grant execute on function public.create_owned_business(text,uuid), public.add_business_attendant(uuid,uuid), public.remove_business_attendant(uuid,uuid) to authenticated;
commit;
