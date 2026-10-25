import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url),'utf8');
const adapter = read('../stage1-audit-candidate/tallybook-integrity/tallybook-adapter/tallybookRules.ts');
const db = read('../client/src/db/TallybookDB.ts');
const sales = read('../client/src/features/sales/sales.ts');
const wallet = read('../client/src/features/customers/walletTransfers.ts');
const returns = read('../client/src/features/sales/cashPartialReturnPosting.ts');
const names = [...adapter.matchAll(/\{name:'([^']+)',key:'id'/g)].map(x=>x[1]);
test('every configured audit table is declared on actual TallybookDB',()=>{ for(const name of names) assert.match(db,new RegExp('\\b'+name+'!\\s*:'),name); });
test('audited money fields exist in actual domain interfaces',()=>{for(const field of ['totalMinor','amountPaidMinor','outstandingMinor','unitPriceMinor','lineTotalMinor']) assert.match(sales,new RegExp('\\b'+field+'\\\??:'),field); assert.match(wallet,/amountMinor:/);assert.match(returns,/refundedMinor:/);});
test('consistent audit requires Dexie readonly transaction',()=>{assert.match(adapter,/db\.transaction\('r', \.\.\.tables/);assert.match(adapter,/typeof db\.transaction !== 'function'/);});
test('diagnostics do not write or mutate application records',()=>{assert.doesNotMatch(adapter,/\.(?:put|add|delete|clear|bulkPut|bulkAdd)\s*\(/);});

test('sale audit rules enforce safe paid-plus-outstanding conservation',()=>{ assert.match(adapter,/Number\.isSafeInteger\(paid \+ due\)/); assert.match(adapter,/paid \+ due !== total/); });
