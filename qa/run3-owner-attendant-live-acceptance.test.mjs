import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,runJourney} from './run3-owner-attendant-live-acceptance.mjs';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const config=()=>({RUN3_QA_DISPOSABLE_PROJECT_APPROVED:'I_APPROVE_RUN3_DISPOSABLE_PROJECT',
 RUN3_QA_RUN_MUTATIONS:'I_APPROVE_RUN3_MEMBERSHIP_WRITES',
 RUN3_QA_URL:'https://lmneuqxfyxplrxjswpma.supabase.co',
 RUN3_QA_PUBLISHABLE_KEY:'sb_publishable_fixture_key',RUN3_QA_COMPANY_A:a,
 RUN3_QA_COMPANY_B:b,RUN3_QA_OWNER_A_TOKEN:'a'.repeat(40),
 RUN3_QA_OWNER_B_TOKEN:'b'.repeat(40),RUN3_QA_ATTENDANT_A_TOKEN:'c'.repeat(40),
 RUN3_QA_MEMBERSHIP_API:'https://lmneuqxfyxplrxjswpma.supabase.co/functions/v1/tallybook-run3-qa'});
test('requires two separate explicit disposable test approvals',()=>{
  const env=config();delete env.RUN3_QA_RUN_MUTATIONS;
  assert.throws(()=>validateConfig(env),/explicit approval/);
  env.RUN3_QA_RUN_MUTATIONS='I_APPROVE_RUN3_MEMBERSHIP_WRITES';
  delete env.RUN3_QA_DISPOSABLE_PROJECT_APPROVED;
  assert.throws(()=>validateConfig(env),/explicit approval/);
});
test('only the fixed isolated Supabase project is accepted',()=>{
  const env=config();env.RUN3_QA_URL='https://qfyydfxwvifdvffdfgeu.supabase.co';
  assert.throws(()=>validateConfig(env),/origin mismatch/);
  env.RUN3_QA_URL='https://lmneuqxfyxplrxjswpma.supabase.co';
  assert.equal(validateConfig(env).authOrigin,env.RUN3_QA_URL);
});
test('rejects missing tokens and duplicate logins',()=>{
  const env=config();env.RUN3_QA_ATTENDANT_A_TOKEN=env.RUN3_QA_OWNER_A_TOKEN;
  assert.throws(()=>validateConfig(env),/independent/);
  delete env.RUN3_QA_OWNER_B_TOKEN;
  assert.throws(()=>validateConfig(env),/missing/);
});
test('rejects production, insecure, and static Supabase membership backends',()=>{
  for(const api of ['http://localhost/api/run3/membership',
   'https://tallybook-eight.vercel.app/api/run3/membership',
   'https://lmneuqxfyxplrxjswpma.supabase.co/api/run3/membership',
   'https://private-test.example/other','https://u:p@private-test.example/api/run3/membership']){
    assert.throws(()=>validateConfig({...config(),RUN3_QA_MEMBERSHIP_API:api}),/exact isolated QA/);
  }
});
test('rejects reused company IDs and bad UUIDs',()=>{
  assert.throws(()=>validateConfig({...config(),RUN3_QA_COMPANY_B:a}),/separate company/);
  assert.throws(()=>validateConfig({...config(),RUN3_QA_COMPANY_A:'x'}),/separate company/);
});
test('refuses a static HTML / SPA response instead of treating it as a successful auth result',async()=>{
  const fetcher=async()=>({status:200,headers:new Map([['content-type','text/html']]),json:async()=>({})});
  await assert.rejects(runJourney(validateConfig(config()),fetcher),/Non-JSON response/);
});
test('preflight never logs or returns credentials through URL',()=>{
  const v=validateConfig(config());
  assert.deepEqual(Object.keys(v).sort(),['api','authOrigin','companyA','companyB','key','tokens']);
  assert.ok(!v.api.includes('Bearer '));
});
test('acceptance only accepts the exact deployed isolated Edge path',()=>{
 assert.equal(validateConfig(config()).api,'https://lmneuqxfyxplrxjswpma.supabase.co/functions/v1/tallybook-run3-qa');
});
