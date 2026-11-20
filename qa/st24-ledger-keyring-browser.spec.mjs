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
