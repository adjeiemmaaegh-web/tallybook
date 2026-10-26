-- Isolated PGlite test schema extension for draft tb_* central tables.
-- Do not apply to the live Supabase project: its business identity baseline differs.
alter table public.tb_devices add column public_key_spki_pem text;

create table public.tb_signed_sale_events (
 business_id text not null references public.tb_businesses(id),
 operation_id text not null,
 event_id text not null,
 shop_id text not null,
 staff_id text not null,
 device_id text not null,
 actor_id uuid not null references auth.users(id),
 payload_sha256 char(64) not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 payload jsonb not null,
 evidence_status text not null default 'upload_claim_only' check (evidence_status='upload_claim_only'),
 received_at_utc timestamptz not null,
 primary key (business_id,operation_id),
 unique (business_id,event_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id)
);
alter table public.tb_signed_sale_events enable row level security;
revoke all on public.tb_signed_sale_events from anon,authenticated;
-- Owner review only. No browser INSERT/UPDATE/DELETE policy exists.
create policy tb_signed_sale_owner_read on public.tb_signed_sale_events for select to authenticated using (
 exists(select 1 from public.tb_memberships m where m.business_id=tb_signed_sale_events.business_id
   and m.auth_user_id=(select auth.uid()) and m.active and m.role in ('owner','manager'))
);
grant select on public.tb_signed_sale_events to authenticated;
