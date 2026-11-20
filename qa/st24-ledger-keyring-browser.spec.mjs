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


test('ST24-05 two-tab exclusive recovery lock denies concurrent shadow staging',async({browser})=>{
 const context=await browser.newContext();
 const first=await context.newPage(),second=await context.newPage();
 try{
  await first.goto('/',{waitUntil:'domcontentloaded'});
  await second.goto('/',{waitUntil:'domcontentloaded'});
  const locksSupported=await first.evaluate(()=>Boolean(navigator.locks?.request));
  if(!locksSupported){
   const blocked=await second.evaluate(async()=>{
    const keys=await import('/src/features/security/st24LedgerKeyring.mjs');
    const shadow=await import('/src/features/security/st24ShadowSnapshot.mjs');
    const ownerPassphrase='unavailable locks fixture passphrase';
    const {keyring,handle}=await keys.createLedgerKeyring({workspaceId:'lock-fixture',companyId:'test-company',ownerPassphrase});
    try{await shadow.stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase,verifiedBackupJson:'{"x":1}'});return false;}catch(e){return /Web Locks support/.test(String(e));}
   });
   expect(blocked).toBe(true);
   return;
  }
  await first.evaluate(()=>{
   window.__held=false;
   void navigator.locks.request('tallybook-v19:retail-assistant-recovery',{mode:'exclusive'},async()=>{
    window.__held=true;
    await new Promise(resolve=>{window.__releaseLock=resolve;});
   });
  });
  await expect.poll(()=>first.evaluate(()=>Boolean(window.__held)),{timeout:30000}).toBe(true);
  const denied=await second.evaluate(async()=>{
   const keys=await import('/src/features/security/st24LedgerKeyring.mjs');
   const shadow=await import('/src/features/security/st24ShadowSnapshot.mjs');
   const ownerPassphrase='concurrent staging fixture passphrase';
   const {keyring,handle}=await keys.createLedgerKeyring({workspaceId:'lock-fixture',companyId:'test-company',ownerPassphrase});
   try{await shadow.stageSt24ShadowSnapshot({keyring,handle,ownerPassphrase,verifiedBackupJson:'{"x":1}'});return false;}
   catch(e){return /Another tab is editing/.test(String(e));}
  });
  expect(denied).toBe(true);
  await first.evaluate(()=>window.__releaseLock());
 }finally{await context.close();}
});


test('ST24-05 real browser Dexie v39 disposable source encrypts and reconstructs populated financial schema',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const result=await page.evaluate(async()=>{
  const dbMod=await import('/src/db/TallybookDB.ts');
  const keys=await import('/src/features/security/st24LedgerKeyring.mjs');
  const migration=await import('/src/features/security/st24DisposableMigration.mjs');
  if(typeof indexedDB.databases!=='function'){
    return {supported:false,refused:true};
  }
  const sourceName='tallybook-st24-fixture-'+crypto.randomUUID();
  const targetName='tallybook-st24-restore-'+crypto.randomUUID();
  const companyId='primary';
  const source=new dbMod.TallybookDB(sourceName);
  await source.open();
  const expectedTables=source.tables.length;
  await source.businessProfiles.put({id:companyId,name:'Real engine fixture',
    country:'Ghana',currency:'GHS',businessType:'Retail shop',updatedAt:new Date().toISOString()});
  await source.sales.put({id:'test-sale-1',businessProfileId:companyId,
    submissionKey:'st24-browser-1',totalMinor:4500,paidMinor:3000,outstandingMinor:1500});
  await source.payments.put({id:'test-pay-1',businessProfileId:companyId,
    saleId:'test-sale-1',amountMinor:3000});
  source.close();
  const passphrase='st24 browser disposable migration passphrase';
  const {keyring,handle}=await keys.createLedgerKeyring({
    workspaceId:'disposable-browser-v39',companyId,ownerPassphrase:passphrase
  });
  const staged=await migration.stageSt24PopulatedDisposableLedger({
    sourceDbName:sourceName,companyId,keyring,handle,ownerPassphrase:passphrase
  });
  const restored=await migration.restoreSt24ShadowToDisposableLedger({
    snapshotId:staged.snapshotId,targetDbName:targetName,companyId,handle,
    expectedSourceSha256:staged.sourceSha256
  });
  const comparison=await migration.compareSt24DisposableLedgers({
    sourceDbName:sourceName,restoredDbName:targetName,companyId
  });
  const target=new dbMod.TallybookDB(targetName);
  await target.open();
  const targetSale=await target.sales.get('test-sale-1');
  const targetPayment=await target.payments.get('test-pay-1');
  const indexCount=await target.sales.where('businessProfileId').equals(companyId).count();
  target.close();
  return {
    supported:true,exact:comparison.exact,
    sourceVersion:staged.sourceVersion,tableCount:staged.tableCount,expectedTables,
    shaMatch:restored.sha256===staged.sourceSha256,
    financialSale:targetSale?.totalMinor===4500&&targetSale?.outstandingMinor===1500,
    financialPayment:targetPayment?.amountMinor===3000,
    indexedSale:indexCount===1
  };
 });
 if(!result.supported){
  expect(result.refused).toBe(true); // document unsupported engine as fail-closed, not migration acceptance
  return;
 }
 expect(result).toEqual({
  supported:true,exact:true,sourceVersion:390,
  tableCount:result.expectedTables,expectedTables:result.expectedTables,
  shaMatch:true,financialSale:true,financialPayment:true,indexedSale:true
 });
});
