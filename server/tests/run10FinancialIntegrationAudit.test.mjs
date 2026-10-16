import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=p=>readFileSync(new URL('../../client/src/'+p,import.meta.url),'utf8');
const finance=()=>source('features/reports/financialIntelligence.ts');
const credit=()=>source('features/credit/credit.ts');
const backup=()=>source('features/backup/backup.ts');
test('finance captures customer ownership in the same read transaction as credit evidence',()=>{
 const x=finance();
 assert.match(x,/database\.transaction\("r",\[database\.businessProfiles,database\.customers,database\.sales/);
 assert.match(x,/database\.customers\.toArray\(\),database\.sales\.toArray/);
 assert.match(x,/company,customers:scoped\(customers\)/);
});
test('full customer snapshot is mandatory before labeling current credit as audited',()=>{
 const x=finance();
 assert.match(x,/auditRun10CompanyReceivables\(/);
 assert.match(x,/Customer credit reporting requires company and customer identities together/);
 assert.match(x,/receivables=receivableAudit\?\.outstandingMinor/);
});
test('one customer cannot hide an overpayment with another customer debt in report',()=>{
 const x=source('features/reports/run10ReceivablesAudit.mjs');
 assert.match(x,/for\(const customer of customers\)/);
 assert.match(x,/reconcileCreditLedger\(customerSales,customerReversals,customerRepayments\)/);
 assert.match(x,/has unreconciled debt/);
});
test('sale-level allocation remains optional but legacy customer-level payments are never attributed',()=>{
 const x=source('features/reports/run10ReceivablesAudit.mjs');
 assert.match(x,/unallocatedRepaymentMinor/);
 assert.match(x,/repayment\.saleAllocations!==undefined/);
 assert.match(x,/reconcileRepaymentAllocations/);
});
test('prepaid liability is conserved against external cash, wallet spending and saved reversal',()=>{
 const x=finance();
 assert.match(x,/auditRun10PrepaidCashConservation/);
 const raw=source('features/reports/run10PrepaidCashAudit.mjs');
 assert.match(raw,/reconcilePrepaidLiability/);
 assert.match(raw,/impliedLiability!==BigInt\(verified\.liabilityMinor\)/);
 assert.match(raw,/netCash=deposited-refunded/);
});
test('wallet spending is not reported as new external cash',()=>{
 const x=finance();
 assert.match(x,/walletNetCashMinor=total\(walletTransfers/);
 assert.match(x,/t\.kind==='deposit'\?t\.amountMinor:-t\.amountMinor/);
 const ui=source('pages/FinancialIntelligencePage.tsx');
 assert.match(ui,/Wallet spending is not counted as additional cash received/);
});
test('portable restore must validate receivable and prepaid conservation before mutations',()=>{
 const x=backup();
 const a=x.indexOf('auditRun10CompanyReceivables(');
 const b=x.indexOf('auditRun10PrepaidCashConservation(');
 const c=x.indexOf('export function parseBackup(');
 assert.ok(a>=0&&b>a&&c>b);
 assert.match(x,/company:companyId,customers:records\.customers,sales:records\.sales/);
});
test('customer repayment posting coordinates shared origin lock before IndexedDB write',()=>{
 const x=credit();
 const a=x.indexOf('export async function recordRepayment(');
 const b=x.indexOf('return withCoordinatedRetailWrite(async()=>',a);
 const c=x.indexOf('database.transaction("rw"',a);
 assert.ok(a>=0&&b>a&&c>b);
 assert.match(x,/assertRun7RetailWriteReady\(database\.appMeta\)/);
});
test('proposed repayment and all saved credit are re-audited inside its write transaction',()=>{
 const x=credit(),a=x.indexOf('auditRun10CompanyReceivables({'),
  b=x.indexOf('await database.repayments.add(repayment)',a);
 assert.ok(a>=0&&b>a);
 assert.match(x,/repayments:\[\.\.\.repayments,repayment\]/);
});
test('repayment refuses switched-company operation before and after writing',()=>{
 const x=credit();
 assert.match(x,/Company switched before recording customer repayment/);
 assert.match(x,/Company switched during customer repayment authorization/);
 assert.match(x,/Company switched before customer repayment committed/);
});
test('dashboard and end-of-day reads enforce per-customer debt invariants',()=>{
 const x=source('features/reports/reports.ts');
 assert.match(x,/auditRun10CompanyReceivables\(\{company:activeId,customers:snapshot\.customers/);
 assert.match(x,/return snapshot/);
});
test('management CSV and UI identify linked, legacy and prepaid amounts separately',()=>{
 const x=finance(),ui=source('pages/FinancialIntelligencePage.tsx');
 assert.match(x,/Sale-linked customer repayments \(as-of\)/);
 assert.match(x,/Legacy unallocated customer repayments \(as-of\)/);
 assert.match(x,/Recorded prepaid deposits across full history/);
 assert.match(ui,/Historical payments recorded only against customers/);
 assert.match(ui,/not bank\/provider-confirmed transfers/);
});
test('no new backend payment provider or cloud mutator is introduced by pure audits',()=>{
 const a=source('features/reports/run10ReceivablesAudit.mjs');
 const b=source('features/reports/run10PrepaidCashAudit.mjs');
 for(const x of [a,b]){
  assert.doesNotMatch(x,/fetch\(|localStorage\.|indexedDB\.|database\.transaction\(|navigator\.locks/);
 }
});
test('existing local IndexedDB version is unchanged and no silent migration occurs',()=>{
 const x=source('db/TallybookDB.ts');
 assert.match(x,/DATABASE_SCHEMA_VERSION = 28/);
 assert.doesNotMatch(finance(),/database\.transaction\("rw"/);
});
