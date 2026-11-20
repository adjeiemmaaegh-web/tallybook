import {test,expect} from '@playwright/test';

/**
 * ST24-05 ACTIVE ledger encryption in a real browser engine. Fresh, isolated Playwright profile; synthetic data
 * only. Drives the real app ledger (Dexie + the encryption middleware), the real startup gate and real tab kills.
 */
const PASS='correct horse battery staple';
/** The app's own startup recovery briefly holds an exclusive Web Lock. Driving the ledger while it is held is refused by
 * design ("Another tab is editing..."), so wait until the page is lock-quiet (3 consecutive clean polls) before acting.
 * Slower engines (WebKit) lose this race if the test does not wait. */
const quiet=async page=>{
  await page.evaluate(async()=>{
    if(!navigator.locks?.query){await new Promise(r=>setTimeout(r,1500));return;}
    let clean=0;const deadline=Date.now()+20000;
    while(clean<3&&Date.now()<deadline){
      const {held=[],pending=[]}=await navigator.locks.query();
      clean=held.length===0&&pending.length===0?clean+1:0;
      await new Promise(r=>setTimeout(r,120));
    }
  });
};
const setup=async page=>page.evaluate(async pass=>{
  const [{db,initializeDatabase},{saveBusinessProfile},{createStaff,unlockStaff,openShift},{createCustomer},{createProduct},{completeSale},{recordBackupExportedAt}]=await Promise.all([
    import('/src/db/TallybookDB.ts'),import('/src/features/business/businessProfile.ts'),import('/src/features/staff/staff.ts'),
    import('/src/features/customers/customers.ts'),import('/src/features/inventory/inventory.ts'),import('/src/features/sales/sales.ts'),
    import('/src/features/backup/backup.ts')]);
  await initializeDatabase(db);
  await saveBusinessProfile({name:'Browser Encrypt Shop',country:'Ghana',currency:'GHS',businessType:'Retail'});
  const owner=await createStaff('Owner','owner','123456');await unlockStaff(owner.id,'123456');await openShift(0);
  await createCustomer({name:'Ama Boateng',phone:'+233205550001',email:'',address:'3 Hidden Lane',notes:'',status:'active'});
  const product=await createProduct({name:'Secret Rice',categoryId:'uncategorized',sellingPrice:'10',costPrice:'4',initialStock:'100',lowStockThreshold:'1'},'GHS');
  await completeSale({lines:[{productId:product.id,quantity:2}],discount:'0',paymentMethod:'cash',amountPaid:'20',currency:'GHS',submissionKey:'browser-sale-0001'});
  await recordBackupExportedAt(new Date().toISOString(),db,'primary','d'.repeat(64));
  return {ownerId:owner.id,productId:product.id};
},PASS);
const rawText=page=>page.evaluate(async()=>{
  const {db}=await import('/src/db/TallybookDB.ts');
  const idb=db.backendDB();let all='';
  for(const name of [...idb.objectStoreNames]){
    const rows=await new Promise(r=>{const q=idb.transaction(name).objectStore(name).getAll();q.onsuccess=()=>r(q.result);});
    all+=JSON.stringify(rows,(k,v)=>v instanceof Uint8Array?'<bytes>':v);
  }
  return all;
});

test('ST24-05 encrypt the live ledger: no plaintext at rest, reload gates on unlock, wrong passphrase refused, data intact',async({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await quiet(page);
  await setup(page);
  expect(await rawText(page)).toContain('Ama Boateng'); // it IS plaintext before
  const enabled=await page.evaluate(async pass=>{
    const {db}=await import('/src/db/TallybookDB.ts');
    const s=await import('/src/features/security/st24LedgerSecurity.ts');
    const before=await s.fingerprintLedger(db);
    const prepared=await s.prepareLedgerEncryption(db,pass);
    await s.beginLedgerEncryption(db,prepared,{typedRecoveryCode:prepared.recoveryCode});
    const after=await s.fingerprintLedger(db);
    return {same:s.diffFingerprints(before,after).length===0,scan:await s.scanRawLedger(db),code:prepared.recoveryCode};
  },PASS);
  expect(enabled.same).toBe(true);expect(enabled.scan.plaintext).toBe(0);expect(enabled.scan.sealed).toBeGreaterThan(5);
  const text=await rawText(page);
  for(const secret of ['Ama Boateng','ama boateng','233205550001','Hidden Lane','Secret Rice','Browser Encrypt Shop'])expect(text,`leaked ${secret}`).not.toContain(secret);

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading',{name:/Unlock Tallybook/i})).toBeVisible();
  expect(await rawText(page)).not.toContain('Ama Boateng');
  await page.getByLabel('Passphrase').fill('definitely the wrong passphrase');
  await page.getByRole('button',{name:'Unlock'}).click();
  await expect(page.getByRole('alert')).toContainText(/Incorrect credential/);
  await page.getByLabel('Passphrase').fill(PASS);
  await page.getByRole('button',{name:'Unlock'}).click();
  await expect(page.getByRole('heading',{name:/Unlock Tallybook/i})).toHaveCount(0);
  const name=await page.evaluate(async()=>{const {db}=await import('/src/db/TallybookDB.ts');return (await db.customers.toArray())[0]?.name;});
  expect(name).toBe('Ama Boateng');
});

test('ST24-05 two tabs: a second tab must unlock itself; concurrent sales from both seal and conserve stock',async({page,context})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await quiet(page);
  const {productId}=await setup(page);
  await page.evaluate(async pass=>{const {db}=await import('/src/db/TallybookDB.ts');const s=await import('/src/features/security/st24LedgerSecurity.ts');
    const p=await s.prepareLedgerEncryption(db,pass);await s.beginLedgerEncryption(db,p,{typedRecoveryCode:p.recoveryCode});},PASS);
  const second=await context.newPage();
  await second.goto('/',{waitUntil:'domcontentloaded'});
  await quiet(second);
  await expect(second.getByRole('heading',{name:/Unlock Tallybook/i})).toBeVisible(); // memory keys are per tab
  await second.getByLabel('Passphrase').fill(PASS);await second.getByRole('button',{name:'Unlock'}).click();
  await expect(second.getByRole('heading',{name:/Unlock Tallybook/i})).toHaveCount(0);
  const sell=(pg,key)=>pg.evaluate(async([pid,k])=>{
    const {db}=await import('/src/db/TallybookDB.ts');const {completeSale}=await import('/src/features/sales/sales.ts');
    const {unlockStaff}=await import('/src/features/staff/staff.ts');
    const owner=await db.staffMembers.where('businessProfileId').equals('primary').first();
    try{await unlockStaff(owner.id,'123456');}catch{}
    return completeSale({lines:[{productId:pid,quantity:1}],discount:'0',paymentMethod:'cash',amountPaid:'10',currency:'GHS',submissionKey:k}).then(()=>'ok',e=>String(e.message));
  },[productId,key]);
  const [a,b]=await Promise.all([sell(page,'tab-one-sale-0001'),sell(second,'tab-two-sale-0001')]);
  expect([a,b]).toEqual(['ok','ok']);
  const result=await second.evaluate(async pid=>{
    const {db}=await import('/src/db/TallybookDB.ts');const s=await import('/src/features/security/st24LedgerSecurity.ts');
    return {sales:await db.sales.count(),stock:(await db.products.get(pid)).stockQuantity,scan:await s.scanRawLedger(db)};
  },productId);
  expect(result.sales).toBe(3);expect(result.stock).toBe(100-2-1-1);expect(result.scan.plaintext).toBe(0);
});

