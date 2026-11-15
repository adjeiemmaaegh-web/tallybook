import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261115070000_shop_stocktake_batch_sessions.sql",import.meta.url),"utf8");
const down=readFileSync(new URL("../supabase/rollback/20261115070000_shop_stocktake_batch_sessions_down.sql",import.meta.url),"utf8");
const api=readFileSync(new URL("../client/src/cloud/shopBatchStocktake.ts",import.meta.url),"utf8");
test("batch stocktake is additive and cannot rewrite historical sales or existing one-SKU counts",()=>{
 assert.match(sql,/CREATE TABLE public\.shop_stocktake_batches/i);
 assert.match(sql,/CREATE TABLE public\.shop_stocktake_batch_lines/i);
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|TRUNCATE)\s+public\.shop_(?:sales|sale_lines|stock_counts|transfers)\b/i);
 assert.match(sql,/PRIMARY KEY\(batch_id,product_id\)/);
});
test("every mutation must pass active membership, owner and shared finance/stock serialization",()=>{
 assert.match(sql,/private\.shop_member_role\(p_actor,p_session,v_company\)/i);
 assert.match(sql,/IF v_role<>'owner' THEN/i);
 assert.match(sql,/FROM public\.shop_ledgers WHERE business_id=v_company FOR UPDATE/i);
 assert.match(sql,/REVOKE ALL ON TABLE public\.shop_stocktake_batches,public\.shop_stocktake_batch_lines FROM PUBLIC,anon,authenticated/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION private\.shop_stocktake_batch_action/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.tallybook_shop_stocktake_batches\(text,jsonb\) TO authenticated/i);
 assert.match(sql,/FORCE ROW LEVEL SECURITY/);
});
test("all lines are checked before committing stock, with exact replay and stale-snapshot rejection",()=>{
 assert.match(sql,/BETWEEN 2 AND 50/);
 assert.match(sql,/Product selected twice/);
 assert.match(sql,/Batch ID already used with different products/);
 assert.match(sql,/Count every original product exactly once/);
 assert.match(sql,/Batch already posted with different counts/);
 assert.match(sql,/Stock changed since this batch was opened/);
 assert.match(sql,/private\.shop_derived_uuid\(v_batch,'stocktake-batch-'/);
 assert.match(sql,/INSERT INTO public\.shop_stock_movements/);
 assert.match(sql,/UPDATE public\.shop_stocktake_batches\s+SET status='applied'/);
 assert.equal((sql.match(/\bCOMMIT;/gi)??[]).length,1);
});
test("no partial-data-loss rollback or unverified empty reads",()=>{
 assert.match(down,/IF EXISTS\(SELECT 1 FROM public\.shop_stocktake_batches\)/i);
 assert.match(down,/RAISE EXCEPTION 'Batch stocktake records exist/i);
 assert.match(api,/validateBatchList\(result\?\.batches\)/);
 assert.match(api,/throw Error\("Batch history is unavailable or malformed\."/);
});
