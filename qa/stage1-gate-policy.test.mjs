import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyGate,summarizeStage1} from './stage1-gate-policy.mjs';
test('successful exit is PASS',()=>assert.equal(classifyGate({status:0}),'PASS'));
test('nonzero exit is FAIL',()=>assert.equal(classifyGate({status:1}),'FAIL'));
test('missing prerequisite is BLOCKED',()=>assert.equal(classifyGate({ready:false,status:0}),'BLOCKED'));
test('spawn errors are BLOCKED',()=>assert.equal(classifyGate({error:new Error('ENOENT')}),'BLOCKED'));
test('timeout signal is BLOCKED',()=>assert.equal(classifyGate({signal:'SIGTERM'}),'BLOCKED'));
test('unavailable status is not PASS',()=>assert.equal(classifyGate({status:null}),'FAIL'));
test('summary retains outstanding physical gates',()=>{
 const s=summarizeStage1([{status:'PASS'},{status:'BLOCKED'}],{node:'22.16.0',expectedNode:'24.19.0',pnpm:null,expectedPnpm:'10.34.0'});
 assert.deepEqual(s.counts,{PASS:1,FAIL:0,BLOCKED:1});
 assert.equal(s.environmentReady,false);
 assert.equal(s.stageAccepted,false);
 assert.equal(s.missingEvidence.length,3);
});
test('automated integration evidence is recorded but Windows recovery still blocks acceptance',()=>{
 const s=summarizeStage1([{status:'PASS'}],{
  node:'24.19.0',expectedNode:'24.19.0',pnpm:'10.34.0',expectedPnpm:'10.34.0',
  evidence:{'dexie-app-schema-integration':true,'transaction-company-isolation':true,'windows-browser-recovery':false},
 });
 assert.deepEqual(s.missingEvidence,['windows-browser-recovery']);
 assert.equal(s.environmentReady,true);
 assert.equal(s.stageAccepted,false);
});
test('stage acceptance requires all evidence and successful gates',()=>{
 const s=summarizeStage1([{status:'PASS'},{status:'PASS'}],{
  node:'24.19.0',expectedNode:'24.19.0',pnpm:'10.34.0',expectedPnpm:'10.34.0',
  evidence:{'dexie-app-schema-integration':true,'transaction-company-isolation':true,'windows-browser-recovery':true},
 });
 assert.deepEqual(s.missingEvidence,[]);
 assert.equal(s.stageAccepted,true);
});
test('unknown status fails closed',()=>assert.throws(()=>summarizeStage1([{status:'SKIP'}],{})));
