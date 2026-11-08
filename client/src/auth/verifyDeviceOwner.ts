import {db} from '@/db/TallybookDB';
import {loadActiveBusinessProfileId} from '@/features/business/activeCompany';
import {lockStaff, unlockStaff} from '@/features/staff/staff';

// The existing browser binding covers the entire ledger. One company's owner
// cannot authorize a transfer of a device containing multiple companies.
export async function verifyDeviceOwner(pin: string): Promise<boolean> {
  if (await db.businessProfiles.count() !== 1) return false;
  const company = await loadActiveBusinessProfileId(db);
  const owners = await db.staffMembers.where('businessProfileId').equals(company)
    .filter(member => member.role === 'owner' && !member.disabledAt).toArray();
  if (owners.length !== 1) return false;
  try {
    const member = await unlockStaff(owners[0].id, pin);
    return member.role === 'owner' && await db.businessProfiles.count() === 1;
  } finally { lockStaff(company); }
}
