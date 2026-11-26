-- Tallybook production restore comparison manifest, read-only.
-- Output contains only counts, structural metadata and timestamp, not personal records.
-- PRE-RESTORE AND POST-RESTORE counts must be captured as close to the backup snapshot
-- as operationally possible. This manifest is NOT a database backup.
SELECT jsonb_build_object(
  'captured_at_utc',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'database',current_database(),
  'postgres_version',current_setting('server_version'),
  'estimated_database_bytes',pg_database_size(current_database()),
  'migrations',(SELECT count(*) FROM supabase_migrations.schema_migrations),
  'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
  'public_tables_missing_rls',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity),
  'not_valid_constraints',(SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','private') AND NOT c.convalidated),
  'auth_users',(SELECT count(*) FROM auth.users),
  'auth_sessions',(SELECT count(*) FROM auth.sessions),
  'auth_identities',(SELECT count(*) FROM auth.identities),
  'businesses',(SELECT count(*) FROM public.businesses),
  'memberships',(SELECT count(*) FROM public.business_members),
  'profiles',(SELECT count(*) FROM public.profiles),
  'products',(SELECT count(*) FROM public.shop_products),
  'sales',(SELECT count(*) FROM public.shop_sales),
  'sale_lines',(SELECT count(*) FROM public.shop_sale_lines),
  'payments',(SELECT count(*) FROM public.shop_payments),
  'refunds',(SELECT count(*) FROM public.shop_refunds),
  'refund_lines',(SELECT count(*) FROM public.shop_refund_lines),
  'stock_movements',(SELECT count(*) FROM public.shop_stock_movements),
  'storage_buckets',(SELECT count(*) FROM storage.buckets),
  'storage_objects',(SELECT count(*) FROM storage.objects)
) AS restore_comparison_manifest;