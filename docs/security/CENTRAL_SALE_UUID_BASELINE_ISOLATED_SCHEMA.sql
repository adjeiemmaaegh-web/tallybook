-- Additive, isolated-test candidate against the live UUID businesses/business_members baseline.
-- NOT a Supabase migration and NOT applied to the connected project.
-- Private server writes only. Enrollment and HTTP transport are not enabled.

-- company_id is already the primary key in the live binding table. This
-- redundant composite uniqueness lets the event FK prove the exact local ID.
alter table public.company_local_bindings
 add constraint company_local_bindings_company_local_key unique (company_id,local_company_id);

create table public.company_store_scopes (
 company_id uuid not null references public.businesses(id),
 id text not null check (id ~ '^[A-Za-z0-9:_-]{1,128}$'),
 status text not null check (status in ('active','revoked')),
 primary key (company_id,id)
);
create table public.company_staff_identities (
 company_id uuid not null,
 id text not null check (id ~ '^[A-Za-z0-9:_-]{1,128}$'),
 user_id uuid not null,
 active boolean not null default true,
 primary key (company_id,id),
 unique (company_id,user_id),
 foreign key (company_id,user_id) references public.business_members(business_id,user_id) on delete cascade
);
create table public.company_staff_store_assignments (
 company_id uuid not null,
 store_id text not null,
 staff_id text not null,
 active boolean not null default true,
 primary key (company_id,store_id,staff_id),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,staff_id) references public.company_staff_identities(company_id,id)
);
create table public.company_device_keys (
 company_id uuid not null,
 id text not null check (id ~ '^[A-Za-z0-9:_-]{1,128}$'),
 store_id text not null,
 user_id uuid not null,
 public_key_spki_pem text not null check (char_length(public_key_spki_pem) between 80 and 500),
 status text not null check (status in ('active','revoked')),
 approved_by uuid not null,
 approved_at timestamptz not null,
 primary key (company_id,id),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,user_id) references public.business_members(business_id,user_id) on delete cascade,
 foreign key (company_id,approved_by) references public.business_members(business_id,user_id)
);
create table public.company_signed_sale_events (
 company_id uuid not null references public.businesses(id),
 local_company_id text not null check (char_length(local_company_id) between 1 and 128),
 operation_id text not null,
 event_id text not null,
 store_id text not null,
 staff_id text not null,
 device_id text not null,
 actor_id uuid not null,
 payload_sha256 char(64) not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 payload jsonb not null,
 evidence_status text not null default 'upload_claim_only' check (evidence_status='upload_claim_only'),
 received_at_utc timestamptz not null,
 primary key (company_id,operation_id),
 unique (company_id,event_id),
 foreign key (company_id,local_company_id) references public.company_local_bindings(company_id,local_company_id),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,staff_id) references public.company_staff_identities(company_id,id),
 foreign key (company_id,device_id) references public.company_device_keys(company_id,id),
 foreign key (company_id,actor_id) references public.business_members(business_id,user_id)
);
create index company_signed_sale_events_received on public.company_signed_sale_events(company_id,received_at_utc);

alter table public.company_store_scopes enable row level security;
alter table public.company_staff_identities enable row level security;
alter table public.company_staff_store_assignments enable row level security;
alter table public.company_device_keys enable row level security;
alter table public.company_signed_sale_events enable row level security;
revoke all on public.company_store_scopes,public.company_staff_identities,
 public.company_staff_store_assignments,public.company_device_keys,
 public.company_signed_sale_events from public,anon,authenticated;
-- Only an owner may read uploaded claims; no browser role can write any table.
create policy company_signed_sale_owner_read on public.company_signed_sale_events
 for select to authenticated using (
  exists(select 1 from public.businesses b where b.id=company_signed_sale_events.company_id
    and b.owner_id=(select auth.uid()))
 );
grant select on public.company_signed_sale_events to authenticated;
