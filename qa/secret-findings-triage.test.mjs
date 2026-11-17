import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFinding} from '../scripts/triage-secret-findings.mjs';
test('unknown credentials, paths and rules stay unclassified',()=>{
 const base={RuleID:'generic-api-key',File:'server/config.mjs',Secret:'x'.repeat(64),Match:'api_key='+ 'x'.repeat(64)};
 assert.equal(classifyFinding(base),'unclassified');
 assert.equal(classifyFinding({...base,File:'STAGE1_SHA256_MANIFEST.json'}),'unclassified');
 assert.equal(classifyFinding({...base,File:'client/src/features/credit/credit.test.ts'}),'unclassified');
 assert.equal(classifyFinding({...base,RuleID:'private-key',File:'.env.txt'}),'unclassified');
});
test('review candidates have explicit file and field limits and never imply security acceptance',()=>{
 const digest='a'.repeat(64),base={RuleID:'generic-api-key',Secret:digest,Match:'file: '+digest};
 assert.equal(classifyFinding({...base,File:'STAGE1_SHA256_MANIFEST.json'}),'candidate-sha256-manifest-value');
 assert.equal(classifyFinding({...base,File:'qa/browser-auth.spec.mjs',Match:"submissionKey: '"+digest+"'"}),'candidate-nonauthentication-submission-id');
 assert.equal(classifyFinding({...base,File:'qa/browser-auth.spec.mjs',Match:"authorization: '"+digest+"'"}),'unclassified');
});
