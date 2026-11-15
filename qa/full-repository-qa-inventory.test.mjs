import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {auditRepository,inspectSourceLine} from '../scripts/full-repository-qa-inventory.mjs';

test('risk indicators identify executable sinks while revealing no source snippets',()=>{
  assert.deepEqual(inspectSourceLine('window.eval(userValue)'),['dynamic_code_execution']);
  assert.deepEqual(inspectSourceLine('const x = 5;'),[]);
  assert.ok(inspectSourceLine("localStorage.setItem('token', credential)").includes('potential_secret_storage'));
});
test('source/test counts and code-review locations are deterministic for a small fixture',()=>{
  const base=mkdtempSync(join(tmpdir(),'tallybook-qa-fixture-'));
  try {
    mkdirSync(join(base,'client/src'),{recursive:true});
    mkdirSync(join(base,'qa'),{recursive:true});
    mkdirSync(join(base,'.github/workflows'),{recursive:true});
    writeFileSync(join(base,'client/src/safe.ts'),'export const safe = 1;\n');
    writeFileSync(join(base,'client/src/risky.ts'),'const x = eval(code);\n');
    writeFileSync(join(base,'client/src/safe.test.ts'),'test(1);');
    writeFileSync(join(base,'qa/route.spec.mjs'),'test(2);');
    writeFileSync(join(base,'.github/workflows/test.yml'),'name: test\n');
    const a=auditRepository(base);
    assert.equal(a.statistics.sourceFiles,2);
    assert.equal(a.statistics.testFiles,2);
    assert.equal(a.statistics.sourceWithDirectCompanion,1);
    assert.deepEqual(a.indicators,[{type:'dynamic_code_execution',path:'client/src/risky.ts',line:1}]);
    assert.equal(a.largestModules.length,2);
    assert.equal(a.statistics.workflowFiles,1);
    assert.equal(JSON.stringify(a).includes('eval(code)'),false);
  }finally{rmSync(base,{recursive:true,force:true});}
});
