import {db} from '@/db/TallybookDB';
import {loadActiveBusinessProfileId} from '@/features/business/activeCompany';
import {lockStaff, unlockStaff} from '@/features/staff/staff';

// The existing browser binding covers the entire ledger. One company's owner
// cannot authorize a transfer of a device containing multiple companies.
async function eligibleOwner() {
  if (await db.businessProfiles.count() !== 1) return null;
  const company = await loadActiveBusinessProfileId(db);
  const owners = await db.staffMembers.where('businessProfileId').equals(company)
    .filter(member => member.role === 'owner' && !member.disabledAt).toArray();
  const owner = owners.length === 1 ? owners[0] : null;
  return owner?.pinHash && owner.salt ? owner : null;
}

export async function canClaimWithPin(): Promise<boolean> {
  return Boolean(await eligibleOwner());
}

export async function verifyDeviceOwner(pin: string): Promise<boolean> {
  const owner = await eligibleOwner();
  if (!owner) return false;
  try {
    const member = await unlockStaff(owner.id, pin);
    return member.role === 'owner' && await db.businessProfiles.count() === 1;
  } finally { lockStaff(owner.businessProfileId); }
}
