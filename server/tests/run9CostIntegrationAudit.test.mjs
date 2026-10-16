import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../../client/src/'+p,import.meta.url),'utf8');
const cost=()=>read('features/reports/costReconciliation.ts');
const report=()=>read('features/reports/financialIntelligence.ts');
const backup=()=>read('features/backup/backup.ts');
test('cost reconciliation checks full and partial money return evidence before totals',()=>{
 const x=cost(),before=x.indexOf('assertRun9ReturnCostCompleteness(');
 const after=x.indexOf('const saleCosts = new Map');
 assert.ok(before>=0&&after>before);
 assert.match(x,/cashReturns:input\.cashReturns/);
});
test('supplier purchase cost evidence is mandatory in cost reconciliation',()=>{
 const x=cost();
 assert.match(x,/assertRun9PurchaseCostCompleteness\(/);
 assert.match(x,/purchases:input\.purchases,purchaseLines:input\.purchaseLines/);
 assert.match(x,/expectedCurrency:input\.expectedCurrency/);
});
test('all FIFO receipt and purchase snapshots come from same read transaction',()=>{
 const x=report();
 assert.match(x,/database\.transaction\("r",\[database\.businessProfiles/);
 assert.match(x,/database\.purchaseLines/);
 assert.match(x,/purchaseLines:scoped\(purchaseLines\)/);
 assert.match(x,/expectedCurrency:profile\.currency/);
});
test('financial summaries distinguish as-of assets from period COGS',()=>{
 const x=report();
 assert.match(x,/summary\.inventoryValuation=costs\.inventoryValuation/);
 assert.match(x,/summary\.purchaseCostEvidence=costs\.purchaseCostEvidence/);
 assert.match(x,/summary\.salesLessCostMinor = summary\.salesExcludingRecordedTaxMinor - costs\.cogsMinor/);
});
test('financial CSV discloses incomplete stock costs and legacy supplier evidence',()=>{
 const x=report();
 assert.match(x,/Known historical-cost stock assets/);
 assert.match(x,/Stock units with unknown receipt cost/);
 assert.match(x,/Legacy supplier invoices with unverified receipt cost evidence/);
 assert.match(x,/Full stock value from verified receipts/);
});
test('management UI does not mask missing inventory valuation as audited asset total',()=>{
 const x=read('pages/FinancialIntelligencePage.tsx');
 assert.match(x,/summary\.inventoryValuation\.complete/);
 assert.match(x,/Missing receipt costs are not estimated/);
 assert.match(x,/supplier receipts|Supplier receipts/i);
});
test('portable restore invokes the same cost reconciliation with purchase data',()=>{
 const x=backup();
 assert.match(x,/reconcileSaleCosts\(companyId/);
 assert.match(x,/purchases:records\.purchases/);
 assert.match(x,/purchaseLines:records\.purchaseLines/);
 assert.match(x,/expectedCurrency:records\.businessProfiles\[0\]\.currency/);
});
test('purchase receipt journal commits immutable supplier ID, price and stock together',()=>{
 const x=read('features/purchases/purchases.ts');
 assert.match(x,/appendInventoryCostChange\(database/);
 assert.match(x,/purchaseId \}, \{ unitCostMinor: line\.unitCostMinor \}/);
 assert.match(x,/await database\.purchaseLines\.bulkAdd\(lines\)/);
});
test('sale reversals and cash returns use original FIFO issue cost rather than editable product cost',()=>{
 const full=read('features/assistant/reversals.ts');
 const partial=read('features/sales/cashPartialReturnPosting.ts');
 assert.match(full,/restoreInventoryCost\(database, product/);
 assert.match(partial,/restorePartialInventoryCost\(database, product/);
 assert.doesNotMatch(partial,/product\.costPriceMinor/);
});
test('historical-cost uncertainty is retained in the FIFO replay engine',()=>{
 const x=read('features/inventory/costLedger.ts');
 assert.match(x,/legacy-opening/);
 assert.match(x,/unknownCostUnits/);
 assert.match(x,/unitCostMinor === undefined/);
});
test('source changes do not add a schema migration or new payment flows',()=>{
 const x=read('db/TallybookDB.ts');
 assert.match(x,/DATABASE_SCHEMA_VERSION = 28/);
 assert.doesNotMatch(cost(),/database\.transaction\("rw"/);
 assert.doesNotMatch(read('features/reports/run9InventoryValuation.mjs'),/fetch\(|localStorage/);
});

test('cost events and sale lines are pre-indexed for low-resource report reconstruction',()=>{
 const x=cost();
 assert.match(x,/eventsByProduct=new Map/);
 assert.match(x,/eventsByProduct\.get\(product\.id\)/);
 assert.match(x,/linesBySale\.get\(sale\.id\)/);
 assert.match(x,/linesById\.get\(event\.saleLineId/);
});
