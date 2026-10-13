const fs=require('node:fs');const vm=require('node:vm');const assert=require('node:assert/strict');const ts=require('typescript');
const file='client/src/features/commerce/commerce.ts';let code=fs.readFileSync(file,'utf8');const rendered=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleExports={};const context={exports:moduleExports,require:(name)=>{if(name.includes('TallybookDB'))return {db:{}};if(name==='@/features/staff/staff')return {requirePermission:async()=>null};if(name.includes('activeCompany'))return {getActiveBusinessProfileId:()=> 'business-a'};throw Error(name)},crypto:require('node:crypto').webcrypto,Date,Set,Error,Number,Array,Promise};vm.runInNewContext(rendered,context);
const {calculateOrderTotal,requireCommerceCapability,COMMERCE_RELEASE_SCOPE}=moduleExports;
const line=(q,p)=>({productId:'p',name:'test',quantity:q,unitPriceMinor:p});
let n=0;function check(f){f();n++;}
check(()=>assert.equal(calculateOrderTotal([line(2,450)]),900));
check(()=>assert.throws(()=>calculateOrderTotal([line(0,450)])));
check(()=>assert.throws(()=>calculateOrderTotal([line(1,-1)])));
check(()=>assert.throws(()=>calculateOrderTotal([line(1,Number.MAX_SAFE_INTEGER)])));
check(()=>assert.throws(()=>calculateOrderTotal([line(1,10),line(2,15)])));
check(()=>assert.throws(()=>requireCommerceCapability('onlinePayments')));
check(()=>assert.throws(()=>requireCommerceCapability('reserveStock')));
check(()=>assert.equal(COMMERCE_RELEASE_SCOPE.localDraftOrders,true));
console.log(`${n}/${n} commerce checks passed`);
