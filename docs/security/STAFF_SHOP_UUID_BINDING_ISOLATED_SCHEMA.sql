-- Additive isolated-test audit extension for owner-confirmed staff/shop binding.
-- Requires CENTRAL_SALE_UUID_BASELINE_ISOLATED_SCHEMA.sql. Not live-applied.
create table public.company_staff_store_binding_audit (
 id bigint generated always as identity primary key,
 company_id uuid not null references public.businesses(id),
 local_company_id text not null,
 store_id text not null,
 staff_id text not null,
 target_user_id uuid not null,
 actor_id uuid not null,
 event_at timestamptz not null,
 foreign key (company_id,local_company_id) references public.company_local_bindings(company_id,local_company_id),
 foreign key (company_id,store_id) references public.company_store_scopes(company_id,id),
 foreign key (company_id,staff_id) references public.company_staff_identities(company_id,id),
 foreign key (company_id,target_user_id) references public.business_members(business_id,user_id),
 foreign key (company_id,actor_id) references public.business_members(business_id,user_id)
);
create index company_staff_store_binding_audit_company
 on public.company_staff_store_binding_audit(company_id,event_at desc);
alter table public.company_staff_store_binding_audit enable row level security;
revoke all on public.company_staff_store_binding_audit from public,anon,authenticated;
revoke all on sequence public.company_staff_store_binding_audit_id_seq from public,anon,authenticated;
