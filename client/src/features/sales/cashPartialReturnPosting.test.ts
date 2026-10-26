/** Written client/IndexedDB contract tests; do not count as passed until Vitest executes. */
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { TallybookDB, initializeDatabase } from '@/db/TallybookDB';
import { setActiveBusinessProfileId } from '@/features/business/activeCompany';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import { createProduct } from '@/features/inventory/inventory';
import { completeSale } from '@/features/sales/sales';
import { recordConfirmedCashPartialReturn } from './cashPartialReturnPosting';
import { calculateTrackedShiftCash, createStaff, unlockStaff, openShift, lockStaff } from '@/features/staff/staff';
import { executeLatestSaleReversal } from '@/features/assistant/reversals';
import { getFinancialSummary } from '@/features/reports/financialIntelligence';
import { createBackup, parseBackup, restoreBackup } from '@/features/backup/backup';

const openDB: TallybookDB[]=[];
async function fixture() {
  setActiveBusinessProfileId('primary');
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-01-02T10:00:00Z'));
  const database=new TallybookDB(`partial-cash-${crypto.randomUUID()}`);openDB.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:'Cash return test',country:'Ghana',currency:'GHS',businessType:'Retail'},database);
  const owner=await createStaff('Cash return test owner','owner','123456',database);
  await unlockStaff(owner.id,'123456',database);
  await openShift(0,database);
  await updateCompanyReturnPolicy({enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30},'Test fixture owner opt-in',database);
  const product=await createProduct({name:'Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'1',initialStock:'3',lowStockThreshold:'0'},'GHS',database);
  const original=await completeSale({lines:[{productId:product.id,quantity:2}],discount:'0',paymentMethod:'cash',amountPaid:'20',currency:'GHS',submissionKey:'original-sale-1'},database);
  return {database,product,original};
}
async function nextDay(database:TallybookDB){
  vi.setSystemTime(new Date('2026-01-03T10:00:00Z'));
  const owner=await database.staffMembers.where('businessProfileId').equals('primary').first();
  await unlockStaff(owner!.id,'123456',database);
}
afterEach(async()=>{
  lockStaff('primary');
  vi.useRealTimers();vi.restoreAllMocks();setActiveBusinessProfileId('primary');
  for (const database of openDB.splice(0)){database.close();await new Dexie(database.name).delete();}
});
const request=(saleId:string,lineId:string,key:string)=>({originalSaleId:saleId,submissionKey:key,lines:[{saleLineId:lineId,quantity:1}],cashWasRefunded:true as const,confirmedRefundMinor:1000,disposition:'restockable' as const});

it('atomically records two cash refunds, restores original FIFO and reports net sale and cost',async()=>{
  const {database,product,original}=await fixture();
  await nextDay(database);
  const a=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'return-cash-1'),database);
  expect(a).toMatchObject({refundMethod:'cash',refundedMinor:1000,returnSequence:1,returnedTaxMinor:0});
  expect((await database.products.get(product.id))?.stockQuantity).toBe(2);
  expect(await getFinancialSummary('month',new Date(),undefined,undefined,database)).toMatchObject({revenueMinor:1000,cogsMinor:100,salesLessCostMinor:900});
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'return-cash-1'),database)).rejects.toThrow(/already recorded/);
  const b=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'return-cash-2'),database);
  expect(b).toMatchObject({refundedMinor:1000,returnSequence:2});
  expect(await database.centralOperationalEvents.where('kind').equals('sale.cash_partial_refund_recorded').count()).toBe(2);
  expect(await database.centralOperationalEvents.get(`cash-refund:${b.id}`)).toMatchObject({
    kind:'sale.cash_partial_refund_recorded',entityId:b.id,deliveryStatus:'local_only',
    deviceId:null,payoutEvidence:'staff_confirmed_only',payload:{cashReturn:b}});
  expect((await database.products.get(product.id))?.stockQuantity).toBe(3);
  expect(await getFinancialSummary('month',new Date(),undefined,undefined,database)).toMatchObject({revenueMinor:0,cogsMinor:0});
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'return-cash-3'),database)).rejects.toThrow(/quantity/);
  await expect(executeLatestSaleReversal('GHS',database,'full-after-partial')).rejects.toThrow(/couldn't find/);
  const backup=await createBackup(database);
  expect(parseBackup(JSON.stringify(backup)).records.cashPartialReturns).toHaveLength(2);
  expect(parseBackup(JSON.stringify(backup)).records.centralOperationalEvents.filter(event=>event.kind==='sale.cash_partial_refund_recorded')).toHaveLength(2);
  const damaged=structuredClone(backup);damaged.records.cashPartialReturns[1].refundedMinor++;
  expect(()=>parseBackup(JSON.stringify(damaged))).toThrow(/Cash return|partial|reconcile|Central cash refund/i);
  const alteredEvent=structuredClone(backup);
  const refundEvent=alteredEvent.records.centralOperationalEvents.find(event=>event.kind==='sale.cash_partial_refund_recorded'&&event.entityId===b.id);
  if(!refundEvent || refundEvent.kind!=='sale.cash_partial_refund_recorded')throw new Error('Missing refund event fixture.');
  refundEvent.payload.cashReturn.refundedMinor++;
  expect(()=>parseBackup(JSON.stringify(alteredEvent))).toThrow(/Central cash refund event/);
});
it('rolls back stock, FIFO cost and cash ledger when return posting fails',async()=>{
  const {database,product,original}=await fixture();
  const beforeStock=(await database.products.get(product.id))?.stockQuantity;
  const beforeCost=await database.inventoryCostEvents.toArray();
  const beforeMovements=await database.inventoryMovements.count();
  vi.spyOn(database.cashPartialReturns,'add').mockRejectedValueOnce(new Error('simulated local storage failure'));
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'failed-cash-1'),database)).rejects.toThrow(/storage failure/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(beforeStock);
  expect(await database.inventoryCostEvents.toArray()).toEqual(beforeCost);
  expect(await database.inventoryMovements.count()).toBe(beforeMovements);
});
it('rolls back cash refund, stock and cost if the central local event cannot be saved',async()=>{
  const {database,product,original}=await fixture();
  const beforeStock=(await database.products.get(product.id))?.stockQuantity;
  const beforeCosts=await database.inventoryCostEvents.toArray();
  const beforeMovements=await database.inventoryMovements.count();
  vi.spyOn(database.centralOperationalEvents,'add').mockRejectedValueOnce(new Error('simulated event write failure'));
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'failed-event-1'),database))
    .rejects.toThrow(/event write failure/);
  expect(await database.cashPartialReturns.count()).toBe(0);
  expect(await database.centralOperationalEvents.where('kind').equals('sale.cash_partial_refund_recorded').count()).toBe(0);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(beforeStock);
  expect(await database.inventoryCostEvents.toArray()).toEqual(beforeCosts);
  expect(await database.inventoryMovements.count()).toBe(beforeMovements);
});
it('restores the confirmed cash refund event with its original journal',async()=>{
  const {database,original}=await fixture();
  const posted=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'restore-event-1'),database);
  const backup=parseBackup(JSON.stringify(await createBackup(database)));
  const restored=new TallybookDB(`partial-cash-restore-${crypto.randomUUID()}`);openDB.push(restored);
  await initializeDatabase(restored);
  await restoreBackup(backup,restored);
  expect(await restored.cashPartialReturns.get(posted.id)).toEqual(posted);
  expect(await restored.centralOperationalEvents.get(`cash-refund:${posted.id}`)).toMatchObject({
    entityId:posted.id,deliveryStatus:'local_only',payload:{cashReturn:posted}});
});
it('blocks cash returns for customers and absent confirmation without modifying stock',async()=>{
  const {database,product,original}=await fixture();
  await expect(recordConfirmedCashPartialReturn({...request(original.sale.id,original.lines[0].id,'notconfirmed'),cashWasRefunded:false as never},database)).rejects.toThrow(/Confirm/);
  await expect(recordConfirmedCashPartialReturn({...request(original.sale.id,original.lines[0].id,'wrong-money-1'),confirmedRefundMinor:999},database)).rejects.toThrow(/exact saved invoice/);
  await database.sales.update(original.sale.id,{customerId:'customer-1'});
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'return-blocked-1'),database)).rejects.toThrow(/customer|cash-only/i);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(1);
  expect(await database.cashPartialReturns.count()).toBe(0);
});

