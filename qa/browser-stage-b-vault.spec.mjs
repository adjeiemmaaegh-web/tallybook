import {test,expect} from "@playwright/test";

const scope = label => ({userId:"browser-vault-"+label,companyId:"shop-vault-"+label});
const passphrase = "This is a browser-only recovery passphrase 2026";

test("Chromium: encrypted pending sale survives reload, unlocks and replays one idempotency key",async({page})=>{
  await page.goto("/");
  const value=await page.evaluate(async ({scope,passphrase})=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    const client=await import("/src/cloud/shopClient.ts");
    await mod.enableShopOutboxVault(scope,passphrase);
    const sale={submissionKey:"browserVaultKey000000000001",storeId:"store-a",
      paymentMethod:"cash",amountTenderedMinor:1800,lines:[{productId:"milk",quantity:2}]};
    const saved=await mod.submitSale(scope,sale,"Milk for private customer",
      async()=>{throw new client.ShopUnreachableError("offline");});
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open("tallybook-shared-shop-outbox-v2");
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    const all=await new Promise((resolve,reject)=>{
      const tx=db.transaction("entries","readonly");
      const request=tx.objectStore("entries").getAll();
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    db.close();
    const found=all.filter(row=>row.scopeKey===JSON.stringify([scope.userId,scope.companyId]));
    return {state:saved.state,rows:found,saleKey:sale.submissionKey};
  },{scope:scope("single"),passphrase});
  expect(value.state).toBe("queued");
  expect(value.rows).toHaveLength(1);
  const persisted=JSON.stringify(value.rows);
  expect(persisted).toContain('"sealed"');
  expect(persisted).not.toContain("Milk for private customer");
  expect(persisted).not.toContain('"amountTenderedMinor"');

  await page.reload();
  const after=await page.evaluate(async ({scope,passphrase})=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    const status=await mod.getShopOutboxVaultStatus(scope);
    let locked=false;
    try { await mod.readOutbox(scope); } catch { locked=true; }
    await mod.unlockShopOutboxVault(scope,passphrase);
    const queued=await mod.readOutbox(scope);
    const sent=[];
    const results=await mod.flushOutbox(scope,async sale=>{
      sent.push(sale.submissionKey);
      return {submissionKey:sale.submissionKey,receiptNumber:1,replayed:true,
        saleId:"browser-sale-1", companyId:scope.companyId,storeId:sale.storeId,currency:"GHS",
        recordedAt:new Date().toISOString(),totalMinor:1800,refundedMinor:0,
        payment:{method:"cash",amountDueMinor:1800,amountTenderedMinor:1800,changeMinor:0,reference:null},
        lines:sale.lines.map((line,i)=>({lineNo:i+1,productId:line.productId,
          quantity:line.quantity,lineTotalMinor:1800}))};
    });
    return {status,locked,keys:queued.map(x=>x.sale.submissionKey),
      sent,results:results.map(x=>x.state),remaining:await mod.readOutbox(scope)};
  },{scope:scope("single"),passphrase});
  expect(after.status).toEqual({configured:true,unlocked:false});
  expect(after.locked).toBe(true);
  expect(after.keys).toEqual([value.saleKey]);
  expect(after.sent).toEqual([value.saleKey]);
  expect(after.results).toEqual(["recorded"]);
  expect(after.remaining).toEqual([]);
});

