/** Non-mutating operational diagnostics for existing company-scoped local sales.
 * Findings are evidence warnings, not corrections, a bank reconciliation, or production QA.
 */
import { db, type TallybookDB } from '@/db/TallybookDB';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { requirePermission, currentStaffId } from '@/features/staff/staff';
import { inspectLocalSaleEvidence, type IntegritySnapshot } from './localIntegrityCore';
export { inspectLocalSaleEvidence };
export type { IntegrityFinding, IntegritySnapshot } from './localIntegrityCore';
/** Authorized, read-only. Audit does not change or block existing business transactions. */
export async function getLocalIntegrityOverview(database:TallybookDB=db):Promise<IntegritySnapshot> {
  const company=getActiveBusinessProfileId();
  const actor=await requirePermission('reports',database,company);
  const actorId=actor?.id??null;
  const result=await database.transaction('r',[database.sales,database.payments,database.staffShifts,database.staffMembers],async()=>{
    const [sales,payments,shifts]=await Promise.all([
      database.sales.where('businessProfileId').equals(company).toArray(),
      database.payments.where('businessProfileId').equals(company).toArray(),
      database.staffShifts.where('businessProfileId').equals(company).toArray()
    ]);
    if(company!==getActiveBusinessProfileId() || (actorId && actorId!==currentStaffId(company)))
      throw new Error('Company or staff session changed during integrity review.');
    return inspectLocalSaleEvidence(company,sales,payments,shifts);
  });
  if(company!==getActiveBusinessProfileId() || (actorId && actorId!==currentStaffId(company)))
    throw new Error('Company or staff session changed after integrity review.');
  return result;
}
