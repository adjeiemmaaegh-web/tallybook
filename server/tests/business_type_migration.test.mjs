import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../../supabase/migrations/20261114125300_business_type_owner_metadata.sql",import.meta.url),"utf8");
test("business type migration is additive and does not grant member privileges",()=>{
 assert.match(sql,/add column if not exists business_type text/i);
 assert.match(sql,/revoke update on table public\.businesses from anon, authenticated/i);
 assert.match(sql,/grant update \(business_type\) on table public\.businesses to authenticated/i);
 assert.match(sql,/owner_id\s*=\s*\(select auth\.uid\(\)\)/i);
 assert.match(sql,/with check \(owner_id\s*=\s*\(select auth\.uid\(\)\)\)/i);
 assert.doesNotMatch(sql,/grant\s+update\s+on\s+(?:table\s+)?public\.businesses\s+to/i);
 assert.doesNotMatch(sql,/security definer/i);
 assert.doesNotMatch(sql,/drop\s+table\s+(?:if exists\s+)?public\.businesses/i);
});
