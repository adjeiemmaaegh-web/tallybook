import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../docs/security/20261027_test_run3_targeted_membership_invites.sql', import.meta.url), 'utf8');
const code = source.replace(/--[^\n]*/g, '');
test('migration is explicitly disposable and refuses replay', () => {
  assert.match(source, /lmneuqxfyxplrxjswpma/);
  assert.match(source, /DO \$safety\$/);
  assert.match(code, /to_regclass\('public\.company_member_invites'\) IS NOT NULL/);
  assert.match(code, /RAISE EXCEPTION 'Run3 invitation tables already exist/);
});
test('invitation expires within fifteen minutes and stores digest only', () => {
  assert.match(code, /token_sha256 text NOT NULL UNIQUE/);
  assert.match(code, /interval '15 minutes'/);
  assert.match(code, /target_user_id <> invited_by/);
  assert.match(code, /status IN \('pending','accepted','revoked'\)/);
  assert.doesNotMatch(code, /\binvite_token\s+(?:text|varchar|bytea)\b/i);
});
test('new tables are RLS-forced and inaccessible to browser roles', () => {
  for(const t of ['company_member_invites', 'company_membership_audit']) {
    assert.match(code, new RegExp('ALTER TABLE public\\.'+t+' ENABLE ROW LEVEL SECURITY'));
    assert.match(code, new RegExp('ALTER TABLE public\\.'+t+' FORCE ROW LEVEL SECURITY'));
    assert.match(code, new RegExp('REVOKE ALL ON public\\.'+t+' FROM PUBLIC,anon,authenticated'));
  }
});
test('direct membership bypass RPCs revoked but business creation unchanged', () => {
  for(const schema of ['public', 'private']) {
    for(const name of ['add_business_attendant','remove_business_attendant']) {
      assert.ok(code.includes('REVOKE EXECUTE ON FUNCTION '+schema+'.'+name+'(uuid,uuid) FROM PUBLIC,anon,authenticated'));
    }
  }
  assert.doesNotMatch(code,/\b(?:REVOKE|DROP)\b[^;]*create_owned_business\b/i);
});
test('no canonical policy reset, user insert, direct grant or live migration', () => {
  assert.doesNotMatch(code,/\b(?:DROP POLICY|DELETE FROM|INSERT INTO auth\.users|ALTER TABLE public\.business_members|ALTER TABLE public\.businesses)\b/i);
  assert.doesNotMatch(code,/GRANT (?:INSERT|UPDATE|DELETE|ALL)\b/i);
});
