import {test,expect} from '@playwright/test';

/** Standalone browser WebCrypto smoke. Uses no real Tallybook ledger database. */
test('ST24-05 WebCrypto keyring unlock, recovery, record scope and lock work in the browser',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
   const mod=await import('/src/features/security/st24LedgerKeyring.mjs');
   const ownerPassphrase='a long unique sample passphrase for browser QA';
   const {keyring,handle,recoveryCode}=await mod.createLedgerKeyring({
     workspaceId:'disposable-browser-qa',companyId:'qa-business-one',ownerPassphrase
   });
   const privateRow={id:'sale-test',amountMinor:34000,customer:'Private browser fixture'};
   const encrypted=await mod.sealLedgerRecord(handle,'sales','sale-test',privateRow);
   const decrypted=await mod.openLedgerRecord(
     await mod.unlockLedgerWithRecoveryCode(keyring,recoveryCode),'sales','sale-test',encrypted);
   const swapped={...encrypted,companyId:'qa-business-two'};
   let movedRejected=false,wrongPassRejected=false,lockRejected=false;
   try{await mod.openLedgerRecord(handle,'sales','sale-test',swapped);}catch{movedRejected=true;}
   try{await mod.unlockLedgerWithPassphrase(keyring,'not the real owner passphrase');}catch{wrongPassRejected=true;}
   mod.lockLedgerHandle(handle);
   try{await mod.openLedgerRecord(handle,'sales','sale-test',encrypted);}catch{lockRejected=true;}
   const newHandle=await mod.unlockLedgerWithPassphrase(keyring,ownerPassphrase);
   const back=await mod.openLedgerRecord(newHandle,'sales','sale-test',encrypted);
   return {
      correct:JSON.stringify(decrypted)===JSON.stringify(privateRow)&&JSON.stringify(back)===JSON.stringify(privateRow),
      noPlaintext:!JSON.stringify(encrypted).includes('Private browser fixture'),
      movedRejected,wrongPassRejected,lockRejected,
      hasSecureContext:globalThis.isSecureContext
   };
 });
 expect(result).toEqual({
   correct:true,noPlaintext:true,movedRejected:true,
   wrongPassRejected:true,lockRejected:true,hasSecureContext:true
 });
});


test('ST24-05 encrypted shadow survives browser reload and exposes no customer plaintext in IndexedDB',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const initial=await page.evaluate(async()=>{
  const keys=await import('/src/features/security/st24LedgerKeyring.mjs');
  const shadow=await import('/src/features/security/st24ShadowSnapshot.mjs');
  const passphrase='synthetic shadow snapshot browser test password';
  const {keyring,handle}=await keys.createLedgerKeyring({workspaceId:'shadow-browser-fixture',companyId:'shop-browser-qa',ownerPassphrase:passphrase});
  const text=JSON.stringify({kind:'fixture-only',records:{sales:[{id:'browser-sale',amountMinor:3200,customer:'Do Not Persist Plaintext'}]}});
  const result=await shadow.stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase:passphrase,verifiedBackupJson:text});
  const db=await new Promise((resolve,reject)=>{
   const req=indexedDB.open(shadow.ST24_SHADOW_DB_NAME);
   req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
  const raw=await new Promise((resolve,reject)=>{
   const tx=db.transaction(['snapshots','chunks'],'readonly');
   const snapshots=tx.objectStore('snapshots').get(result.snapshotId);
   const chunks=tx.objectStore('chunks').index('bySnapshot').getAll(result.snapshotId);
   tx.oncomplete=()=>resolve({snapshot:snapshots.result,chunks:chunks.result});
   tx.onerror=()=>reject(tx.error);
  });
  db.close();
  return {id:result.snapshotId,clear:!JSON.stringify(raw).includes('Do Not Persist Plaintext'),text};
 });
 expect(initial.clear).toBe(true);
 await page.reload({waitUntil:'domcontentloaded'});
 const restored=await page.evaluate(async({id,text})=>{
   const keys=await import('/src/features/security/st24LedgerKeyring.mjs');
   const shadow=await import('/src/features/security/st24ShadowSnapshot.mjs');
   const db=await new Promise((resolve,reject)=>{
    const req=indexedDB.open(shadow.ST24_SHADOW_DB_NAME);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   const snapshot=await new Promise((resolve,reject)=>{
    const tx=db.transaction('snapshots','readonly');
    const req=tx.objectStore('snapshots').get(id);
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
   });
   db.close();
   const handle=await keys.unlockLedgerWithPassphrase(snapshot.keyring,'synthetic shadow snapshot browser test password');
   const actual=await shadow.readSt24ShadowSnapshot({snapshotId:id,handle});
   return {verified:actual.state==='verified',exact:actual.text===text};
 },{id:initial.id,text:initial.text});
 expect(restored).toEqual({verified:true,exact:true});
});