test('ST24-05 a tab KILLED in the middle of conversion loses nothing and is resumed to a verified encrypted ledger',async({page,context})=>{
  test.setTimeout(180000);
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await quiet(page);
  await setup(page);
  // Enough rows that conversion takes long enough to interrupt for real.
  await page.evaluate(async()=>{
    const {db}=await import('/src/db/TallybookDB.ts');const rows=[];
    for(let i=0;i<6000;i++)rows.push({id:'bulk-'+i,businessProfileId:'primary',name:'Bulk Person '+i,normalizedName:'bulk person '+i,phone:'+23320'+String(1000000+i),email:'',address:'',notes:'note '+i,status:'active',createdAt:new Date(),updatedAt:'2026-01-01T00:00:00.000Z'});
    await db.customers.bulkAdd(rows);
  });
  const observer=await context.newPage();await observer.goto('/',{waitUntil:'domcontentloaded'});await quiet(observer);
  const original=await page.evaluate(async()=>{const {db}=await import('/src/db/TallybookDB.ts');const s=await import('/src/features/security/st24LedgerSecurity.ts');
    window.__fingerprint=await s.fingerprintLedger(db);return window.__fingerprint;});
  // Start conversion in the victim tab WITHOUT awaiting it.
  await page.evaluate(async pass=>{const {db}=await import('/src/db/TallybookDB.ts');const s=await import('/src/features/security/st24LedgerSecurity.ts');
    const p=await s.prepareLedgerEncryption(db,pass);window.__begin=s.beginLedgerEncryption(db,p,{typedRecoveryCode:p.recoveryCode});window.__begin.catch(()=>{});},PASS);
  // Watch from another tab until conversion is genuinely half done, then kill the first tab.
  await expect.poll(async()=>observer.evaluate(()=>new Promise(res=>{
    const r=indexedDB.open(Object.keys({}).length?'':'tallybook-db');
    r.onsuccess=()=>{const idb=r.result;if(!idb.objectStoreNames.contains('customers')){idb.close();res(0);return;}
      const q=idb.transaction('customers').objectStore('customers').getAll();
      q.onsuccess=()=>{idb.close();const rows=q.result;res(rows.filter(x=>x.__seal).length>500&&rows.some(x=>!x.__seal)?1:0);};};
    r.onerror=()=>res(0);
  })),{timeout:60000,intervals:[25]}).toBe(1);
  await page.close({runBeforeUnload:false});
  // A fresh tab: ledger comes up in 'migrating', locked; every row is still readable once unlocked.
  const recovered=await context.newPage();await recovered.goto('/',{waitUntil:'domcontentloaded'});
  // A killed tab's lock may linger briefly in some engines; wait for it to clear rather than assume it is gone.
  await quiet(recovered);
  await expect(recovered.getByRole('heading',{name:/Finish turning on encryption/i})).toBeVisible();
  await recovered.getByLabel('Passphrase').fill(PASS);
  await recovered.getByRole('button',{name:'Finish'}).click();
  await expect(recovered.getByRole('heading',{name:/Finish turning on encryption/i})).toHaveCount(0,{timeout:120000});
  const final=await recovered.evaluate(async()=>{
    const {db}=await import('/src/db/TallybookDB.ts');const s=await import('/src/features/security/st24LedgerSecurity.ts');
    return {scan:await s.scanRawLedger(db),customers:await db.customers.count(),status:(await s.prepareLedgerSecurity(db)).state,fp:await s.fingerprintLedger(db)};
  });
  expect(final.status).toBe('encrypted');expect(final.scan.plaintext).toBe(0);expect(final.customers).toBe(6001);
  for(const t of Object.keys(original))expect(final.fp[t],'table '+t).toEqual(original[t]);
});
