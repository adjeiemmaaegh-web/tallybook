import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../client/src/'+p,import.meta.url),'utf8');
const supplier=()=>read('features/purchases/supplierPayables.ts');
const expense=()=>read('features/expenses/expenses.ts');
const finance=()=>read('features/reports/financialIntelligence.ts');
const backup=()=>read('features/backup/backup.ts');
test('supplier recognition and settlement obtain shared lock before IndexedDB write',()=>{
 const x=supplier();
 assert.match(x,/withCrossTabDataLock\("shared", \(\) => recognizeUnpaidPurchaseWhileLocked/);
 assert.match(x,/withCrossTabDataLock\("shared", \(\) => recordSupplierSettlementWhileLocked/);
});
test('supplier write transactions include original supplier/company evidence',()=>{
 const x=supplier();
 assert.match(x,/database\.businessProfiles, database\.suppliers, database\.purchases/);
 assert.match(x,/const supplier=await database\.suppliers\.get\(purchase\.supplierId\)/);
 assert.match(x,/supplier\.businessProfileId!==company/);
});
test('supplier recognition checks proposed liability, purchase date and recovery marker',()=>{
 const x=supplier();
 assert.match(x,/reconcileSupplierPayable\(purchase,\[\.\.\.entries,result\]\)/);
 assert.match(x,/Supplier recognition cannot predate the purchase receipt/);
 assert.match(x,/assertRun7RetailWriteReady\(database\.appMeta\)/);
});
test('supplier settlement is revalidated inside same financial write transaction',()=>{
 const x=supplier();
 const a=x.indexOf('reconcileSupplierPayable(purchase,[...rows,entry])');
 const b=x.indexOf('await database.supplierPayableEntries.add(entry)',a);
 assert.ok(a>=0&&b>a);
 assert.match(x,/Company switched before committing supplier settlement/);
});
test('supplier reporting read validates company, staff and supplier ownership',()=>{
 const x=supplier();
 assert.match(x,/requirePermission\('reports',database,company\)/);
 assert.match(x,/Supplier purchase has a missing or foreign supplier identity/);
 assert.match(x,/Company switched during supplier balance review/);
});
test('expense write obtains shared cross-tab lock before opening transaction',()=>{
 const x=expense();
 const a=x.indexOf("withCrossTabDataLock('shared'"),b=x.indexOf('database.transaction("rw"',a);
 assert.ok(a>=0&&b>a);
});
test('expense staff/shift and currency are checked within write transaction',()=>{
 const x=expense();
 assert.match(x,/database\.businessProfiles,database\.staffMembers,database\.staffShifts/);
 assert.match(x,/requirePermission\('inventory',database,activeId\)/);
 assert.match(x,/profile\.currency!==values\.currency/);
 assert.match(x,/Company changed before expense posting/);
});
test('original checkout saves exact tax ON/OFF policy with sale in same transaction',()=>{
 const x=read('features/sales/sales.ts');
 assert.match(x,/const taxConfigurationAtSale=snapshotSaleTaxConfiguration\(policy\)/);
 assert.match(x,/const sale: Sale = \{[^\n]*taxConfigurationAtSale/);
 assert.match(x,/returnPolicyAtSale/);
});
test('financial snapshot includes supplier owner IDs and cost/settlement evidence together',()=>{
 const x=finance();
 assert.match(x,/database\.inventoryMovements,database\.suppliers,database\.purchases/);
 assert.match(x,/database\.inventoryMovements\.toArray\(\),database\.suppliers\.toArray\(\),database\.purchases\.toArray/);
 assert.match(x,/suppliers:scoped\(suppliers\)/);
});
test('report computes independent full sale-time tax checks and supplier conservation',()=>{
 const x=finance();
 assert.match(x,/summary\.taxEvidence=auditRun12SaleTaxHistory\(scoped\(sales\)\)/);
 assert.match(x,/summary\.supplierFinanceAudit=auditRun12SupplierFinance\(/);
 assert.match(x,/companyCurrency:profile\.currency/);
});
test('supplier credit notes never count as external cash and period supplier payments remain separate',()=>{
 const x=read('features/reports/run12SupplierFinanceAudit.mjs');
 assert.match(x,/supplierCreditsWithoutReferences/);
 assert.match(x,/periodSupplierPaymentsInCompanyCurrencyMinor/);
 assert.match(x,/potentialExpensePaymentOverlapUnresolved:true/);
});
test('supplier liability is conserved per currency, not via USD plus GHS',()=>{
 const x=read('features/reports/run12SupplierFinanceAudit.mjs');
 assert.match(x,/recognizedByCurrency/);
 assert.match(x,/paidBy\.get\(row\.currency\)/);
 assert.match(x,/supplier payable recognition, payments, credits and due do not conserve by currency/);
});
test('saved legacy expenses of unknown original currency cannot inherit today’s profile',()=>{
 const x=read('features/reports/run12SupplierFinanceAudit.mjs');
 assert.match(x,/expensesWithUnknownCurrency\+\+/);
 assert.match(x,/expensesInOtherCurrency\+\+/);
 assert.doesNotMatch(x,/exchangeRate|convertCurrency/);
});
test('backup checks supplier ownership/chronology and tax policy BEFORE restore writes',()=>{
 const x=backup(),a=x.indexOf('auditRun12SupplierFinance('),b=x.indexOf('auditRun12SaleTaxHistory(');
 const c=x.indexOf('export function parseBackup(',b);
 assert.ok(a>=0&&b>a&&c>b);
 assert.match(x,/suppliers:records\.suppliers,purchases:records\.purchases/);
 assert.match(x,/auditRun12SaleTaxHistory\(records\.sales\)/);
});
test('CSV exposes supplier manual payments and explicit tax-off separately',()=>{
 const x=finance();
 assert.match(x,/Manual supplier payments in company currency this period/);
 assert.match(x,/Supplier credit notes without external reference/);
 assert.match(x,/Sales with explicit tax OFF at checkout/);
 assert.match(x,/Historical sales with unverified tax configuration/);
});
test('management UI warns about duplicate disbursement entries and no statutory filing',()=>{
 const x=read('pages/FinancialIntelligencePage.tsx');
 assert.match(x,/same outside-world payout could have been entered in both places/);
 assert.match(x,/Tax filing, country-specific exemptions and statutory rates are not verified/);
});
test('Run 12 does not add automatic payment gateway, legal rate preset or schema version',()=>{
 const x=read('db/TallybookDB.ts');
 assert.match(x,/DATABASE_SCHEMA_VERSION = 28/);
 for(const v of [read('features/reports/run12SupplierFinanceAudit.mjs'),
  read('features/reports/run12SaleTaxAudit.mjs')]){
  assert.doesNotMatch(v,/fetch\(|localStorage\.|indexedDB\.|navigator\.locks/);
 }
});
