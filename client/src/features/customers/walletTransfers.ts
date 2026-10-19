import { withCoordinatedRetailWrite } from "@/features/backup/coordinatedRetailWrite";
import { activeStaffShift, requirePermission } from "@/features/staff/staff";
import {assertRun7RetailWriteReady} from "@/features/backup/run7RetailWriteBarrier.mjs";
/** Separate cash movement evidence for prepaid deposits/refunds.
 * Sales using prepaid wallet value do not record new cash inflows.
 * External payment verification remains an owner responsibility: no provider webhook is claimed.
 */
import { nanoid } from 'nanoid';
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';

export type WalletTransferKind = 'deposit' | 'refund';
export type WalletTransferMethod = 'cash' | 'card' | 'mobile' | 'bank';
export interface WalletTransfer {
  id: string; businessProfileId: string; customerId: string; kind: WalletTransferKind;
  /** Currency captured at transfer; absent on historical unverified transfers. */
  currency?: string;
  amountMinor: number; method: WalletTransferMethod; reference: string;
  benefitEntryId: string; submissionKey: string; createdAt: string; staffId?:string; shiftId?:string;
}
export async function recordWalletTransfer(input: {
  customerId:string;kind:WalletTransferKind;amountMinor:number;method:WalletTransferMethod;
  reference:string;submissionKey:string;
}, database:TallybookDB=db) {
  return withCoordinatedRetailWrite(async () => {
    const businessProfileId=getActiveBusinessProfileId();
    if (!['deposit','refund'].includes(input.kind) || !['cash','card','mobile','bank'].includes(input.method)) throw new Error('Invalid prepaid cash transfer.');
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0 || input.amountMinor > 1_000_000_000) throw new Error('Invalid prepaid cash amount.');
    if (typeof input.reference !== 'string' || !input.reference.trim() || input.reference.length > 120) throw new Error('Enter an auditable payment or refund reference.');
    if (typeof input.submissionKey !== 'string' || !/^[A-Za-z0-9:_-]{8,80}$/.test(input.submissionKey)) throw new Error('Invalid transfer key.');
    if (typeof input.customerId !== 'string' || !input.customerId.trim()) throw new Error('Choose a customer for prepaid transfer.');
    return database.transaction('rw',[database.appMeta,database.businessProfiles,database.customers,database.customerBenefits,database.walletTransfers,database.staffMembers,database.staffShifts,database.staffAudits],async()=>{
      await assertRun7RetailWriteReady(database.appMeta);
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error('Company changed before prepaid transfer.');
      const staff=await requirePermission(input.kind === 'refund' ? 'refund' : 'sell',database,businessProfileId);
      const shift=await activeStaffShift(staff,database);
      if(staff?.role==='cashier' && !shift)throw new Error('Open a shift before accepting prepaid deposits.');
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error('Company changed during prepaid authorization.');
      const profile=await database.businessProfiles.get(businessProfileId);
      if (!profile || !/^[A-Z]{3}$/.test(profile.currency)) throw new Error('Business currency is unavailable for prepaid transactions.');
      const currency=profile.currency;
      const customer=await database.customers.get(input.customerId);
      if (!customer || customer.businessProfileId!==businessProfileId || customer.archivedAt) throw new Error('Customer is unavailable.');
      // A customer-scoped retry must not bypass a damaged or duplicated
      // journal. Compare the entire saved key history before returning success.
      const matchingKeys=await database.walletTransfers.where('submissionKey').equals(input.submissionKey).toArray();
      if (matchingKeys.length > 1) throw new Error('Prepaid transfer key has duplicate saved events.');
      const prior=matchingKeys[0];
      if (prior) {
        if (prior.businessProfileId!==businessProfileId || prior.currency!==currency || prior.customerId!==input.customerId || prior.kind!==input.kind || prior.amountMinor!==input.amountMinor || prior.method!==input.method || prior.reference!==input.reference.trim()) throw new Error('Transfer key was reused for different details.');
        const linked=await database.customerBenefits.get(prior.benefitEntryId);
        if(!linked || linked.businessProfileId!==businessProfileId || linked.customerId!==prior.customerId ||
          linked.kind!=='wallet' || linked.delta!==(prior.kind==='deposit'?prior.amountMinor:-prior.amountMinor) ||
          linked.submissionKey!==`wallet-transfer-${prior.id}`)
          throw new Error('Saved prepaid transfer needs reconciliation before it can be acknowledged.');
        if(getActiveBusinessProfileId()!==businessProfileId)throw new Error('Company changed during prepaid retry.');
        return prior;
      }
      const previousTransfers=await database.walletTransfers.where('customerId').equals(input.customerId).and(row=>row.businessProfileId===businessProfileId).toArray();
      if (previousTransfers.some(row=>row.currency!==currency)) throw new Error('Prepaid history has unknown or different currency; reconcile before further transfers.');
      // Each recorded manual cash movement must still have its exact wallet
      // posting. Refuse further deposits/refunds if an import or recovery left
      // the journal and the spendable customer balance inconsistent.
      const transferIds=new Set<string>();
      const transferKeys=new Set<string>();
      const transferBenefitIds=new Set<string>();
      for (const movement of previousTransfers) {
        if (transferIds.has(movement.id) || transferKeys.has(movement.submissionKey) ||
            transferBenefitIds.has(movement.benefitEntryId))
          throw new Error('Prepaid transfer journal contains repeated movement evidence.');
        transferIds.add(movement.id);
        transferKeys.add(movement.submissionKey);
        transferBenefitIds.add(movement.benefitEntryId);
        if (!Number.isSafeInteger(movement.amountMinor) || movement.amountMinor <= 0 ||
            !['deposit','refund'].includes(movement.kind))
          throw new Error('Prepaid transfer journal contains invalid money evidence.');
        const posting=await database.customerBenefits.get(movement.benefitEntryId);
        if (!posting || posting.businessProfileId!==businessProfileId ||
            posting.customerId!==input.customerId || posting.kind!=='wallet' ||
            posting.delta!==(movement.kind==='deposit'?movement.amountMinor:-movement.amountMinor) ||
            posting.submissionKey!==`wallet-transfer-${movement.id}`)
          throw new Error('Prepaid transfer and wallet history require reconciliation.');
      }
      const existing=await database.customerBenefits.where('customerId').equals(input.customerId)
        .and(e=>e.businessProfileId===businessProfileId && e.kind==='wallet').toArray();
      const balance=existing.reduce((n,e)=>{
        if (!Number.isSafeInteger(e.delta)) throw new Error('Prepaid wallet has invalid financial history.');
        const next=n+e.delta;
        if (!Number.isSafeInteger(next)) throw new Error('Prepaid wallet history exceeds safe money limits.');
        return next;
      },0);
      const delta=input.kind==='deposit'?input.amountMinor:-input.amountMinor;
      if (!Number.isSafeInteger(balance) || balance < 0 || !Number.isSafeInteger(balance+delta) || balance+delta < 0) throw new Error('Prepaid wallet requires reconciliation or has insufficient balance.');
      const now=new Date().toISOString();
      const benefitEntryId=nanoid(14);
      const transfer:WalletTransfer={id:nanoid(14),businessProfileId,customerId:input.customerId,kind:input.kind,
        amountMinor:input.amountMinor,currency,method:input.method,reference:input.reference.trim(),benefitEntryId,
        submissionKey:input.submissionKey,createdAt:now,...(staff?{staffId:staff.id}:{}),...(shift?{shiftId:shift.id}:{})};
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error('Company changed before prepaid posting.');
      await assertRun7RetailWriteReady(database.appMeta);
      const postingStaff=await requirePermission(input.kind === 'refund' ? 'refund' : 'sell',database,businessProfileId);
      const postingShift=await activeStaffShift(postingStaff,database);
      if(postingStaff?.role==='cashier' && !postingShift)throw new Error('Cashier shift closed before prepaid transfer was recorded.');
      await database.customerBenefits.add({id:benefitEntryId,businessProfileId,customerId:input.customerId,
        kind:'wallet',delta,reason:`Verified prepaid ${input.kind}: ${input.reference.trim()}`,
        submissionKey:`wallet-transfer-${transfer.id}`,createdAt:now});
      await database.walletTransfers.add(transfer);
      if(staff)await database.staffAudits.add({id:nanoid(14),businessProfileId,staffId:staff.id,action:`wallet.${input.kind}`,createdAt:now,details:transfer.id});
      if(getActiveBusinessProfileId()!==businessProfileId)throw new Error('Company changed during prepaid posting.');
      return transfer;
    });
  });
}
export async function getWalletTransfers(customerId:string,database:TallybookDB=db) {
  const businessProfileId=getActiveBusinessProfileId();
  const transfers=await database.walletTransfers.where('customerId').equals(customerId)
    .and(row=>row.businessProfileId===businessProfileId).sortBy('createdAt');
  transfers.reverse();
  if(getActiveBusinessProfileId()!==businessProfileId || transfers.some(row=>row.businessProfileId!==businessProfileId || row.customerId!==customerId))
    throw new Error('Company changed while loading prepaid transfers.');
  return transfers;
}
