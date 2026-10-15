import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../docs/security/STAGE9_RUN2_VERIFIED_RECOVERY_SCHEMA_REVIEW.sql',import.meta.url),'utf8');
test('new private evidence schema never exposes browser writer credentials',()=>{
  for(const name of ['company_recovery_reviewers','company_recovery_verified_evidence']){
    assert.match(sql,new RegExp(`alter table public\\.${name} force row level security;`));
    assert.match(sql,new RegExp(`revoke all on public\\.${name} from public,anon,authenticated;`));
  }
  assert.doesNotMatch(sql,/grant\s+(?:all|select|insert|update|delete)\s+on\s+public\./i);
});
test('verified evidence enforces independent reviewer and digest receipt shape',()=>{
  assert.match(sql,/check \(reviewer_id <> owner_id\)/);
  assert.match(sql,/backup_manifest_sha256\s+~\s+'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql,/restore_receipt_sha256\s+~\s+'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql,/transfer_review_sha256\s+~\s+'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(sql,/status text not null default 'pending' check \\(status in \\('pending','verified','consumed','revoked'\\)\\)/);
  assert.match(sql,/status='pending' and verified_at is null/);
  assert.match(sql,/status in \\('verified','consumed'\\) and verified_at is not null/);
  assert.doesNotMatch(sql,/default 'verified'/);
});
