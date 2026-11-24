-- Tallybook: read-only hosted database release gate, repository main 63d70aec (2026-11-24).
-- No schema or application data changes. Staging expected to have the 43 approved SQL migrations.
-- Run as the DBA on staging after each migration and on production ONLY after separately approved rollout.
-- Every failure raises and blocks promotion.
DO $tallybook_database_gate$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 43 THEN
    RAISE EXCEPTION 'GATE_FAIL: expected 43 recorded repository migrations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (VALUES
    ('20261013123347','business_identity','43063945b9951174c60ede62d92ad50a7cf654e9'),
    ('20261013123702','restrict_rls_helper','43009f9c2ddbd5159431ddaa50149eaca9a1e5db'),
    ('20261014113009','company_binding_recovery_server_only','3f6c398f1be74095dc352ba67f6be18dc5010d50'),
    ('20261014115304','company_recovery_reviewer_audit','b3bbf92ab865d9cf28cb996921db6673bbc58bfb'),
    ('20261105022238','stakeholder_session_bound_membership','97c5bd3d6fe2e86ce57aecde686c90be7785d938'),
    ('20261105070036','shared_shop_ledger','134fe38568826090d017fc756205529a128dc500'),
    ('20261105110003','shared_shop_refunds_and_opening_import','6776a78c3a40b67f001f1449c5fa046bf63c4c8d'),
    ('20261105120712','shared_shop_full_till','795e875237505cc0ed2b5a18b63227216b22ba7a'),
    ('20261106120000','shop_refund_policy','4c18026eb5ce488bbdb64a624f0f9adf6a7f51b7'),
    ('20261106130000','invite_24h','8ea45ac757ccd44985e78adaea048c82c485fa59'),
    ('20261108100000','shop_stage_c_read_models','39a1b3ec076f7977e948199ebf314ff621e5d18f'),
    ('20261108110000','shop_stage_d_stock_workflows','bb41eb50b2358e8d80aee5d791e4a8fbf9d17f38'),
    ('20261108120000','shop_stage_d_purchase_payables','524baf4094a331a3e72fd464fabf566952cfbbe8'),
    ('20261108130000','shop_stage_d_online_orders','f2fa4a817ec7d80d328cfb2b77bd5be535381509'),
    ('20261109010000','shop_purchase_order_read_model','7f2421e90ff91b1cc6571992e16eb7cc1ee854c4'),
    ('20261109020000','shared_order_lines','eb2754275f6a3f0104b71a967c7146edf773087b'),
    ('20261110120000','shop_sales_hot_path_indexes','908c2a6b727e9373132571310a7b30a6aee02d27'),
    ('20261110130000','shop_sales_search','2217d018d5d53d03b22341323b6a3f48aefa1f47'),
    ('20261110140000','shop_product_details','ee8a5e90cd306c0cc92bc5855e6f7638d96e5ba8'),
    ('20261110150000','shop_daily_report','7e9d7a381c3cdbbdf30c40e788a6e8bee3be0545'),
    ('20261111100000','shop_attendant_stock','13dbcc1d578e818d1b81e96e27f547d6e39f6f30'),
    ('20261111110000','shop_customer_archive','c828b7855ca7f4086ac239499dbdf781cf00f6e4'),
    ('20261111120000','shop_join_codes','a317dae768ec6769713966ee5830827daef70e2d'),
    ('20261111130000','shop_expenses','d51c32163da6d83818f5cf8c26c44dc69e62d1e3'),
    ('20261111140000','shop_refund_requests','451b7177a5cdeaa6b6448d4431678d2d18d9ab49'),
    ('20261111150000','shop_profit_report','90a3c977ee73742c33353e127d3792cec126d848'),
    ('20261111160000','shop_quotations','bc3bc015a424ed38e1a1255c1e4145cf0bcaee35'),
    ('20261111170000','shop_accounts','d0dea55d21350109db4c9386be31ce2a91705eb9'),
    ('20261111180000','shop_staff_shifts_audit','8acfc02d632dd45004ad4f36e491aad53e806a34'),
    ('20261112120000','telegram_bot','026f6fd02dc586c479d5308fd9c7551e318f6763'),
    ('20261113201509','tallybook_active_session_proof','60adc6458c67872250e4c8ba8f401bad4e34ac27'),
    ('20261114120000','company_creation_active_session','c66c697874559059258d5ae78e493cac36007cf4'),
    ('20261115012500','cloud_business_type','d59d3f0523a2ec09ea9bb1f90c3f2f56f4c3ac28'),
    ('20261115033500','shop_product_variants','e9399466e9bd410e0195b4f2ea4b58839e5c74df'),
    ('20261115070000','shop_stocktake_batch_sessions','2dfce3a95019cf9a6188be9a74ecd2df2326b04a'),
    ('20261115090000','shop_public_order_requests','fd8afd4fcab08e13e0cd27ebd0caf5a434c4792d'),
    ('20261116090000','telegram_daily_summary','3e86c0603635eee78f916905ccc87ddd0aab58bd'),
    ('20261117052213','business_type_active_session','80d8b5b8c88b88783e3c0ea01be9b7946c8a721c'),
    ('20261117060608','guest_order_price_snapshots','0293c934b75b6d63582a135636427c0ca37a1929'),
    ('20261120090000','connected_commerce_platform','6cdd8916e320a2d0ef106b6f3f0cf9e39ac1c678'),
    ('20261121090000','connected_commerce_discover','e8561eaf1b2f102bd9bea57d219076df43350f0e'),
    ('20261121120000','payment_settlement_ledger','076db9a38b337f2df145b4f4769486a1982a70bb'),
    ('20261121150000','shift_cash_reconciliation','a7a92b42970492e2a81a63af3f9f613680d6eeda')
    ) AS e(version,name,sha)
    LEFT JOIN supabase_migrations.schema_migrations h ON h.version=e.version AND h.name=e.name
    WHERE h.version IS NULL OR
      encode(extensions.digest(
        convert_to('blob '||octet_length(h.statements[1])::text,'UTF8') ||
        decode('00','hex') || convert_to(h.statements[1],'UTF8'),'sha1'),'hex')
      IS DISTINCT FROM e.sha
  ) THEN
    RAISE EXCEPTION 'GATE_FAIL: migration history differs from source version, name or exact SHA';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND NOT c.relrowsecurity
  ) THEN RAISE EXCEPTION 'GATE_FAIL: exposed public table without RLS'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')
        OR has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE')
        OR (c.relname NOT IN ('profiles','businesses','business_members')
          AND has_table_privilege('authenticated',c.oid,'SELECT')))
  ) THEN RAISE EXCEPTION 'GATE_FAIL: unexpected direct Data API table privilege'; END IF;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='public')<>3
     OR EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND NOT ((tablename='profiles' AND policyname='own_profile')
        OR (tablename='businesses' AND policyname='member_business')
        OR (tablename='business_members' AND policyname='own_membership')))
  THEN RAISE EXCEPTION 'GATE_FAIL: public table RLS policies have drifted'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND p.proname NOT IN ('tallybook_guest_order','tallybook_cc_discover_public')
  ) THEN RAISE EXCEPTION 'GATE_FAIL: unexpected anonymous SECURITY DEFINER RPC'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='private'
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
       OR (has_function_privilege('authenticated',p.oid,'EXECUTE')
         AND p.proname NOT IN ('create_owned_business','set_cloud_business_type')))
  ) THEN RAISE EXCEPTION 'GATE_FAIL: unexpectedly executable private helper'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','private') AND p.prosecdef
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) v WHERE v LIKE 'search_path=%')
  ) THEN RAISE EXCEPTION 'GATE_FAIL: SECURITY DEFINER without fixed search_path'; END IF;

  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='r')<72
    OR to_regclass('public.cc_outbox') IS NULL
    OR to_regclass('public.cc_discover_requests') IS NULL
    OR to_regclass('public.payment_intents') IS NULL
    OR to_regclass('public.payment_events') IS NULL
    OR to_regprocedure('public.tallybook_shop_shift_reconciliation(text,jsonb)') IS NULL
    OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='shop_public_order_quote_evidence'
                  AND tgrelid='public.shop_public_order_requests'::regclass AND tgenabled='O')
  THEN RAISE EXCEPTION 'GATE_FAIL: required post-migration objects missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND (c.relname LIKE 'cc_%' OR c.relname LIKE 'payment_%')
      AND NOT c.relforcerowsecurity
  ) THEN RAISE EXCEPTION 'GATE_FAIL: payment/commerce table must FORCE RLS'; END IF;
END $tallybook_database_gate$;

SELECT jsonb_build_object(
 'database_gate','PASS','migration_count',(SELECT count(*) FROM supabase_migrations.schema_migrations),
 'public_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'),
 'security_definer_anon_allowlist','guest_order/discover_public',
 'owner_test_accounts','NOT_TESTED','backup_restore','NOT_TESTED'
) AS status;
