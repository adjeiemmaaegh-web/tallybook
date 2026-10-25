import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../client/src/'+p,import.meta.url),'utf8');
const policy=()=>read('features/business/returnPolicy.mjs');
const full=()=>read('features/assistant/reversals.ts');
const part=()=>read('features/sales/cashPartialReturnPosting.ts');
test('company policy is explicit and defaults to NO refunds even for older companies',()=>{
 const x=policy();
 assert.match(x,/revision:0/);assert.match(x,/enabled:false,allowFullReversal:false,allowCashPartial:false/);
 assert.match(x,/!salePolicy\.enabled\|\|!active\.enabled/);
});
test('owner policy setting uses coordinated lock outside atomic local transaction',()=>{
 const x=read('features/business/returnPolicySettings.ts');
 const a=x.indexOf('withCoordinatedRetailWrite('),b=x.indexOf("database.transaction('rw'",a);
 assert.ok(a>=0&&b>a);
 assert.match(x,/assertRun7RetailWriteReady\(database\.appMeta\)/);
 assert.match(x,/requirePermission\('staff',database,company\)/);
 assert.match(x,/actor\.role!=='owner'/);
});
test('owner change preserves revision history, staff audit and company isolation',()=>{
 const x=read('features/business/returnPolicySettings.ts');
 assert.match(x,/appendCompanyReturnPolicy\(profile\.returnPolicyHistory/);
 assert.match(x,/returnPolicyHistory:history,updatedAt:now/);
 assert.match(x,/action:'return\.policy\.updated'/);
 assert.match(x,/Company changed before the new refund policy was committed/);
});
test('ordinary business details cannot mutate or discard existing return policy revisions',()=>{
 const x=read('features/business/businessProfile.ts');
 assert.match(x,/returnPolicyHistory:existing\?\.returnPolicyHistory/);
 assert.match(x,/returnPolicyHistory\?:ReturnPolicyRevision\[\]/);
});
test('new checkout captures immutable sale-time revision in same transaction as sale',()=>{
 const x=read('features/sales/sales.ts');
 assert.match(x,/const returnPolicyAtSale=saleReturnPolicySnapshot\(savedProfile\?\.returnPolicyHistory\)/);
 assert.match(x,/const sale: Sale = \{[^\n]*returnPolicyAtSale/);
});
test('full reversal rechecks company refund policy before cost, cash and inventory posting',()=>{
 const x=full();
 const a=x.indexOf('policyEvidence=authorizeReturnPolicy('),b=x.indexOf('restoreByProduct',a);
 assert.ok(a>=0&&b>a);
 assert.match(x,/database\.appMeta, database\.businessProfiles, database\.saleReversals/);
 assert.match(x,/policyEvidence, id: nanoid/);
});
test('cash partial return requires policy before invoice or stock change, saves immutable proof',()=>{
 const x=part(),a=x.indexOf('policyEvidence=authorizeReturnPolicy('),
 b=x.indexOf('restorePartialInventoryCost(',a);
 assert.ok(a>=0&&b>a);
 assert.match(x,/policyEvidence,id:nanoid/);
 assert.match(x,/database\.appMeta, database\.businessProfiles/);
});
test('saveable return policy snapshots include original and decision revisions and max days',()=>{
 const x=policy();
 assert.match(x,/salePolicy,decisionPolicy:active,kind,authorizedAt:now/);
 assert.match(x,/Math\.min\(salePolicy\.maxAgeDays,active\.maxAgeDays\)/);
 assert.match(x,/Math\.min\(before\.maxAgeDays,at\.maxAgeDays\)/);
});
test('backup validates refund history and proof before any main database restore',()=>{
 const x=read('features/backup/backup.ts');
 const a=x.indexOf('auditCompanyReturnPolicyEvidence('),
 b=x.indexOf('export function parseBackup(');
 assert.ok(a>=0&&b>a);
 assert.match(x,/records\.businessProfiles\[0\]/);
});
test('financial summary and CSV disclose legacy unknown refund policy instead of claiming approval',()=>{
 const x=read('features/reports/financialIntelligence.ts');
 assert.match(x,/summary\.returnPolicyEvidence=auditCompanyReturnPolicyEvidence/);
 assert.match(x,/Historical refunds with unverified policy evidence/);
 const ui=read('pages/FinancialIntelligencePage.tsx');
 assert.match(ui,/Older refund records with unverified policy authority/);
});
test('company settings expose no refunds and independent partial/full permission flags',()=>{
 const ui=read('components/CompanyReturnPolicySettings.tsx');
 assert.match(ui,/No refunds or returns/);
 assert.match(ui,/Allow full-sale ledger reversals/);
 assert.match(ui,/Allow eligible restockable cash-only partial returns/);
 assert.match(ui,/window\.confirm\(/);
 assert.match(ui,/cannot override customers' legal rights/);
});
test('owner policy UI is connected to business settings, not just an unreachable module',()=>{
 const ui=read('pages/BusinessSetup.tsx');
 assert.match(ui,/import \{CompanyReturnPolicySettings\}/);
 assert.match(ui,/<CompanyReturnPolicySettings key=\{profile\.id\}/);
});
test('both return review entrypoints check current company policy even though read-only',()=>{
 const x=full(),cash=read('features/sales/cashReturnReview.ts');
 assert.match(x,/authorizeReturnPolicy\(profile\.returnPolicyHistory,sale,'full'/);
 assert.match(cash,/authorizeReturnPolicy\(companyProfile\.returnPolicyHistory,sale,'partialCash'/);
});
test('POS hides ineligible return-review button for no-refunds companies',()=>{
 const x=read('pages/SalesPage.tsx');
 assert.match(x,/currentCompanyReturnPolicy\(profile\.returnPolicyHistory\)\.allowCashPartial/);
 assert.match(x,/sale\.returnPolicyAtSale\?\.allowCashPartial/);
});
test('run 11 introduces no new IndexedDB schema, payment processor or cloud sync',()=>{
 assert.match(read('db/TallybookDB.ts'),/DATABASE_SCHEMA_VERSION = 35/);
 assert.match(read('db/TallybookDB.ts'),/this\.version\(28\)/);
 for(const x of [policy(),read('features/business/returnPolicyAudit.mjs')]){
  assert.doesNotMatch(x,/fetch\(|localStorage\.|navigator\.locks|indexedDB\./);
 }
});
