import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFinding,verifyFinding} from '../scripts/triage-secret-findings.mjs';
const secret='a'.repeat(64);
const row={RuleID:'generic-api-key',File:'STAGE1_SHA256_MANIFEST.json',Secret:secret,Match:'api-key.txt: '+secret};
test('only reviewed digest fields with exact JSON values are verified',()=>{
 assert.equal(verifyFinding(row,{sourceFiles:[JSON.stringify({'client/api-key.ts':secret})]}),'verified-sha256-manifest-value');
 assert.equal(verifyFinding({...row,File:'docs/reconciliation/file_sha256_comparison.json'},{sourceFiles:[JSON.stringify([{source_sha256:secret}])]}),'verified-sha256-manifest-value');
 for(const source of ['invalid',JSON.stringify({OPENAI_API_KEY:secret}),JSON.stringify({'api-key.txt':'b'.repeat(64)})]){
  assert.equal(verifyFinding(row,{sourceFiles:[source]}),'unclassified');
 }
 assert.equal(verifyFinding({...row,File:'server/credentials.json'},{sourceFiles:[JSON.stringify({'file.txt':secret})]}),'unclassified');
});
test('submission IDs require exact literal and source evidence in a reviewed financial fixture',()=>{
 const fixture={...row,File:'qa/shop-sale-validation.test.mjs',Secret:'sale-'+ 'x'.repeat(20),Match:"submissionKey:'sale-"+'x'.repeat(20)+"'"};
 assert.equal(verifyFinding(fixture,{sourceFiles:['const data={'+fixture.Match+'};']}),'verified-nonauthentication-submission-id');
 assert.equal(verifyFinding(fixture,{sourceFiles:[]}),'unclassified');
 assert.equal(verifyFinding({...fixture,Match:"apiKey:'"+fixture.Secret+"'"},{sourceFiles:[fixture.Match]}),'unclassified');
 assert.equal(verifyFinding({...fixture,File:'server/auth.mjs'},{sourceFiles:[fixture.Match]}),'unclassified');
});
test('Git references need an actual commit object and the reviewed branch manifest',()=>{
 const ref={...row,File:'qa/branch-cleanup-manifest-20261113.json',Secret:'a'.repeat(40)};
 assert.equal(verifyFinding(ref,{isCommit:()=>true}),'verified-git-object-reference');
 assert.equal(verifyFinding(ref,{isCommit:()=>false}),'unclassified');
 assert.equal(verifyFinding({...ref,File:'.env'},{isCommit:()=>true}),'unclassified');
});
test('private keys and arbitrary credentials never inherit a nonsecret classification',()=>{
 for(const RuleID of ['private-key','aws-access-token','generic-api-key']){
  assert.equal(verifyFinding({...row,RuleID,File:'server/config.mjs'}),'unclassified');
 }
 assert.equal(classifyFinding({...row,Secret:'x'.repeat(64)}),'unclassified');
});
