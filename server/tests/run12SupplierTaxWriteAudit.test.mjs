import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../client/src/'+p,import.meta.url),'utf8');
test('supplier settlement writes require recovery barrier and staffed authorization inside transaction',()=>{
 const x=read('features/purchases/supplierPayables.ts');
 assert.match(x,/assertRun7RetailWriteReady\(database\.appMeta\)/);
 assert.match(x,/requirePermission\('staff', database, company\)/);
 assert.match(x,/Company changed before supplier settlement was recorded/);
 assert.match(x,/withCrossTabDataLock\("shared"/);
});
test('supplier credit does not masquerade as bank tender',()=>{
 const x=read('features/purchases/supplierPayables.ts');
 assert.match(x,/A supplier credit is not a cash payment/);
 assert.match(x,/Supplier settlement exceeds the remaining liability/);
});
test('supplier payable pure audit requires canonical event timestamps and purchase chronology',()=>{
 const x=read('features/purchases/supplierPayables.mjs');
 assert.match(x,/canonicalInstant\(purchase\.createdAt\)/);
 assert.match(x,/Date\.parse\(row\.createdAt\) < purchaseCreated/);
});
test('expense staff/shift checks moved inside the actual IndexedDB write transaction',()=>{
 const x=read('features/expenses/expenses.ts');
 const start=x.indexOf('withCoordinatedRetailWrite('),scope=x.indexOf('database.transaction("rw"',start);
 const permission=x.indexOf('requirePermission("inventory",database,company)',scope);
 const write=x.indexOf('await database.expenses.add(expense)',permission);
 assert.ok(start>=0&&scope>start&&permission>scope&&write>permission);
 assert.match(x,/database\.staffMembers,database\.staffShifts,database\.businessProfiles/);
});
test('expense posting fails on wrong company currency rather than inventing FX',()=>{
 const x=read('features/expenses/expenses.ts');
 assert.match(x,/profile\.currency!==values\.currency/);
 assert.match(x,/Company changed before recording the expense/);
});
test('supplier cash reconciliation never treats foreign payments as local money',()=>{
 const x=read('features/reports/run12SupplierCashAudit.mjs');
 assert.match(x,/foreignCurrencySupplierPayments/);
 assert.match(x,/companyCurrency/);
 assert.match(x,/BigInt/);
});
test('management report computes supplier cash and tax audit from full saved company data',()=>{
 const x=read('features/reports/financialIntelligence.ts');
 assert.match(x,/summary\.supplierCashAudit=auditRun12SupplierCashConservation/);
 assert.match(x,/summary\.recordedTaxEvidence=auditRun12RecordedTax/);
});
test('management CSV distinguishes supplier cash, unknown payables and nonstatutory tax',()=>{
 const x=read('features/reports/financialIntelligence.ts');
 assert.match(x,/Collections less expenses and local supplier payments/);
 assert.match(x,/Historical sales without tax evidence/);
 assert.match(x,/not statutory liability/);
});
test('tax audit uses original sale and return snapshots, not inferred current rates',()=>{
 const x=read('features/reports/run12RecordedTaxAudit.mjs');
 assert.match(x,/sale\.tax/);
 assert.match(x,/row\.returnedTaxMinor/);
 assert.match(x,/statutoryTaxLiabilityVerified:false/);
});
test('backup preflight rejects corrupted supplier and tax evidence before restore',()=>{
 const x=read('features/backup/backup.ts');
 assert.match(x,/reconcileSupplierPayables\(records\.purchases, records\.supplierPayableEntries\)/);
 assert.match(x,/auditRun12RecordedTax\(records\.sales,records\.saleReversals,records\.cashPartialReturns/);
});
test('owner configured tax remains off by default and requires registered status',()=>{
 const x=read('features/sales/tax.ts');
 assert.match(x,/if \(policy\.enabled && policy\.registrationStatus !== "registered"\)/);
 assert.match(x,/if \(!policy\) return undefined/);
});
test('report UI discloses manual supplier settlements and statutory tax limitations',()=>{
 const x=read('pages/FinancialIntelligencePage.tsx');
 assert.match(x,/not verified bank or provider transfers/);
 assert.match(x,/do not establish statutory tax payable/);
});
test('run12 does not migrate database schema or activate a provider refund',()=>{
 const x=read('db/TallybookDB.ts');
 assert.match(x,/DATABASE_SCHEMA_VERSION = 28/);
 const a=read('features/reports/run12SupplierCashAudit.mjs');
 assert.doesNotMatch(a,/fetch\(|indexedDB\.|navigator\.locks/);
});
