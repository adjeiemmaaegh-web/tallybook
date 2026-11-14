import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261115033500_shop_product_variants.sql",import.meta.url),"utf8");
const down=readFileSync(new URL("../supabase/rollback/20261115033500_shop_product_variants_down.sql",import.meta.url),"utf8");
test("variant migration cannot reassign stock or rewrite existing sale history",()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS variant_family text/i);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS shop_products_variant_unique/i);
 assert.match(sql,/AND kind='good' AND track_stock=true/i);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.shop_store_stock\b/i);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.shop_sale_lines\b/i);
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\s+public\.shop_products\b/i);
});
test("variant writes use authenticated, active-session, owner-only company privileges",()=>{
 assert.match(sql,/v_role:=private\.shop_member_role\(p_actor,p_session,v_company\)/i);
 assert.match(sql,/IF v_role<>'owner' THEN RAISE EXCEPTION/i);
 assert.match(sql,/p\.business_id=v_company AND p\.id=v_product FOR UPDATE/i);
 assert.match(sql,/FROM public\.shop_ledgers WHERE business_id=v_company FOR UPDATE/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.shop_variant_action.*FROM PUBLIC,anon,authenticated/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.tallybook_shop_variants\(text,jsonb\) TO authenticated/i);
});
test("variant rollback refuses silent loss of configured groups",()=>{
 assert.match(down,/WHERE variant_family IS NOT NULL/i);
 assert.match(down,/RAISE EXCEPTION 'Product variant metadata exists/i);
});
