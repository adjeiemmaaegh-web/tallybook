const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const source = fs.readFileSync('client/src/features/stores/storeStockCounts.ts','utf8');
const match = source.match(/export function validateStoreStockCount\([\s\S]*?\n}\n/);
assert.ok(match, 'pure validation function exists');
const transpiled = ts.transpileModule(match[0], {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exportsObj={}; vm.runInNewContext(transpiled,{exports:exportsObj,Error,Number});
const fn=exportsObj.validateStoreStockCount;
let passes=0;
assert.equal(fn(0).quantity,0);passes++;
assert.equal(fn(9999999).quantity,9999999);passes++;
assert.equal(fn(3,'  counted  ').note,'counted');passes++;
for (const x of [-1,1.5,NaN,Infinity,10000000,Number.MAX_SAFE_INTEGER+1]) {assert.throws(()=>fn(x));passes++;}
assert.throws(()=>fn(1,'a'.repeat(241)));passes++;
assert.throws(()=>fn(1,'bad\nnote'));passes++;
assert.match(source,/database\.transaction\("rw"/);passes++;
assert.match(source,/businessProfileId !== company/);passes++;
assert.doesNotMatch(source,/\.stockQuantity\s*=/);passes++;
for(const file of ['client/src/features/stores/storeStockCounts.ts','client/src/pages/StoresPage.tsx','client/src/db/TallybookDB.ts']){
 const result=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);
 assert.equal(result.parseDiagnostics.length,0, `${file} must parse`);passes++;
}
const db=fs.readFileSync('client/src/db/TallybookDB.ts','utf8');
assert.match(db,/DATABASE_SCHEMA_VERSION = 24/);passes++;
assert.match(db,/this\.version\(23\)\.stores/);passes++;
console.log(`Stage 9 stock observation: ${passes} checks passed`);
