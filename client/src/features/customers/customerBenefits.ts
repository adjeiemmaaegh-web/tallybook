import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { requirePermission } from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
/** Stage 4 customer policies and independent prepaid/loyalty ledgers.
 * A wallet balance is NOT debt repayment or cash received. This module never
 * posts cash/stock or redeems value during POS checkout.
 */
import { nanoid } from 'nanoid';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { getCustomerDebtSummary } from '@/features/credit/credit';

export type BenefitKind = 'wallet' | 'points';
export interface CustomerBenefitEntry { id: string; businessProfileId: string; customerId: string; kind: BenefitKind; delta: number; reason: string; submissionKey: string; createdAt: string }
export interface CustomerPolicy { id: string; businessProfileId: string; customerId: string; creditLimitMinor?: number; paymentDueDays?: number; group?: string; maxDiscountPercent?: number; loyaltySpendMinorPerPoint?: number; loyaltyPointValueMinor?: number; updatedAt: string }

function safeNonNegative(value: number, name: string) { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative whole number.`); }
export async function setCustomerPolicy(customerId: string, input: Pick<CustomerPolicy,'creditLimitMinor'|'paymentDueDays'|'group'|'maxDiscountPercent'|'loyaltySpendMinorPerPoint'|'loyaltyPointValueMinor'>, database: TallybookDB = db) {
  return withCoordinatedRetailWrite(async () => {
    const businessProfileId = getActiveBusinessProfileId();
    if (input.creditLimitMinor !== undefined) safeNonNegative(input.creditLimitMinor, 'Credit limit');
    if (input.paymentDueDays !== undefined && (!Number.isSafeInteger(input.paymentDueDays) || input.paymentDueDays < 0 || input.paymentDueDays > 3650)) throw new Error('Due days must be between zero and 3650.');
    if (input.maxDiscountPercent !== undefined && (!Number.isInteger(input.maxDiscountPercent) || input.maxDiscountPercent < 0 || input.maxDiscountPercent > 100)) throw new Error('Maximum discount percent must be a whole number between 0 and 100.');
    if (input.loyaltySpendMinorPerPoint !== undefined && (!Number.isSafeInteger(input.loyaltySpendMinorPerPoint) || input.loyaltySpendMinorPerPoint < 1 || input.loyaltySpendMinorPerPoint > 1000000000)) throw new Error('Loyalty earning threshold must be a positive safe integer.');
    if (input.loyaltyPointValueMinor !== undefined && (!Number.isSafeInteger(input.loyaltyPointValueMinor) || input.loyaltyPointValueMinor < 1 || input.loyaltyPointValueMinor > 1000000000)) throw new Error('Loyalty point value must be a positive safe integer.');
    if ((input.group ?? '').length > 60) throw new Error('Customer group is too long.');
    return database.transaction('rw', [database.appMeta,database.customers,database.customerPolicies,database.staffMembers,database.staffAudits], async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const actor = await requirePermission('staff', database, businessProfileId);
      const customer = await database.customers.get(customerId);
      if (!customer || customer.businessProfileId !== businessProfileId || customer.archivedAt) throw new Error('Customer is unavailable.');
      const policy: CustomerPolicy = { id: `${businessProfileId}:${customerId}`, businessProfileId, customerId, creditLimitMinor: input.creditLimitMinor, paymentDueDays: input.paymentDueDays, group: input.group?.trim() || undefined, maxDiscountPercent: input.maxDiscountPercent, loyaltySpendMinorPerPoint: input.loyaltySpendMinorPerPoint, loyaltyPointValueMinor: input.loyaltyPointValueMinor, updatedAt: new Date().toISOString() };
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error("Company changed during customer policy update.");
      await database.customerPolicies.put(policy);
      if (actor) await database.staffAudits.add({id:nanoid(),businessProfileId,staffId:actor.id,action:'customer.policy.updated',createdAt:policy.updatedAt,details:customerId});
      return policy;
    });
  });
}
export async function getCustomerPolicy(customerId: string, database: TallybookDB = db) {
  const businessProfileId = getActiveBusinessProfileId();
  const policy=await database.transaction('r',[database.customerPolicies,database.staffMembers],async()=>{
    await requirePermission('sell',database,businessProfileId);
    return database.customerPolicies.get(`${businessProfileId}:${customerId}`);
  });
  if (getActiveBusinessProfileId() !== businessProfileId || (policy && (policy.businessProfileId !== businessProfileId || policy.customerId !== customerId)))
    throw new Error('Customer policy belongs to another company or company changed.');
  return policy;
}
export async function getCustomerBenefits(customerId: string, database: TallybookDB = db) {
  const businessProfileId = getActiveBusinessProfileId();
  const entries=await database.transaction('r',[database.customerBenefits,database.staffMembers],async()=>{
    await requirePermission('sell',database,businessProfileId);
    return database.customerBenefits.where('customerId').equals(customerId)
      .and(e=>e.businessProfileId===businessProfileId).toArray();
  });
  if (getActiveBusinessProfileId() !== businessProfileId) throw new Error('Company changed while loading customer benefits.');
  const walletMinor = entries.filter(e=>e.kind==='wallet').reduce((s,e)=>s+e.delta,0);
  const points = entries.filter(e=>e.kind==='points').reduce((s,e)=>s+e.delta,0);
  if (![walletMinor,points].every(x=>Number.isSafeInteger(x)&&x>=0)) throw new Error('Customer benefit ledger requires reconciliation.');
  return {walletMinor,points,entries:entries.sort((a,b)=>b.createdAt.localeCompare(a.createdAt))};
}
/** Manual adjustments only; wallet credits must reference an independently verified deposit.
 * They do not constitute recording a payment or redeeming the wallet for goods.
 */
export async function recordCustomerBenefit(input: {customerId:string;kind:BenefitKind;delta:number;reason:string;submissionKey:string}, database:TallybookDB=db) {
  return withCoordinatedRetailWrite(async () => {
    const businessProfileId=getActiveBusinessProfileId();
    if(!['wallet','points'].includes(input.kind)) throw new Error('Invalid benefit type.');
    if(input.kind === 'wallet') throw new Error('Use the verified prepaid deposit/refund workflow for wallet money movements.');
    if(!Number.isSafeInteger(input.delta)||input.delta===0||Math.abs(input.delta)>1_000_000_000) throw new Error('Invalid benefit adjustment.');
    if(!input.reason.trim() || input.reason.length>240) throw new Error('A brief adjustment reason is required.');
    if(input.submissionKey.length<8||input.submissionKey.length>80) throw new Error('Invalid submission key.');
    return database.transaction('rw',[database.appMeta,database.customers,database.customerBenefits,database.staffMembers,database.staffAudits],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      const actor=await requirePermission('staff',database,businessProfileId);
      const customer=await database.customers.get(input.customerId);
      if(!customer||customer.businessProfileId!==businessProfileId||customer.archivedAt) throw new Error('Customer is unavailable.');
      const prior=await database.customerBenefits.where('[businessProfileId+submissionKey]').equals([businessProfileId,input.submissionKey]).first();
      if(prior){if(prior.businessProfileId!==businessProfileId||prior.customerId!==input.customerId||prior.kind!==input.kind||prior.delta!==input.delta||prior.reason!==input.reason.trim())throw new Error('Submission key reused with different benefit details.');return prior;}
      const existing=await database.customerBenefits.where('customerId').equals(input.customerId).and(e=>e.businessProfileId===businessProfileId&&e.kind===input.kind).toArray();
      const balance=existing.reduce((s,e)=>s+e.delta,0)+input.delta;
      if(!Number.isSafeInteger(balance)||balance<0)throw new Error('Insufficient balance or invalid benefit ledger.');
      const entry:CustomerBenefitEntry={id:nanoid(14),businessProfileId,customerId:input.customerId,kind:input.kind,delta:input.delta,reason:input.reason.trim(),submissionKey:input.submissionKey,createdAt:new Date().toISOString()};
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error("Company changed during loyalty adjustment.");
      await database.customerBenefits.add(entry);
      if(actor)await database.staffAudits.add({id:nanoid(),businessProfileId,staffId:actor.id,action:'customer.points.adjusted',createdAt:entry.createdAt,details:entry.id});
      return entry;
    });
  });
}
export async function getCustomerCreditStatus(customerId:string,currency:string,database:TallybookDB=db){
  const [policy,debt]=await Promise.all([getCustomerPolicy(customerId,database),getCustomerDebtSummary(customerId,currency,database)]);
  return {policy,debt,remainingCreditMinor: policy?.creditLimitMinor===undefined?undefined:Math.max(0,policy.creditLimitMinor-debt.outstandingMinor)};
}

/** Management ageing estimate based on original sale date and customer payment terms.
 * Repayments are customer-level, not invoice-allocated: oldest debt is cleared first
 * for this ageing estimate. Never treat these bands as legally due invoices.
 */
export function ageCustomerDebt(sales: Array<{createdAt:string;outstandingMinor:number}>, totalRepaymentsMinor:number, dueDays:number, now=new Date()) {
  if (!Number.isSafeInteger(totalRepaymentsMinor) || totalRepaymentsMinor < 0 || !Number.isInteger(dueDays) || dueDays < 0) throw new Error('Invalid debt ageing inputs.');
  let remaining = totalRepaymentsMinor;
  const bands={notYetDueMinor:0,days1to30Minor:0,days31to60Minor:0,daysOver60Minor:0};
  for(const sale of [...sales].sort((a,b)=>a.createdAt.localeCompare(b.createdAt))){
    if(!Number.isSafeInteger(sale.outstandingMinor)||sale.outstandingMinor<0||!Number.isFinite(new Date(sale.createdAt).getTime()))throw new Error('Invalid sale ageing record.');
    const unpaid=Math.max(0,sale.outstandingMinor-remaining);remaining=Math.max(0,remaining-sale.outstandingMinor);
    const overdue=Math.floor((now.getTime()-new Date(sale.createdAt).getTime())/86400000)-dueDays;
    if(overdue<=0)bands.notYetDueMinor+=unpaid;
    else if(overdue<=30)bands.days1to30Minor+=unpaid;
    else if(overdue<=60)bands.days31to60Minor+=unpaid;
    else bands.daysOver60Minor+=unpaid;
  }
  if(remaining>0)throw new Error('Repayments exceed customer balances; reconcile before reporting ageing.');
  return bands;
}
