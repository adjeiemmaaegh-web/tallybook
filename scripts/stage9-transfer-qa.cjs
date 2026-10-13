const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const root = 'client/src/features/stores/';
const transfer = fs.readFileSync(root+'storeTransfers.ts','utf8');
const match = transfer.match(/export function validateTransferRequest\([\s\S]*?\n}\n/);
assert.ok(match);
const js = ts.transpileModule(match[0],{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod = {exports:{}};
vm.runInNewContext(js,{exports:mod.exports,Error,Number});
const fn=mod.exports.validateTransferRequest;
let count=0;
assert.equal(fn('store1','store2','product1',1),undefined);count++;
for(const args of [['a','a','p',1],['','b','p',1],['a','b','',1],['a','b','p',0],['a','b','p',-1],['a','b','p',1.5],['a','b','p',NaN],['a','b','p',Infinity],['a','b','p',10000000]]) {assert.throws(()=>fn(...args));count++;}
for(const file of [root+'storeTransfers.ts',root+'storeReport.ts','client/src/pages/StoresPage.tsx','client/src/db/TallybookDB.ts']) {const ast=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);assert.equal(ast.parseDiagnostics.length,0,file+' syntax');count++;}
const database=fs.readFileSync('client/src/db/TallybookDB.ts','utf8');assert.match(database,/DATABASE_SCHEMA_VERSION = 24/);count++;assert.match(database,/this\.version\(24\)\.stores/);count++;
assert.doesNotMatch(transfer,/\.stockQuantity\s*=|inventoryMovements\.add|sales\.add|payments\.add/);count++;
assert.match(transfer,/businessProfileId !== company/);count++;
assert.match(transfer,/requirePermission\("staff"/);count++;
console.log(`Stage 9 transfer and report: ${count} checks passed`);
