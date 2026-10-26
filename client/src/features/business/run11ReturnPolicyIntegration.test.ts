import Dexie from 'dexie';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {TallybookDB,initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {setActiveBusinessProfileId} from '@/features/business/activeCompany';
import {updateCompanyReturnPolicy} from '@/features/business/returnPolicySettings';
import {createProduct} from '@/features/inventory/inventory';
import {completeSale} from '@/features/sales/sales';
import {executeLatestSaleReversal,prepareLatestSaleReversal} from '@/features/assistant/reversals';
import {recordConfirmedCashPartialReturn} from '@/features/sales/cashPartialReturnPosting';
import {createBackup,parseBackup,stringifyBackup} from '@/features/backup/backup';
import {getFinancialSummary} from '@/features/reports/financialIntelligence';
import {currentCompanyReturnPolicy} from './returnPolicy.mjs';
import {createStaff,unlockStaff,openShift,lockStaff} from '@/features/staff/staff';
const dbs:TallybookDB[]=[];let counter=0;
const allowBoth={enabled:true,allowFullReversal:true,allowCashPartial:true,maxAgeDays:30};
async function fixture(enabled=false){
 setActiveBusinessProfileId('primary');
 vi.useFakeTimers({toFake:['Date']});
 vi.setSystemTime(new Date('2026-01-02T09:00:00.000Z'));
 const db=new TallybookDB(`run11-policy-${Date.now()}-${++counter}`);
 dbs.push(db);await initializeDatabase(db);
 await saveBusinessProfile({name:'Refund Policy Shop',country:'Ghana',currency:'GHS',
  businessType:'Retail shop',phone:'',email:'',address:''},db);
 const owner=await createStaff('Policy test owner','owner','123456',db);
 await unlockStaff(owner.id,'123456',db);
 await openShift(0,db);
 if(enabled)await updateCompanyReturnPolicy(allowBoth,'Owner explicitly enables selected returns',db);
 const product=await createProduct({name:'Policy Rice',categoryId:'uncategorized',
  sellingPrice:'10',costPrice:'1',initialStock:'4',lowStockThreshold:'0'},'GHS',db);
 return{db,product};
}
async function sell(db:TallybookDB,productId:string){
 return completeSale({lines:[{productId,quantity:2}],
  discount:'0',paymentMethod:'cash',amountPaid:'20',currency:'GHS',
  submissionKey:`policy-sale-${counter}-${crypto.randomUUID()}`},db);
}
function request(saleId:string,lineId:string,key:string){
 return{originalSaleId:saleId,submissionKey:key,
  lines:[{saleLineId:lineId,quantity:1}],cashWasRefunded:true as const,
  confirmedRefundMinor:1000,disposition:'restockable' as const};
}
const later=async(db:TallybookDB)=>{
 vi.setSystemTime(new Date('2026-01-03T09:00:00.000Z'));
 const owner=await db.staffMembers.where('businessProfileId').equals('primary').first();
 await unlockStaff(owner!.id,'123456',db);
};
afterEach(async()=>{
 lockStaff('primary');
 vi.useRealTimers();vi.restoreAllMocks();setActiveBusinessProfileId('primary');
 for(const db of dbs.splice(0)){const name=db.name;db.close();await new Dexie(name).delete();}
});
describe('Run 11 company return policy database and posting protection',()=>{
 it('defaults to no refunds and denies full reversal before money/stock changes',async()=>{
  const{db,product}=await fixture();
  const saved=await sell(db,product.id),stock=(await db.products.get(product.id))?.stockQuantity;
  expect(saved.sale.returnPolicyAtSale?.enabled).toBe(false);
  await later(db);
  await expect(executeLatestSaleReversal('GHS',db,'run11-default-no-full'))
   .rejects.toThrow(/does not authorize/);
  expect(await db.saleReversals.count()).toBe(0);
  expect((await db.products.get(product.id))?.stockQuantity).toBe(stock);
 });
 it('defaults to no refunds and denies a partial cash return without any write',async()=>{
  const{db,product}=await fixture();
  const saved=await sell(db,product.id);await later(db);
  await expect(recordConfirmedCashPartialReturn(
   request(saved.sale.id,saved.lines[0].id,'run11-default-no-part'),db))
   .rejects.toThrow(/does not authorize/);
  expect(await db.cashPartialReturns.count()).toBe(0);
 });
 it('owner-enabled full reversal captures original and decision terms on exact journal',async()=>{
  const{db,product}=await fixture(true);
  const saved=await sell(db,product.id);
  expect(saved.sale.returnPolicyAtSale).toMatchObject({revision:1,enabled:true});
  await later(db);
  const reversal=await executeLatestSaleReversal('GHS',db,'run11-allowed-full-1');
  expect(reversal.policyEvidence).toMatchObject({
   kind:'full',salePolicy:{revision:1},decisionPolicy:{revision:1}
  });
  expect((await getFinancialSummary('month',new Date(),undefined,undefined,db))
   .returnPolicyEvidence?.verifiedRefunds).toBe(1);
 });
 it('rejects wrong-currency full reversals at preview and posting, including retry attempts',async()=>{
  const {db,product}=await fixture(true);
  const saved=await sell(db,product.id);
  const stock=(await db.products.get(product.id))?.stockQuantity;
  await later(db);
  await expect(prepareLatestSaleReversal('USD',db)).rejects.toThrow(/currency/);
  await expect(executeLatestSaleReversal('USD',db,'run11-currency-guard-001'))
    .rejects.toThrow(/currency/);
  expect(await db.saleReversals.count()).toBe(0);
  expect((await db.products.get(product.id))?.stockQuantity).toBe(stock);
  const reversed=await executeLatestSaleReversal('GHS',db,'run11-currency-guard-001');
  expect(reversed.originalSaleId).toBe(saved.sale.id);
  await expect(executeLatestSaleReversal('USD',db,'run11-currency-guard-001'))
    .rejects.toThrow(/currency/);
  expect(await db.saleReversals.count()).toBe(1);
 });
 it('owner-enabled cash partial return retains original invoice, tax, stock and policy evidence',async()=>{
  const{db,product}=await fixture(true);
  const sale=await sell(db,product.id);await later(db);
  const ret=await recordConfirmedCashPartialReturn(
   request(sale.sale.id,sale.lines[0].id,'run11-allowed-part-1'),db);
  expect(ret.policyEvidence).toMatchObject({
   kind:'partialCash',salePolicy:{revision:1},decisionPolicy:{revision:1}
  });
  expect((await db.products.get(product.id))?.stockQuantity).toBe(3);
  expect((await getFinancialSummary('month',new Date(),undefined,undefined,db))
   .returnPolicyEvidence?.verifiedRefunds).toBe(1);
 });
 it('changing ordinary business details cannot erase append-only policy history',async()=>{
  const{db}=await fixture(true);
  await saveBusinessProfile({name:'Shop Renamed',country:'Ghana',currency:'GHS',
   businessType:'Retail shop',phone:'',email:'',address:''},db);
  const saved=(await db.businessProfiles.get('primary'))!;
  expect(saved.returnPolicyHistory).toHaveLength(1);
  expect(currentCompanyReturnPolicy(saved.returnPolicyHistory)).toMatchObject({
   revision:1,enabled:true
  });
 });
 it('revoking the current policy blocks returns without changing prior sale history',async()=>{
  const{db,product}=await fixture(true),sale=await sell(db,product.id);
  await later(db);
  await updateCompanyReturnPolicy({enabled:false,
   allowFullReversal:false,allowCashPartial:false,maxAgeDays:30},
   'Owner disables all returns',db);
  await expect(executeLatestSaleReversal('GHS',db,'run11-revoked-full-1'))
   .rejects.toThrow(/does not authorize/);
  expect((await db.sales.get(sale.sale.id))?.returnPolicyAtSale?.revision).toBe(1);
  expect((await db.businessProfiles.get('primary'))?.returnPolicyHistory).toHaveLength(2);
 });
 it('a sale created while no refunds existed cannot be made refundable retroactively',async()=>{
  const{db,product}=await fixture(),sale=await sell(db,product.id);
  await later(db);await updateCompanyReturnPolicy(allowBoth,'Enable future returns',db);
  await expect(executeLatestSaleReversal('GHS',db,'run11-old-sale-full-1'))
   .rejects.toThrow(/does not authorize/);
  expect((await db.sales.get(sale.sale.id))?.returnPolicyAtSale?.enabled).toBe(false);
 });
 it('full-only configuration denies partial cash refund but permits supported full correction',async()=>{
  const{db,product}=await fixture();
  await updateCompanyReturnPolicy({...allowBoth,allowCashPartial:false},
   'Owner allows only full returns',db);
  const sale=await sell(db,product.id);await later(db);
  await expect(recordConfirmedCashPartialReturn(
   request(sale.sale.id,sale.lines[0].id,'run11-deny-partial-1'),db))
   .rejects.toThrow(/does not authorize/);
  expect((await executeLatestSaleReversal('GHS',db,'run11-full-only-1'))
   .policyEvidence?.kind).toBe('full');
 });
 it('tampered policy revision is rejected by backup preflight without restoring it',async()=>{
  const{db,product}=await fixture(true);await sell(db,product.id);
  const exported=await createBackup(db);
  const altered=structuredClone(exported);
  altered.records.businessProfiles[0].returnPolicyHistory![0].revision=7;
  expect(()=>parseBackup(stringifyBackup(altered))).toThrow(/return policy revision history/i);
 });
 it('tampered saved sale policy is rejected even when money and stock still reconcile',async()=>{
  const{db,product}=await fixture(true);await sell(db,product.id);
  const exported=await createBackup(db);
  const altered=structuredClone(exported);
  altered.records.sales[0].returnPolicyAtSale!.maxAgeDays=3650;
  // Keep the new local event snapshot consistent so this still exercises the
  // independent return-policy audit, rather than the event mismatch guard.
  altered.records.centralSaleEvents[0].payload.sale.returnPolicyAtSale!.maxAgeDays=3650;
  expect(()=>parseBackup(stringifyBackup(altered))).toThrow(/return policy snapshot/i);
 });
 it('tampered refund authorization does not disappear in otherwise valid portable backup',async()=>{
  const{db,product}=await fixture(true);await sell(db,product.id);await later(db);
  await executeLatestSaleReversal('GHS',db,'run11-backup-policy-1');
  const exported=await createBackup(db);
  expect(parseBackup(stringifyBackup(exported)).records.saleReversals).toHaveLength(1);
  const altered=structuredClone(exported);
  altered.records.saleReversals[0].policyEvidence!.decisionPolicy.revision=999;
  expect(()=>parseBackup(stringifyBackup(altered))).toThrow(/return policy snapshot|refund policy/i);
 });
 it('older refund lacking policy snapshots remains legible but is not newly certified',async()=>{
  const{db,product}=await fixture(true);await sell(db,product.id);await later(db);
  await executeLatestSaleReversal('GHS',db,'run11-legacy-refund-1');
  const altered=await createBackup(db);
  delete altered.records.saleReversals[0].policyEvidence;
  const parsed=parseBackup(stringifyBackup(altered));
  expect(parsed.records.saleReversals).toHaveLength(1);
  // This keeps historical money visible; it does NOT grant entitlement to
  // issue another refund without the current and original policy snapshots.
 });
});
