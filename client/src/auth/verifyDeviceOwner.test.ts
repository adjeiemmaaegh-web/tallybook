import {expect, it} from 'vitest';
import {db, initializeDatabase} from '@/db/TallybookDB';
import {saveBusinessProfile} from '@/features/business/businessProfile';
import {createStaff, currentStaffId} from '@/features/staff/staff';
import {verifyDeviceOwner} from './verifyDeviceOwner';

it('requires the local owner PIN, leaves the session locked, and declines a multi-company claim', async () => {
  await initializeDatabase(db);
  const business = await saveBusinessProfile({name:'Owner proof shop',country:'Ghana',currency:'GHS',businessType:'Retail shop'});
  expect(await verifyDeviceOwner('392761')).toBe(false);
  await createStaff('Owner','owner','392761');
  await expect(verifyDeviceOwner('000000')).rejects.toThrow(/unlock/i);
  expect(await verifyDeviceOwner('392761')).toBe(true);
  expect(currentStaffId(business.id)).toBeFalsy();
  await db.businessProfiles.add({...business, id:'second',name:'Separate company'});
  expect(await verifyDeviceOwner('392761')).toBe(false);
});
