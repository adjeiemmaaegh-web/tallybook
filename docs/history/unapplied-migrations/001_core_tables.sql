-- Tallybook V19 central workspace DRAFT v1. Apply to a NEW, isolated test project only.
-- Financial tables are intentionally NOT browser-writable: verified ingest is a later gate.
create table if not exists public.tb_businesses (
 id text primary key check (length(id) between 1 and 128),
 name text not null check (length(trim(name)) between 1 and 200),
 currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
 policy_snapshot jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table if not exists public.tb_shops (
 business_id text not null references public.tb_businesses(id),
 id text not null, name text not null, timezone text not null default 'Africa/Accra',
 active boolean not null default true,
 primary key (business_id,id)
);
create table if not exists public.tb_staff (
 business_id text not null references public.tb_businesses(id),
 id text not null, auth_user_id uuid references auth.users(id),
 display_name text not null, active boolean not null default true,
 primary key (business_id,id), unique (business_id,auth_user_id)
);
create table if not exists public.tb_memberships (
 business_id text not null references public.tb_businesses(id),
 auth_user_id uuid not null references auth.users(id),
 staff_id text not null,
 role text not null check (role in ('owner','manager','attendant')),
 active boolean not null default true,
 primary key (business_id,auth_user_id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id)
);
create table if not exists public.tb_shop_assignments (
 business_id text not null, shop_id text not null, staff_id text not null,
 active boolean not null default true,
 primary key (business_id,shop_id,staff_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id)
);
create table if not exists public.tb_devices (
 business_id text not null, id text not null, shop_id text not null,
 auth_user_id uuid not null references auth.users(id),
 registration_proof_digest text, active boolean not null default false,
 enrolled_at timestamptz not null default now(), revoked_at timestamptz,
 primary key (business_id,id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 check (registration_proof_digest is null or registration_proof_digest ~ '^[a-f0-9]{64}$')
);
create table if not exists public.tb_shifts (
 business_id text not null, id text not null, shop_id text not null,
 staff_id text not null, device_id text not null, operation_id text not null,
 opened_at_device timestamptz not null, closed_at_device timestamptz,
 opening_float_minor bigint not null check (opening_float_minor >= 0),
 counted_cash_minor bigint check (counted_cash_minor >= 0),
 expected_cash_minor bigint check (expected_cash_minor >= 0),
 variance_minor bigint,
 received_at_server timestamptz not null default now(),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 check (closed_at_device is null or closed_at_device >= opened_at_device)
);
create table if not exists public.tb_sales (
 business_id text not null, id text not null, shop_id text not null,
 staff_id text not null, device_id text not null, shift_id text not null,
 operation_id text not null, receipt_number text not null,
 occurred_at_device timestamptz not null, received_at_server timestamptz not null default now(),
 currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
 subtotal_minor bigint not null check (subtotal_minor >= 0),
 discount_minor bigint not null check (discount_minor >= 0),
 tax_minor bigint not null default 0 check (tax_minor >= 0),
 total_minor bigint not null check (total_minor >= 0),
 paid_minor bigint not null check (paid_minor >= 0),
 outstanding_minor bigint not null check (outstanding_minor >= 0),
 payment_method text not null check (payment_method in ('cash','card','mobile','credit','wallet')),
 policy_snapshot jsonb not null default '{}'::jsonb,
 primary key (business_id,id), unique (business_id,operation_id), unique (business_id,receipt_number),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 foreign key (business_id,shift_id) references public.tb_shifts(business_id,id),
 check (discount_minor <= subtotal_minor),
 check (total_minor = subtotal_minor - discount_minor + tax_minor),
 check (total_minor = paid_minor + outstanding_minor)
);
create table if not exists public.tb_sale_lines (
 business_id text not null, id text not null, sale_id text not null,
 product_id text not null, quantity bigint not null check (quantity > 0),
 unit_price_minor bigint not null check (unit_price_minor >= 0),
 line_total_minor bigint not null check (line_total_minor >= 0),
 primary key (business_id,id),
 foreign key (business_id,sale_id) references public.tb_sales(business_id,id)
);
create table if not exists public.tb_payments (
 business_id text not null, id text not null, sale_id text not null,
 shop_id text not null, staff_id text not null, device_id text not null,
 operation_id text not null, occurred_at_device timestamptz not null,
 received_at_server timestamptz not null default now(),
 method text not null check (method in ('cash','card','mobile')),
 amount_minor bigint not null check (amount_minor > 0),
 provider_id text, merchant_account_id text, reference text,
 settlement_status text not null default 'claimed' check (settlement_status in ('claimed','verified','disputed')),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,sale_id) references public.tb_sales(business_id,id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 check (method <> 'mobile' or (nullif(trim(coalesce(provider_id,'')),'') is not null and nullif(trim(coalesce(reference,'')),'') is not null))
);
-- Partial unique only for non-empty MoMo reference; compare case-insensitively within provider/account.
create unique index if not exists tb_momo_reference_uniq on public.tb_payments
 (business_id, lower(provider_id), lower(coalesce(merchant_account_id,'')), upper(trim(reference)))
 where method='mobile';
create table if not exists public.tb_adjustments (
 business_id text not null, id text not null, shop_id text not null,
 staff_id text not null, device_id text not null, shift_id text not null,
 operation_id text not null, sale_id text not null,
 kind text not null check (kind in ('void','full_reversal','return','partial_refund','payment_adjustment','discount')),
 amount_minor bigint not null check (amount_minor >= 0),
 reason text not null check (length(trim(reason))>0),
 approved_by text, policy_snapshot jsonb not null default '{}'::jsonb,
 original_operation_id text,
 disbursement_status text not null default 'not_recorded' check (disbursement_status in ('not_recorded','physically_confirmed','provider_confirmed')),
 occurred_at_device timestamptz not null, received_at_server timestamptz not null default now(),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,sale_id) references public.tb_sales(business_id,id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 foreign key (business_id,shift_id) references public.tb_shifts(business_id,id)
);
create table if not exists public.tb_drawer_events (
 business_id text not null, id text not null, shop_id text not null,
 staff_id text not null, device_id text not null, shift_id text not null,
 operation_id text not null, event_type text not null check (event_type in ('no_sale','drawer_open')),
 reason text not null check (length(trim(reason)) between 1 and 140),
 authorized_by text not null,
 occurred_at_device timestamptz not null, received_at_server timestamptz not null default now(),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 foreign key (business_id,shift_id) references public.tb_shifts(business_id,id)
);
create table if not exists public.tb_cash_counts (
 business_id text not null, id text not null, shop_id text not null,
 staff_id text not null, device_id text not null, shift_id text not null,
 operation_id text not null, counted_minor bigint not null check (counted_minor >= 0),
 expected_minor bigint not null check (expected_minor >= 0),
 variance_minor bigint not null,
 occurred_at_device timestamptz not null, received_at_server timestamptz not null default now(),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id),
 foreign key (business_id,staff_id) references public.tb_staff(business_id,id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id),
 foreign key (business_id,shift_id) references public.tb_shifts(business_id,id),
 check (variance_minor = counted_minor - expected_minor)
);
create table if not exists public.tb_sync_operations (
 business_id text not null, operation_id text not null,
 entity_type text not null, entity_id text not null,
 device_id text not null, payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
 schema_version integer not null check (schema_version > 0),
 received_at_server timestamptz not null default now(),
 primary key (business_id,operation_id),
 foreign key (business_id,device_id) references public.tb_devices(business_id,id)
);
create table if not exists public.tb_audit_events (
 business_id text not null, id text not null, shop_id text,
 staff_id text, device_id text, operation_id text not null,
 action text not null, source_entity_id text not null,
 details jsonb not null default '{}'::jsonb,
 received_at_server timestamptz not null default now(),
 primary key (business_id,id), unique (business_id,operation_id),
 foreign key (business_id,shop_id) references public.tb_shops(business_id,id)
);
