-- Hosted dry run of the owner-to-attendant journey on a real Supabase project.
-- Run AFTER the shared shop migration exists in the same transaction (or is
-- applied). It creates throwaway demo identities, exercises the journey as the
-- `authenticated` role and ALWAYS ends with an exception, so every row it
-- wrote is rolled back. A message starting "DRYRUN PASS" means success.
do $dry$
declare
  owner uuid := gen_random_uuid(); attendant uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  s_owner uuid := gen_random_uuid(); s_att uuid := gen_random_uuid(); s_str uuid := gen_random_uuid();
  biz uuid; store_a uuid := gen_random_uuid(); store_b uuid := gen_random_uuid(); eggs uuid := gen_random_uuid();
  r jsonb; inv jsonb; sale jsonb; err text; steps int := 0;
begin
  insert into auth.users (id, email, aud, role) values
    (owner, 'dryrun-owner-' || owner || '@demo.tallybook.test', 'authenticated', 'authenticated'),
    (attendant, 'dryrun-att-' || attendant || '@demo.tallybook.test', 'authenticated', 'authenticated'),
    (stranger, 'dryrun-str-' || stranger || '@demo.tallybook.test', 'authenticated', 'authenticated');
  insert into auth.sessions (id, user_id) values (s_owner, owner), (s_att, attendant), (s_str, stranger);

  create function pg_temp.as_user(fn text, uid uuid, sid uuid, action text, input jsonb) returns jsonb
  language plpgsql as $f$
  declare out jsonb;
  begin
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'session_id', sid, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    execute format('select public.%I($1, $2)', fn) into out using action, input;
    perform set_config('role', 'postgres', true);
    return out;
  exception when others then
    perform set_config('role', 'postgres', true);
    raise;
  end $f$;
  create function pg_temp.refused(fn text, uid uuid, sid uuid, action text, input jsonb, expect text) returns void
  language plpgsql as $f$
  begin
    perform pg_temp.as_user(fn, uid, sid, action, input);
    raise exception 'EXPECTED REFUSAL DID NOT HAPPEN: % %', action, input;
  exception when others then
    if sqlerrm like 'EXPECTED REFUSAL%' or sqlerrm !~* expect then raise exception 'step % : %', action, sqlerrm; end if;
  end $f$;

  -- Owner creates a business through the production function.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner, 'session_id', s_owner, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  select (public.create_owned_business('Dry run shop', gen_random_uuid())).id into biz;
  perform set_config('role', 'postgres', true);
  steps := steps + 1;

  perform pg_temp.as_user('tallybook_shop', owner, s_owner, 'setupLedger', jsonb_build_object('companyId', biz, 'currency', 'GHS'));
  perform pg_temp.as_user('tallybook_shop', owner, s_owner, 'saveStore', jsonb_build_object('companyId', biz, 'storeId', store_a, 'name', 'Madina'));
  perform pg_temp.as_user('tallybook_shop', owner, s_owner, 'saveStore', jsonb_build_object('companyId', biz, 'storeId', store_b, 'name', 'Osu'));
  perform pg_temp.as_user('tallybook_shop', owner, s_owner, 'saveProduct', jsonb_build_object('companyId', biz, 'productId', eggs, 'name', 'Crate of eggs', 'unitPriceMinor', 4500));
  r := pg_temp.as_user('tallybook_shop', owner, s_owner, 'adjustStock', jsonb_build_object('companyId', biz, 'storeId', store_a, 'productId', eggs, 'delta', 5, 'operationId', gen_random_uuid()));
  if (r->>'quantity')::int <> 5 then raise exception 'restock wrong: %', r; end if;
  steps := steps + 1;

  -- Invitation by email through the production invitation function.
  inv := pg_temp.as_user('tallybook_shop', owner, s_owner, 'inviteByEmail', jsonb_build_object('companyId', biz, 'email', 'dryrun-att-' || attendant || '@demo.tallybook.test'));
  perform pg_temp.refused('tallybook_membership', stranger, s_str, 'accept', jsonb_build_object('inviteToken', inv->>'inviteToken'), 'unavailable');
  r := pg_temp.as_user('tallybook_membership', attendant, s_att, 'accept', jsonb_build_object('inviteToken', inv->>'inviteToken'));
  if r->>'role' <> 'attendant' then raise exception 'accept wrong: %', r; end if;
  steps := steps + 1;

  sale := jsonb_build_object('companyId', biz, 'storeId', store_a, 'submissionKey', replace(gen_random_uuid()::text, '-', ''),
    'paymentMethod', 'cash', 'amountTenderedMinor', 10000, 'lines', jsonb_build_array(jsonb_build_object('productId', eggs, 'quantity', 2)));
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'recordSale', sale, 'not assigned');
  perform pg_temp.as_user('tallybook_shop', owner, s_owner, 'assignStore', jsonb_build_object('companyId', biz, 'storeId', store_a, 'userId', attendant));
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'saveProduct', jsonb_build_object('companyId', biz, 'productId', eggs, 'name', 'x', 'unitPriceMinor', 0), 'Only the business owner');
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'recordSale', sale || jsonb_build_object('storeId', store_b, 'submissionKey', replace(gen_random_uuid()::text, '-', '')), 'not assigned');
  perform pg_temp.refused('tallybook_shop', stranger, s_str, 'overview', jsonb_build_object('companyId', biz), 'access denied');
  perform pg_temp.refused('tallybook_shop', attendant, gen_random_uuid(), 'overview', jsonb_build_object('companyId', biz), 'session');
  steps := steps + 1;

  -- The sale, then a retry after a "lost response".
  r := pg_temp.as_user('tallybook_shop', attendant, s_att, 'recordSale', sale);
  if (r->>'totalMinor')::int <> 9000 or (r->'payment'->>'changeMinor')::int <> 1000 or (r->>'replayed')::boolean then raise exception 'sale wrong: %', r; end if;
  r := pg_temp.as_user('tallybook_shop', attendant, s_att, 'recordSale', sale);
  if not (r->>'replayed')::boolean then raise exception 'retry not replayed: %', r; end if;
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'recordSale', sale || jsonb_build_object('amountTenderedMinor', 9000), 'different details');
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'recordSale', sale || jsonb_build_object('submissionKey', replace(gen_random_uuid()::text, '-', ''), 'lines', jsonb_build_array(jsonb_build_object('productId', eggs, 'quantity', 4))), 'only 3 left');
  if (select count(*) from public.shop_sales where business_id = biz) <> 1
     or (select count(*) from public.shop_payments where business_id = biz) <> 1
     or (select quantity from public.shop_store_stock where store_id = store_a and product_id = eggs) <> 3
     or (select count(*) from public.shop_stock_movements where business_id = biz and reason = 'sale') <> 1
  then raise exception 'records not exactly once'; end if;
  steps := steps + 1;

  -- Owner sees the sale; browser roles cannot touch tables directly.
  r := pg_temp.as_user('tallybook_shop', owner, s_owner, 'listSales', jsonb_build_object('companyId', biz));
  if jsonb_array_length(r->'sales') <> 1 then raise exception 'owner sales: %', r; end if;
  begin
    perform set_config('role', 'authenticated', true);
    perform count(*) from public.shop_sales;
    raise exception 'DIRECT READ ALLOWED';
  exception when insufficient_privilege then perform set_config('role', 'postgres', true);
  end;
  begin
    perform set_config('role', 'anon', true);
    perform public.tallybook_shop('overview', jsonb_build_object('companyId', biz));
    raise exception 'ANON CALL ALLOWED';
  exception when insufficient_privilege then perform set_config('role', 'postgres', true);
  end;
  steps := steps + 1;

  -- Revocation removes store access in the same transaction.
  perform pg_temp.as_user('tallybook_membership', owner, s_owner, 'revokeMember', jsonb_build_object('companyId', biz, 'targetUserId', attendant));
  if exists (select 1 from public.shop_store_assignments where user_id = attendant) then raise exception 'assignment survived revoke'; end if;
  perform pg_temp.refused('tallybook_shop', attendant, s_att, 'recordSale', sale || jsonb_build_object('submissionKey', replace(gen_random_uuid()::text, '-', '')), 'access denied');
  steps := steps + 1;

  raise exception 'DRYRUN PASS: % journey stages verified; all rows rolled back', steps;
end $dry$;
