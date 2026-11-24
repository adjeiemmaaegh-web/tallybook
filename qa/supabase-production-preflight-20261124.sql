-- Tallybook DBA read-only production preflight for the planned six migrations.
-- DO NOT apply any migration solely because this gate passes.
-- Requires a separately verified off-database backup, restore proof, quiet window and owner production approval.
DO $tallybook_production_preflight$
BEGIN
 IF (SELECT count(*) FROM supabase_migrations.schema_migrations)<>37 THEN
  RAISE EXCEPTION 'PRE_FLIGHT_FAIL: production history changed; investigate first';
 END IF;
 IF EXISTS(SELECT 1 FROM (VALUES
   ('20261013123347','business_identity'),
   ('20261013123702','restrict_rls_helper'),
   ('20261014113009','company_binding_recovery_server_only'),
   ('20261014115304','company_recovery_reviewer_audit'),
   ('20261105022238','stakeholder_session_bound_membership'),
   ('20261105070036','shared_shop_ledger'),
   ('20261105110003','shared_shop_refunds_and_opening_import'),
   ('20261105120712','shared_shop_full_till'),
   ('20261110110434','shop_refund_policy'),
   ('20261110110609','invite_24h'),
   ('20261110110626','shop_stage_c_read_models'),
   ('20261110110705','shop_stage_d_stock_workflows'),
   ('20261110110806','shop_stage_d_purchase_payables'),
   ('20261110110840','shop_stage_d_online_orders'),
   ('20261110110901','shop_purchase_order_read_model'),
   ('20261110110905','shared_order_lines'),
   ('20261110134316','shop_sales_hot_path_indexes'),
   ('20261110134347','shop_sales_search'),
   ('20261111021126','shop_product_details'),
   ('20261111021150','shop_daily_report'),
   ('20261111064900','shop_attendant_stock'),
   ('20261111065003','shop_customer_archive'),
   ('20261111065040','shop_join_codes'),
   ('20261111065118','shop_expenses'),
   ('20261111065155','shop_refund_requests'),
   ('20261111070921','shop_profit_report'),
   ('20261111100842','shop_quotations'),
   ('20261111100923','shop_accounts'),
   ('20261111202349','shop_staff_shifts_audit'),
   ('20261112120000','telegram_bot'),
   ('20261114232617','phase_b_cloud_business_type'),
   ('20261115054858','shop_product_variants_20261115'),
   ('20261115054910','shop_stocktake_batch_sessions_20261115'),
   ('20261115054925','shop_public_order_requests_20261115'),
   ('20261115183938','tallybook_active_session_proof'),
   ('20261115183943','company_creation_active_session'),
   ('20261115190133','telegram_daily_summary')
 ) AS expected(version,name)
 LEFT JOIN supabase_migrations.schema_migrations h
 ON h.version=expected.version AND h.name=expected.name
 WHERE h.version IS NULL) THEN
  RAISE EXCEPTION 'PRE_FLIGHT_FAIL: unexpected production migration name/version';
 END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r')<>59 THEN
  RAISE EXCEPTION 'PRE_FLIGHT_FAIL: production baseline public table count changed';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity) THEN
  RAISE EXCEPTION 'PRE_FLIGHT_FAIL: RLS missing from a public table';
 END IF;
 IF to_regclass('public.businesses') IS NULL
    OR to_regclass('public.shop_sales') IS NULL
    OR to_regclass('public.shop_refunds') IS NULL
    OR to_regclass('public.shop_sale_tenders') IS NULL
    OR to_regclass('public.shop_staff_shifts') IS NULL
    OR to_regclass('public.shop_public_order_requests') IS NULL
    OR to_regprocedure('public.tallybook_active_session_proof()') IS NULL
    OR to_regprocedure('private.set_cloud_business_type(uuid,text)') IS NULL
    OR to_regprocedure('private.shop_int(jsonb,text,bigint,bigint)') IS NULL
  THEN RAISE EXCEPTION 'PRE_FLIGHT_FAIL: expected migration prerequisites unavailable'; END IF;
 IF to_regclass('public.cc_outbox') IS NOT NULL
    OR to_regclass('public.payment_intents') IS NOT NULL
    OR to_regprocedure('public.tallybook_shop_shift_reconciliation(text,jsonb)') IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='shop_public_order_quote_evidence')
  THEN RAISE EXCEPTION 'PRE_FLIGHT_FAIL: one of the six pending migrations may have been partially applied'; END IF;
END $tallybook_production_preflight$;
SELECT jsonb_build_object('preflight','PASS (read-only)','migration_count',37,
 'public_tables',59,'production_modified',false,
 'backup_verified',false,'rollback_drill_with_real_data',false,
 'owner_production_approval',false) AS status;
