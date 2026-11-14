import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../supabase/migrations/20261115012500_cloud_business_type.sql",import.meta.url),"utf8");
const down=readFileSync(new URL("../supabase/rollback/20261115012500_cloud_business_type_down.sql",import.meta.url),"utf8");
test("business type migration is additive to the member-owned business row",()=>{
 assert.match(sql,/ADD COLUMN IF NOT EXISTS business_type text/i);
 assert.match(sql,/business_type IS NULL OR business_type IN/i);
 assert.doesNotMatch(sql,/\bUPDATE\s+public\.business_members\b/i);
 assert.doesNotMatch(sql,/\bALTER\s+TABLE\s+public\.businesses\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i);
});
test("privileged change checks actual authenticated owner and canonical membership",()=>{
 assert.match(sql,/actor uuid := auth\.uid\(\)/i);
 assert.match(sql,/result\.owner_id<>actor/i);
 assert.match(sql,/FROM public\.business_members m/i);
 assert.match(sql,/m\.role='owner'/i);
 assert.match(sql,/SECURITY DEFINER SET search_path=''/i);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.set_cloud_business_type\(uuid,text\) FROM PUBLIC, anon/i);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.set_cloud_business_type\(uuid,text\) TO authenticated/i);
});
test("rollback refuses to erase owner-populated business classifications",()=>{
 assert.match(down,/WHERE business_type IS NOT NULL/i);
 assert.match(down,/RAISE EXCEPTION/i);
 assert.match(down,/ROLLBACK|COMMIT/i);
});
