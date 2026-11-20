import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessCodeqlSarif,assessCodeqlDirectory} from '../scripts/check-codeql-sarif.mjs';
const document=(severity='8.1',properties={})=>({version:'2.1.0',runs:[{tool:{driver:{name:'CodeQL',rules:[{id:'js/test-rule',properties:{tags:['security'],'security-severity':severity,...properties}}]}},results:[{ruleId:'js/test-rule',level:'warning'}]}]});
test('actual high/critical findings block despite a warning level or prior suppression',()=>{
 for(const score of ['7','8.1',9,10]){const input=document(score);input.runs[0].results[0].suppressions=[{status:'accepted'}];const result=assessCodeqlSarif(input);assert.equal(result.allowed,false);assert.equal(result.findings[0].severity,Number(score));}
});
test('moderate/low findings remain visible without being relabelled critical',()=>{
 for(const [score,category]of [[6.9,'moderate'],[0,'low']]){const result=assessCodeqlSarif(document(score));assert.equal(result.allowed,true);assert.equal(result.counts[category],1);}
});
test('unknown security severity and unknown or ambiguous rules fail closed',()=>{
 for(const score of ['','NaN','8x',-1,11])assert.equal(assessCodeqlSarif(document(score)).allowed,false);
 const missing=document();delete missing.runs[0].tool.driver.rules[0].properties['security-severity'];assert.equal(assessCodeqlSarif(missing).counts.unknown,1);
 const unknown=document();unknown.runs[0].results[0].ruleId='js/unknown';assert.equal(assessCodeqlSarif(unknown).allowed,false);
 const ambiguous=document();ambiguous.runs[0].tool.driver.rules.push(ambiguous.runs[0].tool.driver.rules[0]);assert.equal(assessCodeqlSarif(ambiguous).allowed,false);
});
test('no findings is valid only for a complete real analyzer run',()=>{
 const clean=document();clean.runs[0].results=[];assert.equal(assessCodeqlSarif(clean).allowed,true);
 for(const input of [{},{version:'2.1.0',runs:[]},{version:'2.1.0',runs:[{tool:{driver:{name:'CodeQL',rules:[]}}}]}])assert.throws(()=>assessCodeqlSarif(input));
});
test('non-security diagnostics are counted separately, never discarded',()=>{
 const input=document();input.runs[0].tool.driver.rules[0].properties={tags:['maintainability']};
 const result=assessCodeqlSarif(input);assert.equal(result.allowed,true);assert.equal(result.counts['non-security'],1);
});
test('extension rule indexes resolve without borrowing another rule severity',()=>{
 const input=document('1');input.runs[0].tool.extensions=[{rules:[{id:'extension/security',properties:{tags:['security'],'security-severity':'9.1'}}]}];
 input.runs[0].results=[{rule:{toolComponent:{index:0},index:0}}];assert.equal(assessCodeqlSarif(input).allowed,false);
});
test('directory checks reject missing output and symlinks and aggregate real SARIF files',t=>{
 const root=mkdtempSync(join(tmpdir(),'tallybook-sarif-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 assert.throws(()=>assessCodeqlDirectory(root),/No CodeQL/);mkdirSync(join(root,'nested'));writeFileSync(join(root,'nested','result.sarif'),JSON.stringify(document('5')));
 assert.equal(assessCodeqlDirectory(root).counts.moderate,1);
 symlinkSync(join(root,'nested'),join(root,'unexpected'),'junction');assert.throws(()=>assessCodeqlDirectory(root),/symlink/);
});
