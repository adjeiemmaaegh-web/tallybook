import {describe,it,expect} from 'vitest';
import 'fake-indexeddb/auto';
import {createLedgerKeyring,lockLedgerHandle} from './st24LedgerKeyring.mjs';
import {createSt24EncryptedFixture,writeSt24EncryptedFixture,readSt24EncryptedFixture} from './st24EncryptedRepository.mjs';

describe('ST24 encrypted disposable fixture repository',()=>{
 it('seals rows, rejects stale revisions, and never creates a production database',async()=>{
  const {keyring,handle}=await createLedgerKeyring({workspaceId:'test-owner',companyId:'shop-a',ownerPassphrase:'test passphrase that is long enough'});
  const dbName='tallybook-st24-encrypted-fixture-'+crypto.randomUUID().replaceAll('-','');
  const repo=await createSt24EncryptedFixture({dbName,keyring,handle});
  const id='opaque_1234567890123456';
  expect(await writeSt24EncryptedFixture(repo,{table:'sales',id,record:{customerName:'Secret',amountMinor:1234}})).toBe(1);
  expect(await readSt24EncryptedFixture(repo,{table:'sales',id})).toEqual({revision:1,record:{customerName:'Secret',amountMinor:1234}});
  await expect(writeSt24EncryptedFixture(repo,{table:'sales',id,record:{amountMinor:9999},expectedRevision:0})).rejects.toThrow(/revision conflict/);
  expect(await writeSt24EncryptedFixture(repo,{table:'sales',id,record:{amountMinor:1235},expectedRevision:1})).toBe(2);
  const raw=await new Promise((resolve,reject)=>{const request=indexedDB.open(dbName);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const stored=await new Promise((resolve,reject)=>{const request=raw.transaction('encryptedRows').objectStore('encryptedRows').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  expect(JSON.stringify(stored)).not.toContain('Secret');
  expect(raw.objectStoreNames.length).toBe(1);raw.close();
  await expect(createSt24EncryptedFixture({dbName:'tallybook-db',keyring,handle})).rejects.toThrow(/production database/);
  lockLedgerHandle(handle);
  await expect(readSt24EncryptedFixture(repo,{table:'sales',id})).rejects.toThrow(/locked/);
 });
});
