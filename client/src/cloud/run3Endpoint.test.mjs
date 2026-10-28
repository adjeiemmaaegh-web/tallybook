import test from 'node:test';
import assert from 'node:assert/strict';
import {QA_SUPABASE_ORIGIN,QA_RUN3_ENDPOINT,resolveRun3Endpoint} from './run3Endpoint.mjs';
const configured=()=>({qaEndpoint:QA_RUN3_ENDPOINT,supabaseUrl:QA_SUPABASE_ORIGIN,
  isPreview:true,publishableKey:'sb_publishable_test_key'});
test('normal build continues using disabled local server Run3 route',()=>{
 assert.deepEqual(resolveRun3Endpoint({}),{base:'/api/run3/membership',key:null});
});
test('isolated QA preview selects only exact expected HTTPS endpoint',()=>{
 assert.deepEqual(resolveRun3Endpoint(configured()),
  {base:QA_RUN3_ENDPOINT,key:'sb_publishable_test_key'});
});
test('rejects production project tokens routed to QA function',()=>{
 for(const origin of ['https://qfyydfxwvifdvffdfgeu.supabase.co','http://localhost:54321',
   'https://attacker.invalid']){
  assert.throws(()=>resolveRun3Endpoint({...configured(),supabaseUrl:origin}),/configuration denied/);
 }
});
test('rejects spoofed, prefixed, and query modified endpoint URLs',()=>{
 for(const url of ['https://attacker.invalid/functions/v1/tallybook-run3-qa',
  QA_RUN3_ENDPOINT+'/extra',QA_RUN3_ENDPOINT+'?access_token=x','http://'+
  'lmneuqxfyxplrxjswpma.supabase.co/functions/v1/tallybook-run3-qa']){
  assert.throws(()=>resolveRun3Endpoint({...configured(),qaEndpoint:url}),/configuration denied/);
 }
});
test('preview flag and publishable key are both required',()=>{
 assert.throws(()=>resolveRun3Endpoint({...configured(),isPreview:false}),/configuration denied/);
 assert.throws(()=>resolveRun3Endpoint({...configured(),publishableKey:''}),/configuration denied/);
});