it('accounts for confirmed partial cash refunds in the originating shift cash calculation',()=>{
  const shift={id:'shift-1',businessProfileId:'primary',staffId:'owner',openedAt:'2026-01-01',openingFloatMinor:300};
  const snapshot={sales:[{id:'s1',businessProfileId:'primary',shiftId:'shift-1',paymentMethod:'cash'}],
    payments:[{saleId:'s1',method:'cash',amountMinor:2000}],repayments:[],transfers:[],reversals:[],
    cashReturns:[{originalSaleId:'s1',shiftId:'shift-1',refundedMinor:1000}]};
  expect(calculateTrackedShiftCash(shift,snapshot)).toMatchObject({cashPartialRefundsMinor:-1000,expectedCashMinor:1300});
  expect(()=>calculateTrackedShiftCash(shift,{...snapshot,cashReturns:[{...snapshot.cashReturns[0],refundedMinor:-1}]})).toThrow(/Invalid recorded cash/);
});

it('rejects another refund when earlier saved physical-stock evidence has been altered',async()=>{
  const {database,original,product}=await fixture();
  await nextDay(database);
  const first=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'linked-first-1'),database);
  const beforeCount=await database.cashPartialReturns.count();
  const beforeStock=(await database.products.get(product.id))?.stockQuantity;
  await database.inventoryMovements.update(first.lines[0].movementId,{quantityDelta:2});
  await expect(recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'linked-second-1'),database))
    .rejects.toThrow(/stock movement|FIFO/i);
  expect(await database.cashPartialReturns.count()).toBe(beforeCount);
  expect((await database.products.get(product.id))?.stockQuantity).toBe(beforeStock);
});

