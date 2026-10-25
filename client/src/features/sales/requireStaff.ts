import type { TallybookDB } from '@/db/TallybookDB';
import { activeStaffShift, currentStaffId, requirePermission } from '@/features/staff/staff';
import { getActiveBusinessProfileId } from '@/features/business/activeCompany';
import { assertCheckoutAttribution } from './requireStaff.mjs';

/** Must be called inside the calling sale transaction, with staff and shift stores included. */
export async function requireSaleAttendant(database: TallybookDB, companyId: string) {
  if (getActiveBusinessProfileId() !== companyId) throw new Error('Company changed before checkout.');
  const actor = await requirePermission('sell', database, companyId);
  const shift = await activeStaffShift(actor, database);
  if (getActiveBusinessProfileId() !== companyId) throw new Error('Company changed during checkout.');
  return assertCheckoutAttribution(actor, shift, companyId, currentStaffId(companyId));
}
