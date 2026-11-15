import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261115090000_shop_public_order_requests.sql",import.meta.url),"utf8");
const rollback=readFileSync(new URL("../supabase/rollback/20261115090000_shop_public_order_requests_down.sql",import.meta.url),"utf8");
const app=readFileSync(new URL("../client/src/App.tsx",import.meta.url),"utf8");
test("guest intake creates separate requests without touching financial tables",()=>{
 assert.match(sql,/CREATE TABLE public\.shop_public_order_requests/i);
 assert.match(sql,/CREATE TABLE public\.shop_public_order_shares/i);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|TRUNCATE)\s+public\.shop_(?:sales|payments|store_stock|sale_lines|stock_movements)\b/i);
 assert.match(sql,/public\.shop_online_orders\(business_id,id\)/);
 assert.match(sql,/private\.shop_stage_d_online_action\('createOnlineOrder'/);
 assert.match(sql,/Prices changed; confirm a new quote/i);
});
test("guest sees a catalogue, never private cost, stock or customer ledgers",()=>{
 assert.match(sql,/p_action NOT IN \('catalog','submit'\)/);
 assert.match(sql,/WHERE business_id=v_share\.business_id AND active=true/);
 assert.doesNotMatch(sql,/jsonb_build_object\([^;]*'costMinor'/);
 assert.match(sql,/REVOKE ALL ON TABLE public\.shop_public_order_shares,public\.shop_public_order_requests/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.tallybook_guest_order\(text,jsonb\) TO anon,authenticated/i);
 assert.match(sql,/WHERE share_id=v_share\.id AND created_at>v_now-interval '1 minute'/);
});
test("business owners explicitly issue and can revoke links, staff cannot see PII",()=>{
 assert.match(sql,/private\.shop_member_role\(p_actor,p_session,v_company\)/);
 assert.match(sql,/IF v_role<>'owner' THEN/);
 assert.match(sql,/p_action='createShare'/);
 assert.match(sql,/p_action='revokeShare'/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.tallybook_public_order_admin\(text,jsonb\) TO authenticated/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.tallybook_public_order_admin\(text,jsonb\) FROM PUBLIC,anon/i);
});
test("no customer data is lost through a routine rollback",()=>{
 assert.match(rollback,/IF EXISTS\(SELECT 1 FROM public\.shop_public_order_shares\)/);
 assert.match(rollback,/RAISE EXCEPTION 'Public order records exist/);
 assert.match(app,/location === '\/order'/);
 assert.match(app,/PublicShopOrderPage/);
});
