import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const path=name=>new URL('../../client/src/features/'+name,import.meta.url);
const source=name=>readFileSync(path(name),'utf8');
const protectedWrites=[
 ['sales/sales.ts','completeSaleWhileLocked'],
 ['purchases/purchases.ts','completePurchase'],
 ['credit/credit.ts','recordRepayment'],
 ['expenses/expenses.ts','createExpense'],
 ['customers/walletTransfers.ts','recordWalletTransfer'],
 ['assistant/reversals.ts','executeLatestSaleReversalWhileLocked'],
 ['sales/cashPartialReturnPosting.ts','recordConfirmedCashPartialReturnWhileLocked'],
 ['purchases/supplierPayables.ts','recognizeUnpaidPurchaseWhileLocked'],
 ['purchases/supplierPayables.ts','recordSupplierSettlementWhileLocked'],
 ['inventory/inventory.ts','adjustStockWhileLocked']
];
function inspected(file){
 const s=source(file);
 return {source:s,count:(s.match(/assertRun7RetailWriteReady\(database\.appMeta\)/g)||[]).length,
  scopeCount:(s.match(/database\.appMeta/g)||[]).length};
}
test('all major financial and stock modules import transaction-bound recovery barrier',()=>{
 for(const[file]of protectedWrites){
  const s=source(file);
  assert.match(s,/import \{assertRun7RetailWriteReady\}/);
  assert.match(s,/assertRun7RetailWriteReady\(database\.appMeta\)/);
 }
});
test('core sale, purchase, repayment, refund and supplier liabilities include appMeta in write scope',()=>{
 for(const file of [...new Set(protectedWrites.map(x=>x[0]))]){
  const s=source(file);
  assert.match(s,/database\.transaction\(['"]rw['"],[\s\S]*?database\.appMeta/);
 }
});
test('all core inventory write transactions and the stage2 mutation family guard journal',()=>{
 for(const file of ['inventory/inventory.ts','inventory/stage2Inventory.ts']){
  const r=inspected(file);
  assert.equal(r.count,5);
  assert.ok(r.scopeCount>=5);
 }
});
test('supplier mutations and purchase posting use four guarded write transactions',()=>{
 const r=inspected('purchases/purchases.ts');
 assert.equal(r.count,4);
});
test('all six supplier liability write paths reject pending crash journals',()=>{
 const r=inspected('purchases/supplierPayables.ts');
 assert.equal(r.count,6);
});
test('retail backup export owns an exclusive shared-name lock across both DB reads',()=>{
 const s=source('backup/backup.ts');
 assert.match(s,/withCrossTabDataLock\('exclusive',\(\)=>createBackupWhileLocked/);
 assert.match(s,/await database\.appMeta\.get\(RESTORE_JOURNAL_KEY\)/);
 assert.match(s,/Company changed during coordinated backup/);
});
test('backup metadata receipt binds to exported file company and shared lock',()=>{
 const s=source('backup/backup.ts');
 assert.match(s,/recordBackupExportedAt\(/);
 assert.match(s,/exportedCompanyId!==getActiveBusinessProfileId\(\)/);
 assert.match(s,/withCrossTabDataLock\('shared'/);
 const page=readFileSync(new URL('../../client/src/pages/BackupPage.tsx',import.meta.url),'utf8');
 assert.match(page,/recordBackupExportedAt\([\s\S]*?proof\.createdAt,db,proof\.companyId,proof\.sha256\)/);
});
test('recovery startup consumes the deterministic crash-state decision',()=>{
 const s=source('backup/restoreRecovery.ts');
 assert.match(s,/classifyPendingAssistantRecovery\(journal,current\)/);
 assert.match(s,/writeAssistantRestoreSnapshot\(journal\.companyId,journal\.before,journal\.after\)/);
 assert.match(s,/database\.appMeta\.delete\(RESTORE_JOURNAL_KEY\)/);
});
