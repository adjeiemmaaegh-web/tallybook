import {readFileSync} from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const code=readFileSync(new URL('./app.js',import.meta.url),'utf8');
const views=['welcome','signin','role','employee','business','store','ready','dashboard','pos','sales','inventory','products','online-orders','purchases','quotations','stocktake','transfers','customers','expenses','reports','accounting','receipts','team','settings','profile','offline-queue','stages','qa'];
for(const page of views){const app={innerHTML:''};
 const context={document:{querySelector:s=>s==='#app'?app:null,addEventListener(){}},window:{addEventListener(){},scrollTo(){}},location:{hash:'#'+page},navigator:{},console,setTimeout,Date,Number,Map,Set,Array,Object,JSON,String,Math,Intl};
 vm.runInNewContext(code,context,{filename:'app.js',timeout:15000});
 assert.ok(app.innerHTML.length>250,page+' rendered empty');
 assert.ok(app.innerHTML.includes('Tallybook')||app.innerHTML.includes('TALLYBOOK'),page+' missing branding');
 assert.ok(!app.innerHTML.includes('undefined'),page+' contains undefined text');
}
console.log('PASS',views.length,'frontend-only routes');