it('backup import rejects a partial cash-return whose physical stock movement was altered',async()=>{
  const {database,original}=await fixture();
  await nextDay(database);
  const recorded=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'backup-stock-link-1'),database);
  const saved=await createBackup(database);
  expect(parseBackup(JSON.stringify(saved)).records.cashPartialReturns).toHaveLength(1);
  const altered=structuredClone(saved);
  const movement=altered.records.inventoryMovements.find(item=>item.id===recorded.lines[0].movementId)!;
  movement.createdAt='2026-02-01T10:00:00Z';
  expect(()=>parseBackup(JSON.stringify(altered))).toThrow(/Cash return|FIFO|stock movement/i);
});

it('local integrity reports a damaged partial refund FIFO restoration without rewriting the ledger',async()=>{
  const {database,original}=await fixture();
  await nextDay(database);
  const recorded=await recordConfirmedCashPartialReturn(request(original.sale.id,original.lines[0].id,'audit-cost-link-1'),database);
  await database.inventoryCostEvents.update(recorded.lines[0].costEventId,{createdAt:'2026-02-01T10:00:00Z'});
  const {auditLocalIntegrity}=await import('@/features/reliability/integrity');
  const before=await database.inventoryCostEvents.get(recorded.lines[0].costEventId);
  const result=await auditLocalIntegrity(database);
  expect(result.issues.map(item=>item.code)).toContain('cash-partial-return-stock-integrity');
  expect(await database.inventoryCostEvents.get(recorded.lines[0].costEventId)).toEqual(before);
});
