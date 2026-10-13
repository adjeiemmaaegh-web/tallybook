/** Client integration: verifies the lock on real IndexedDB entrypoints.
 * Requires Vitest, Dexie, and browser-compatible navigator.locks shim.
 */
import Dexie from 'dexie';
import { afterEach, expect, it } from 'vitest';
import { initializeDatabase, TallybookDB } from '@/db/TallybookDB';
import { saveBusinessProfile } from '@/features/business/businessProfile';
import { createCustomer } from '@/features/customers/customers';
import { recordWalletTransfer } from '@/features/customers/walletTransfers';
import { TWO_DATABASE_LOCK_NAME } from './crossTabDataLock.mjs';

const openDatabases:TallybookDB[]=[];
const names:string[]=[];
afterEach(async()=>{
  for (const database of openDatabases.splice(0)) database.close();
  for (const name of names.splice(0)) await new Dexie(name).delete();
});

it('refuses a wallet transfer while another tab holds the exclusive recovery lock', async()=>{
  const name=`wallet-lock-${crypto.randomUUID()}`;
  names.push(name);
  const database=new TallybookDB(name);
  openDatabases.push(database);
  await initializeDatabase(database);
  await saveBusinessProfile({name:"Lock Test Shop",country:"Ghana",currency:"GHS",businessType:"Retail shop",phone:"",email:"",address:""},database);
  const customer=await createCustomer({name:'Lock Test Buyer',phone:'0123456789',status:'active'},database);
  let release!:()=>void;
  let signal!:()=>void;
  const held=new Promise<void>(resolve=>{release=resolve;});
  const acquired=new Promise<void>(resolve=>{signal=resolve;});
  const holder=navigator.locks.request(TWO_DATABASE_LOCK_NAME,{mode:'exclusive',ifAvailable:true},async lock=>{
    expect(lock).not.toBeNull();signal();await held;
  });
  await acquired;
  try {
    await expect(recordWalletTransfer({customerId:customer.id,kind:'deposit',amountMinor:500,method:'cash',reference:'cash received',submissionKey:'prepaid-locked-001'},database)).rejects.toThrow(/Another tab/);
    expect(await database.walletTransfers.count()).toBe(0);
    expect(await database.customerBenefits.count()).toBe(0);
  } finally {release();await holder;}
  const transfer=await recordWalletTransfer({customerId:customer.id,kind:'deposit',amountMinor:500,method:'cash',reference:'cash received',submissionKey:'prepaid-locked-001'},database);
  expect(transfer.amountMinor).toBe(500);
  expect(await database.customerBenefits.count()).toBe(1);
});
