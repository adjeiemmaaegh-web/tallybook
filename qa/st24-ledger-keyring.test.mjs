import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto=webcrypto;
import {createLedgerKeyring,unlockLedgerWithPassphrase,unlockLedgerWithRecoveryCode,
  sealLedgerRecord,openLedgerRecord,changeLedgerPassphrase,resetLedgerPassphraseWithRecovery,replaceLedgerRecoveryCode}
  from '../client/src/features/security/st24LedgerKeyring.mjs';

const args={workspaceId:'owner:1',companyId:'company-a',ownerPassphrase:'correct horse battery horse 123'};
const clone=x=>JSON.parse(JSON.stringify(x));

test('ST24-05 create, passphrase/recovery unlock, seal/open with identical ledger identity',async()=>{
 const {keyring,handle,recoveryCode}=await createLedgerKeyring(args);
 assert.equal(recoveryCode.length,43);
 const row={id:'sale-1',amountMinor:123456,customer:'Private name'};
 const sealed=await sealLedgerRecord(handle,'sales','sale-1',row);
 assert.equal(JSON.stringify(sealed).includes('Private name'),false);
 assert.deepEqual(await openLedgerRecord(await unlockLedgerWithPassphrase(keyring,args.ownerPassphrase),'sales','sale-1',sealed),row);
 assert.deepEqual(await openLedgerRecord(await unlockLedgerWithRecoveryCode(keyring,recoveryCode),'sales','sale-1',sealed),row);
});

test('ST24-05 wrong passphrase, wrong recovery, corruption and record movement fail closed',async()=>{
 const {keyring,handle,recoveryCode}=await createLedgerKeyring(args);
 await assert.rejects(unlockLedgerWithPassphrase(keyring,'wrong credential length 123'),/Incorrect credential/);
 await assert.rejects(unlockLedgerWithRecoveryCode(keyring,'A'.repeat(43)),/Incorrect credential/);
 const sealed=await sealLedgerRecord(handle,'sales','sale-2',{id:'sale-2',amount:7});
 const altered=clone(sealed);altered.ciphertext=(altered.ciphertext[0]==='A'?'B':'A')+altered.ciphertext.slice(1);
 await assert.rejects(openLedgerRecord(handle,'sales','sale-2',altered),/authenticated/);
 await assert.rejects(openLedgerRecord(handle,'sales','sale-3',sealed),/Invalid encrypted/);
 await assert.rejects(openLedgerRecord(handle,'payments','sale-2',sealed),/Invalid encrypted/);
 const moved=clone(keyring);moved.companyId='company-b';
 await assert.rejects(unlockLedgerWithRecoveryCode(moved,recoveryCode),/Incorrect credential/);
});

test('ST24-05 password rotation does not require re-encrypting every record',async()=>{
 const {keyring,handle,recoveryCode}=await createLedgerKeyring(args);
 const record=await sealLedgerRecord(handle,'receipts','r-1',{id:'r-1',paid:500});
 const next=await changeLedgerPassphrase(keyring,args.ownerPassphrase,'new unique passphrase with many words');
 await assert.rejects(unlockLedgerWithPassphrase(next,args.ownerPassphrase),/Incorrect credential/);
 assert.deepEqual(await openLedgerRecord(await unlockLedgerWithPassphrase(next,'new unique passphrase with many words'),'receipts','r-1',record),{id:'r-1',paid:500});
 assert.deepEqual(await openLedgerRecord(await unlockLedgerWithRecoveryCode(next,recoveryCode),'receipts','r-1',record),{id:'r-1',paid:500});
});

test('ST24-05 malicious keyring parameters and oversized encoded inputs rejected early',async()=>{
 const {keyring,handle}=await createLedgerKeyring(args);
 for(const altered of [Object.assign(clone(keyring),{iterations:1}),Object.assign(clone(keyring),{iterations:1e9}),Object.assign(clone(keyring),{version:2})])
  await assert.rejects(unlockLedgerWithPassphrase(altered,args.ownerPassphrase),/Invalid/);
 const changed=clone(keyring);changed.passphrase.salt='A'.repeat(100000);
 await assert.rejects(unlockLedgerWithPassphrase(changed,args.ownerPassphrase),/Invalid/);
 const record=await sealLedgerRecord(handle,'customers','c1',{name:'Private'});
 const giant=clone(record);giant.ciphertext='A'.repeat(2000000);
 await assert.rejects(openLedgerRecord(handle,'customers','c1',giant),/Invalid/);
});

test('ST24-05 oversized and missing JSON records are never stored',async()=>{
 const {handle}=await createLedgerKeyring(args);
 await assert.rejects(sealLedgerRecord(handle,'sales','bad',undefined),/JSON/);
 await assert.rejects(sealLedgerRecord(handle,'sales','big',{x:'x'.repeat(1024*1024)}),/size limit/);
});

test('ST24-05 recovery resets a lost passphrase and rotates a compromised recovery code',async()=>{
 const {keyring,handle,recoveryCode}=await createLedgerKeyring(args);
 const sealed=await sealLedgerRecord(handle,'payments','p7',{amount:77});
 const reset=await resetLedgerPassphraseWithRecovery(keyring,recoveryCode,'recovered owner passphrase for the device');
 await assert.rejects(unlockLedgerWithPassphrase(reset,args.ownerPassphrase),/Incorrect credential/);
 const newHandle=await unlockLedgerWithPassphrase(reset,'recovered owner passphrase for the device');
 assert.deepEqual(await openLedgerRecord(newHandle,'payments','p7',sealed),{amount:77});
 const changed=await replaceLedgerRecoveryCode(reset,'recovered owner passphrase for the device');
 await assert.rejects(unlockLedgerWithRecoveryCode(changed.keyring,recoveryCode),/Incorrect credential/);
 assert.deepEqual(await openLedgerRecord(await unlockLedgerWithRecoveryCode(changed.keyring,changed.recoveryCode),'payments','p7',sealed),{amount:77});
});