test("Chromium: two tabs preserve distinct protected sales and reject cross-tab key collisions",async({page,context})=>{
  const id=scope("multi");
  await page.goto("/");
  await page.evaluate(async ({id,passphrase})=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    await mod.enableShopOutboxVault(id,passphrase);
  },{id,passphrase});
  const other=await context.newPage();
  await other.goto("/");
  await other.evaluate(async ({id,passphrase})=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    await mod.unlockShopOutboxVault(id,passphrase);
  },{id,passphrase});
  async function submit(target,key,qty){
    return target.evaluate(async({id,key,qty})=>{
      const mod=await import("/src/cloud/shopOutbox.ts");
      const client=await import("/src/cloud/shopClient.ts");
      const sale={submissionKey:key,storeId:"store-a",paymentMethod:"cash",
        amountTenderedMinor:qty*100,lines:[{productId:"rice",quantity:qty}]};
      const result=await mod.submitSale(id,sale,"Rice customer details",
        async()=>{throw new client.ShopUnreachableError("offline");});
      return result.state;
    },{id,key,qty});
  }
  const results=await Promise.all([
    submit(page,"browserVaultMulti0000000001",1),
    submit(other,"browserVaultMulti0000000002",2)
  ]);
  expect(results).toEqual(["queued","queued"]);
  const rows=await page.evaluate(async id=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    return (await mod.readOutbox(id)).map(e=>e.sale.submissionKey).sort();
  },id);
  expect(rows).toEqual(["browserVaultMulti0000000001","browserVaultMulti0000000002"]);
  await expect(submit(other,"browserVaultMulti0000000001",9)).rejects.toThrow(/different details/);
  const remain=await other.evaluate(async id=>{
    const mod=await import("/src/cloud/shopOutbox.ts");
    return (await mod.readOutbox(id)).length;
  },id);
  expect(remain).toBe(2);
});


test("Chromium: existing plaintext queue converts only with complete encrypted recovery proof",async({page})=>{
  const id=scope("migration"), pass="Owner recovery passphrase for real browser migration 2026";
  await page.goto("/");
  const first=await page.evaluate(async ({id,pass})=>{
    const q=await import("/src/cloud/shopOutbox.ts");
    const client=await import("/src/cloud/shopClient.ts");
    const sale={submissionKey:"browserVaultMigration0000001",storeId:"store-a",
      paymentMethod:"cash",amountTenderedMinor:750,lines:[{productId:"rice",quantity:3}]};
    await q.submitSale(id,sale,"Private customer invoice",async()=>{throw new client.ShopUnreachableError("offline");});
    const backup=await q.exportPlainShopOutboxRecovery(id,pass);
    await q.migratePlainShopOutboxToVault(id,pass,backup);
    const raw=await new Promise((resolve,reject)=>{
      const request=indexedDB.open("tallybook-shared-shop-outbox-v2");
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const db=request.result;
        const tx=db.transaction("entries","readonly");
        const all=tx.objectStore("entries").getAll();
        all.onerror=()=>reject(all.error);
        all.onsuccess=()=>{db.close();resolve(all.result);}
      };
    });
    return {backup,raw,submissionKey:sale.submissionKey};
  },{id,pass});
  expect(first.backup).toContain("tallybook.shared-shop.queue.recovery.v1");
  expect(first.backup).not.toContain("Private customer invoice");
  expect(JSON.stringify(first.raw)).not.toContain("Private customer invoice");
  expect(JSON.stringify(first.raw)).not.toContain("amountTenderedMinor");
  await page.reload();
  const outcome=await page.evaluate(async ({id,pass})=>{
    const q=await import("/src/cloud/shopOutbox.ts");
    const locked=await q.getShopOutboxVaultStatus(id);
    await q.unlockShopOutboxVault(id,pass);
    const before=await q.readOutbox(id);
    const results=await q.flushOutbox(id,async sale=>({
      submissionKey:sale.submissionKey,receiptNumber:3,replayed:true,
      saleId:"browser-sale-3",companyId:id.companyId,storeId:sale.storeId,currency:"GHS",
      recordedAt:new Date().toISOString(),totalMinor:750,refundedMinor:0,
      payment:{method:"cash",amountDueMinor:750,amountTenderedMinor:750,changeMinor:0,reference:null},
      lines:sale.lines.map((line,i)=>({lineNo:i+1,productId:line.productId,
        quantity:line.quantity,lineTotalMinor:750}))
    }));
    return {locked,keys:before.map(e=>e.sale.submissionKey),
      results:results.map(e=>e.state),remaining:(await q.readOutbox(id)).length};
  },{id,pass});
  expect(outcome.locked).toEqual({configured:true,unlocked:false});
  expect(outcome.keys).toEqual([first.submissionKey]);
  expect(outcome.results).toEqual(["recorded"]);
  expect(outcome.remaining).toBe(0);
});
