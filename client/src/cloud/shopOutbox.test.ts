import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { dismissQueuedSale, flushOutbox, readOutbox, submitSale, enableShopOutboxVault, unlockShopOutboxVault, lockShopOutboxVault, getShopOutboxVaultStatus, exportProtectedShopOutbox, importProtectedShopOutbox, migratePlainShopOutboxToVault, exportPlainShopOutboxRecovery } from "./shopOutbox";
import { ShopRejectedError, ShopUnreachableError, type SaleRequest, type ShopReceipt } from "./shopClient";

let serial = 0;
function newScope() { return { userId: `u-stage-b-${++serial}`, companyId: "c1" }; }
function sale(key: string): SaleRequest {
  return { storeId: "s1", submissionKey: key, paymentMethod: "cash",
    amountTenderedMinor: 500, lines: [{ productId: "p1", quantity: 1 }] };
}
const key = (num: number) => `stageb${String(num).padStart(20, "0")}`;
const receipt = (id: string, replayed = false): ShopReceipt =>
  ({
    saleId: "sale-confirmed", submissionKey: id, receiptNumber: 1, replayed,
    companyId: "c1", storeId: "s1", currency: "GHS", totalMinor: 500,
    recordedAt: "2026-11-06T12:00:00.000Z", refundedMinor: 0,
    payment: {method: "cash", amountDueMinor: 500, amountTenderedMinor: 500, changeMinor: 0, reference: null},
    lines: [{lineNo: 1, productId: "p1", name: "Item", quantity: 1, unitPriceMinor: 500,
      lineTotalMinor: 500, refundedQuantity: 0}],
    refunds: [], storeName: "Main", cashierId: "employee"
  } as ShopReceipt);
const offline = async () => { throw new ShopUnreachableError("offline"); };
function oldStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
}

describe("shared-shop IndexedDB sale outbox", () => {
  it("persists before sending, then removes only the confirmed sale", async () => {
    const scope = newScope();
    const send = vi.fn(async (s: SaleRequest) => {
      expect((await readOutbox(scope)).map(e => e.sale.submissionKey)).toEqual([s.submissionKey]);
      return receipt(s.submissionKey);
    });
    expect((await submitSale(scope, sale(key(1)), "Eggs", send)).state).toBe("recorded");
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("retains the exact idempotency key after a lost response and replays once", async () => {
    const scope = newScope(), id = key(2);
    expect((await submitSale(scope, sale(id), "Eggs", offline)).state).toBe("queued");
    expect((await readOutbox(scope))[0].status).toBe("pending");
    const send = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey, true));
    expect(await flushOutbox(scope, send)).toEqual([{state: "recorded", receipt: receipt(id, true)}]);
    expect(send).toHaveBeenCalledWith(sale(id));
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("does not duplicate the same key in concurrent submissions", async () => {
    const scope = newScope(), id = key(3);
    await Promise.all(Array.from({length: 15}, () => submitSale(scope, sale(id), "Eggs", offline)));
    expect((await readOutbox(scope)).map(x=>x.sale.submissionKey)).toEqual([id]);
  });

  it("retains all concurrent distinct sales: no cross-tab read-modify-write loss", async () => {
    const scope = newScope();
    const ids = Array.from({length: 35}, (_, i) => key(100+i));
    await Promise.all(ids.map(id => submitSale(scope, sale(id), id, offline)));
    expect((await readOutbox(scope)).map(x=>x.sale.submissionKey).sort()).toEqual(ids.sort());
  });

  it("refuses reuse of a key for a different request", async () => {
    const scope = newScope(), id = key(4);
    await submitSale(scope, sale(id), "Eggs", offline);
    const changed = { ...sale(id), lines: [{productId: "p1", quantity: 2}] };
    await expect(submitSale(scope, changed, "Eggs", offline)).rejects.toThrow(/different details/);
    expect((await readOutbox(scope))[0].sale).toEqual(sale(id));
  });

  it("parks rejected sales for review and never replays them", async () => {
    const scope = newScope(), id = key(5);
    const refused = async () => { throw new ShopRejectedError("No stock"); };
    expect(await submitSale(scope, sale(id), "Eggs", refused)).toEqual({state: "rejected", error: "No stock"});
    const send = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
    await flushOutbox(scope, send);
    expect(send).not.toHaveBeenCalled();
    await dismissQueuedSale(scope, id);
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("stops replay at the first connection failure and retains later sales", async () => {
    const scope = newScope();
    await submitSale(scope, sale(key(6)), "A", offline);
    await submitSale(scope, sale(key(7)), "B", offline);
    const send = vi.fn(offline);
    await flushOutbox(scope, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(await readOutbox(scope)).toHaveLength(2);
  });

  it("isolates user and company", async () => {
    const scope = newScope();
    await submitSale(scope, sale(key(8)), "A", offline);
    expect(await readOutbox({...scope, userId: "another-user"})).toEqual([]);
    expect(await readOutbox({...scope, companyId: "another-company"})).toEqual([]);
  });

  it("retains a sale if a server receipt claims a different key", async () => {
    const scope = newScope();
    expect((await submitSale(scope, sale(key(9)), "A", async () => receipt(key(10)))).state).toBe("queued");
    expect(await readOutbox(scope)).toHaveLength(1);
  });

  it("migrates valid legacy sales durably and removes the old copy only afterwards", async () => {
    const scope = newScope(), storage = oldStorage();
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, JSON.stringify([
      { sale: sale(key(11)), summary: "Eggs", queuedAt: "2026-01-01T00:00:00.000Z", status: "pending" }
    ]));
    expect(await readOutbox(scope, storage)).toHaveLength(1);
    expect(storage.getItem(oldKey)).toBeNull();
    expect((await readOutbox(scope, storage))[0].sale.submissionKey).toBe(key(11));
  });

  it("quarantines invalid legacy JSON and preserves source data", async () => {
    const scope = newScope(), storage = oldStorage(), raw = "{not valid";
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, raw);
    await expect(readOutbox(scope, storage)).rejects.toThrow(/could not be migrated/);
    expect(storage.getItem(oldKey)).toBe(raw);
    await expect(submitSale(scope, sale(key(12)), "A", offline, storage)).rejects.toThrow();
  });

  it("rejects a malformed legacy sale without silently discarding other entries", async () => {
    const scope = newScope(), storage = oldStorage();
    const oldKey = `tallybook.shop.outbox.v1:${scope.userId}:${scope.companyId}`;
    storage.setItem(oldKey, JSON.stringify([{sale: sale("bad"), status:"pending"}]));
    await expect(readOutbox(scope, storage)).rejects.toThrow(/could not be migrated/);
    expect(storage.getItem(oldKey)).not.toBeNull();
  });
  it("fails closed on a corrupted IndexedDB sale without deleting evidence", async () => {
    const scope = newScope(), id = key(13);
    await submitSale(scope, sale(id), "Eggs", offline);
    const db = new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries: "id,scopeKey,queuedAt", quarantine: "id"});
    db.version(2).stores({entries: "id,scopeKey,queuedAt", quarantine: "id", vaults: "id"});
    const storedId = JSON.stringify([scope.userId, scope.companyId, id]);
    try {
      await db.table("entries").update(storedId, {summary: 42});
      await expect(readOutbox(scope)).rejects.toThrow(/need recovery/);
      const sender = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
      await expect(flushOutbox(scope, sender)).rejects.toThrow(/need recovery/);
      // A new sale must not bypass a damaged older queue entry.
      await expect(submitSale(scope, sale(key(14)), "New sale", sender)).rejects.toThrow(/need recovery/);
      expect(sender).not.toHaveBeenCalled();
      expect(await db.table("entries").get(storedId)).toBeDefined();
    } finally {
      db.close();
    }
  });

  it("never sends a new sale when older browser storage cannot be inspected", async () => {
    const scope = newScope();
    const deniedStorage = {
      getItem: (_key: string): string | null => { throw new Error("SecurityError"); },
      removeItem: (_key: string): void => { throw new Error("SecurityError"); }
    };
    const sender = vi.fn(async (s: SaleRequest) => receipt(s.submissionKey));
    await expect(submitSale(scope, sale(key(15)), "Rice", sender, deniedStorage))
      .rejects.toThrow(/storage cannot be read/i);
    expect(sender).not.toHaveBeenCalled();
  });

  it("protects a newly configured empty queue, including the sale details and summary", async () => {
    const scope = newScope(), passphrase = "A long and private queue recovery phrase";
    await enableShopOutboxVault(scope,passphrase);
    expect(await getShopOutboxVaultStatus(scope)).toEqual({configured:true,unlocked:true});
    const item=sale(key(81));
    await submitSale(scope,item,"Customer bought dairy and eggs",offline);
    const db=new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries:"id,scopeKey,queuedAt",quarantine:"id"});
    db.version(2).stores({entries:"id,scopeKey,queuedAt",quarantine:"id",vaults:"id"});
    try {
      const rows=await db.table("entries").where("scopeKey").equals(JSON.stringify([scope.userId,scope.companyId])).toArray();
      const raw=JSON.stringify(rows);
      expect(raw).toContain('"sealed"');
      expect(raw).not.toContain("Customer bought dairy");
      expect(raw).not.toContain('"amountTenderedMinor"');
      expect(raw).not.toContain('"productId"');
      expect(rows).toHaveLength(1);
    } finally {db.close();}
    expect((await readOutbox(scope))[0].sale).toEqual(item);
    lockShopOutboxVault(scope);
    expect(await getShopOutboxVaultStatus(scope)).toEqual({configured:true,unlocked:false});
    await expect(readOutbox(scope)).rejects.toThrow(/Unlock/);
    const sender=vi.fn(async (s:SaleRequest)=>receipt(s.submissionKey));
    await expect(submitSale(scope,sale(key(82)),"Cannot send",sender)).rejects.toThrow(/Unlock/);
    expect(sender).not.toHaveBeenCalled();
    await unlockShopOutboxVault(scope,passphrase);
    expect((await readOutbox(scope))[0].sale).toEqual(item);
    expect(await flushOutbox(scope,sender)).toEqual([{state:"recorded",receipt:receipt(item.submissionKey)}]);
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("refuses vault activation while a legacy or rejected sale still needs review",async()=>{
    const scope=newScope(),original=sale(key(83));
    await submitSale(scope,original,"Pending receipt",offline);
    await expect(enableShopOutboxVault(scope,"Private passphrase for this device")).rejects.toThrow(/Review or finish/);
    expect((await readOutbox(scope))[0].sale).toEqual(original);
    expect((await getShopOutboxVaultStatus(scope)).configured).toBe(false);
  });

  it("does not unlock with the wrong account, business, or passphrase",async()=>{
    const scope=newScope();
    await enableShopOutboxVault(scope,"private passphrase with letters and 123");
    await submitSale(scope,sale(key(84)),"Protected order",offline);
    lockShopOutboxVault(scope);
    await expect(unlockShopOutboxVault(scope,"another valid but wrong passphrase")).rejects.toThrow();
    expect((await getShopOutboxVaultStatus(scope)).unlocked).toBe(false);
    await expect(unlockShopOutboxVault({...scope,userId:"foreign-user"},"private passphrase with letters and 123")).rejects.toThrow(/No protected offline queue/);
    await expect(unlockShopOutboxVault({...scope,companyId:"foreign-business"},"private passphrase with letters and 123")).rejects.toThrow(/No protected offline queue/);
    await unlockShopOutboxVault(scope,"private passphrase with letters and 123");
    expect((await readOutbox(scope)).map(e=>e.sale.submissionKey)).toEqual([key(84)]);
  });

  it("preserves encrypted evidence and blocks replay if the sealed payload is modified",async()=>{
    const scope=newScope();
    await enableShopOutboxVault(scope,"This is a high entropy offline passphrase");
    await submitSale(scope,sale(key(85)),"Protected receipt",offline);
    const db=new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries:"id,scopeKey,queuedAt",quarantine:"id"});
    db.version(2).stores({entries:"id,scopeKey,queuedAt",quarantine:"id",vaults:"id"});
    const id=JSON.stringify([scope.userId,scope.companyId,key(85)]);
    try{
      const raw=await db.table("entries").get(id);
      await db.table("entries").update(id,{sealed:{...raw.sealed,data:"AAAA"}});
      const sender=vi.fn(async(s:SaleRequest)=>receipt(s.submissionKey));
      await expect(readOutbox(scope)).rejects.toThrow(/need recovery/i);
      await expect(flushOutbox(scope,sender)).rejects.toThrow(/need recovery/i);
      expect(sender).not.toHaveBeenCalled();
      expect((await db.table("entries").get(id)).sealed.data).toBe("AAAA");
    } finally {db.close();}
  });

  it("exports an encrypted-only portable queue and restores it on an empty same-account device",async()=>{
    const scope=newScope(),pass="Long private backup passphrase with symbols 2026!";
    await enableShopOutboxVault(scope,pass);
    await submitSale(scope,sale(key(90)),"Protected sale to Ama",offline);
    const exportText=await exportProtectedShopOutbox(scope);
    expect(exportText).toContain("tallybook.shared-shop.queue.recovery.v1");
    expect(exportText).not.toContain("Protected sale to Ama");
    expect(exportText).not.toContain('"amountTenderedMinor"');
    expect(JSON.parse(exportText).entries).toHaveLength(1);
    await expect(importProtectedShopOutbox({...scope,companyId:"other"},exportText,pass))
      .rejects.toThrow(/not for this signed-in account/i);

    // Simulate a fresh browser device for the same verified account by
    // clearing only this test scope's queue and vault records.
    const db=new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries:"id,scopeKey,queuedAt",quarantine:"id"});
    db.version(2).stores({entries:"id,scopeKey,queuedAt",quarantine:"id",vaults:"id"});
    lockShopOutboxVault(scope);
    try{
      const sk=JSON.stringify([scope.userId,scope.companyId]);
      await db.transaction("rw",db.table("entries"),db.table("vaults"),async()=>{
        await db.table("entries").where("scopeKey").equals(sk).delete();
        await db.table("vaults").delete(sk);
      });
      expect((await getShopOutboxVaultStatus(scope)).configured).toBe(false);
      await expect(importProtectedShopOutbox(scope,exportText,"incorrect recovery passphrase"))
        .rejects.toThrow(/verification failed/i);
      expect(await db.table("entries").where("scopeKey").equals(sk).count()).toBe(0);
      expect((await getShopOutboxVaultStatus(scope)).configured).toBe(false);
      expect(await importProtectedShopOutbox(scope,exportText,pass)).toBe(1);
      expect((await readOutbox(scope))[0].sale).toEqual(sale(key(90)));
      await expect(importProtectedShopOutbox(scope,exportText,pass))
        .rejects.toThrow(/already has queued sales/i);
      expect(await db.table("entries").where("scopeKey").equals(sk).count()).toBe(1);
    }finally{db.close();}
  });

  it("rejects tampered encrypted recovery data without modifying the target",async()=>{
    const scope=newScope(),pass="Long recovery test phrase for damaged files";
    await enableShopOutboxVault(scope,pass);
    await submitSale(scope,sale(key(91)),"Keep private",offline);
    const original=JSON.parse(await exportProtectedShopOutbox(scope));
    const tampered={...original,entries:original.entries.map((entry: {sealed:{data:string}}) =>
      ({...entry,sealed:{...entry.sealed,data:"AAAA"}}))};
    const db=new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries:"id,scopeKey,queuedAt",quarantine:"id"});
    db.version(2).stores({entries:"id,scopeKey,queuedAt",quarantine:"id",vaults:"id"});
    lockShopOutboxVault(scope);
    try{
      const sk=JSON.stringify([scope.userId,scope.companyId]);
      await db.transaction("rw",db.table("entries"),db.table("vaults"),async()=>{
        await db.table("entries").where("scopeKey").equals(sk).delete();
        await db.table("vaults").delete(sk);
      });
      await expect(importProtectedShopOutbox(scope,JSON.stringify(tampered),pass))
        .rejects.toThrow(/could not be authenticated/i);
      expect(await db.table("entries").where("scopeKey").equals(sk).count()).toBe(0);
      expect((await getShopOutboxVaultStatus(scope)).configured).toBe(false);
    }finally{db.close();}
  });

  it("atomically converts existing plaintext pending and rejected sales, preserving keys and statuses", async () => {
    const scope = newScope(), pass = "Long passphrase for legacy migration 2026";
    const pending = sale(key(190)), rejected = sale(key(191));
    await submitSale(scope, pending, "Legacy pending order", offline);
    await submitSale(scope, rejected, "Legacy rejected order", async () => { throw new ShopRejectedError("No stock"); });
    expect((await readOutbox(scope)).map(row => row.status)).toEqual(["pending","rejected"]);
    const backup=await exportPlainShopOutboxRecovery(scope,pass);
    expect(backup).not.toContain("Legacy pending order");
    expect(backup).not.toContain('"amountTenderedMinor"');
    expect(await migratePlainShopOutboxToVault(scope,pass,backup)).toBe(2);
    const db = new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries: "id,scopeKey,queuedAt", quarantine: "id"});
    db.version(2).stores({entries: "id,scopeKey,queuedAt", quarantine: "id", vaults: "id"});
    try {
      const rows = await db.table("entries").where("scopeKey").equals(JSON.stringify([scope.userId,scope.companyId])).toArray();
      expect(rows).toHaveLength(2);
      const serialized = JSON.stringify(rows);
      expect(serialized).not.toContain("Legacy pending order");
      expect(serialized).not.toContain("amountTenderedMinor");
      expect(rows.every(row => !!row.sealed && row.sale === undefined && row.summary === undefined)).toBe(true);
      lockShopOutboxVault(scope);
      await expect(readOutbox(scope)).rejects.toThrow(/Unlock/);
      await unlockShopOutboxVault(scope,pass);
      const saved = await readOutbox(scope);
      expect(saved.map(row=>row.sale.submissionKey).sort()).toEqual([pending.submissionKey,rejected.submissionKey].sort());
      expect(saved.find(row=>row.sale.submissionKey===rejected.submissionKey)?.status).toBe("rejected");
      const sender = vi.fn(async (s:SaleRequest)=>receipt(s.submissionKey));
      expect(await flushOutbox(scope,sender)).toEqual([{state:"recorded",receipt:receipt(pending.submissionKey)}]);
      expect(sender).toHaveBeenCalledTimes(1);
    } finally { db.close(); lockShopOutboxVault(scope); }
  });

  it("will not convert a damaged existing queue and preserves original plaintext evidence", async () => {
    const scope = newScope(), original = sale(key(192));
    await submitSale(scope,original,"Original sale",offline);
    const db = new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries: "id,scopeKey,queuedAt", quarantine: "id"});
    db.version(2).stores({entries: "id,scopeKey,queuedAt", quarantine: "id", vaults: "id"});
    const id=JSON.stringify([scope.userId,scope.companyId,original.submissionKey]);
    try {
      await db.table("entries").update(id,{summary:99});
      await expect(exportPlainShopOutboxRecovery(scope,"Strong migration passphrase 2026")).rejects.toThrow(/need recovery/);
      const retained=await db.table("entries").get(id);
      expect(retained.sale).toEqual(original);
      expect(retained.summary).toBe(99);
      expect(await getShopOutboxVaultStatus(scope)).toEqual({configured:false,unlocked:false});
    } finally { db.close(); }
  });

  it("refuses an already-encrypted queue and a missing migration source", async () => {
    const empty = newScope();
    await expect(migratePlainShopOutboxToVault(empty,"Very strong private migration passphrase","{}")).rejects.toThrow(/no outstanding/i);
    const protectedScope = newScope();
    await enableShopOutboxVault(protectedScope,"Another strong passphrase for protection");
    await submitSale(protectedScope,sale(key(193)),"Already protected",offline);
    await expect(migratePlainShopOutboxToVault(protectedScope,"Another strong passphrase for protection","{}"))
      .rejects.toThrow(/already protected/i);
  });

  it("refuses conversion without a matching protected backup, without mutating plaintext sales", async () => {
    const scope=newScope(), pass="A sufficiently strong recovery phrase 2026";
    const original=sale(key(194));
    await submitSale(scope,original,"Sale before migration",offline);
    const backup=await exportPlainShopOutboxRecovery(scope,pass);
    const changed={...original,submissionKey:key(195)};
    await submitSale(scope,changed,"Second sale after the backup",offline);
    await expect(migratePlainShopOutboxToVault(scope,pass,backup))
      .rejects.toThrow(/does not match this account and pending sales/);
    await expect(migratePlainShopOutboxToVault(scope,pass,"{}"))
      .rejects.toThrow(/does not match this account and pending sales/);
    const current=await readOutbox(scope);
    expect(current.map(row=>row.sale.submissionKey).sort()).toEqual([original.submissionKey,changed.submissionKey].sort());
    expect(await getShopOutboxVaultStatus(scope)).toEqual({configured:false,unlocked:false});
  });

  it("rejects malformed sale quantities and tender inputs before saving or sending", async () => {
    const scope=newScope(), sender=vi.fn(async(s:SaleRequest)=>receipt(s.submissionKey));
    const invalid=[
      {...sale(key(201)), lines:[{productId:"p1",quantity:0}]},
      {...sale(key(202)), lines:[{productId:"p1",quantity:1.5}]},
      {...sale(key(203)), lines:[{productId:"p1",quantity:Number.MAX_SAFE_INTEGER}]},
      {...sale(key(204)), amountTenderedMinor:NaN},
      {...sale(key(205)), amountTenderedMinor:-200},
      {...sale(key(206)), paymentMethod:"unknown"},
      {storeId:"s1",submissionKey:key(207),lines:[{productId:"p1",quantity:1}],tenders:[{method:"cash",amountMinor:-2}]},
      {storeId:"s1",submissionKey:key(208),lines:[],tenders:[{method:"cash",amountMinor:100}]},
      {storeId:"s1",submissionKey:key(209),lines:[{productId:"p1",quantity:1}],tenders:[{method:"credit",amountMinor:Infinity}]}
    ];
    for(const value of invalid){
      await expect(submitSale(scope,value as SaleRequest,"unsafe",sender)).rejects.toThrow(/Sale details are invalid/);
    }
    expect(sender).not.toHaveBeenCalled();
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("halts all pending sale replay when a persisted financial value is corrupted",async()=>{
    const scope=newScope(),original=sale(key(210));
    await submitSale(scope,original,"Original sale",offline);
    const db=new Dexie("tallybook-shared-shop-outbox-v2");
    db.version(1).stores({entries:"id,scopeKey,queuedAt",quarantine:"id"});
    db.version(2).stores({entries:"id,scopeKey,queuedAt",quarantine:"id",vaults:"id"});
    const id=JSON.stringify([scope.userId,scope.companyId,original.submissionKey]);
    try{
      await db.table("entries").update(id,{sale:{...original,lines:[{productId:"p1",quantity:-999}]}});
      const sender=vi.fn(async(s:SaleRequest)=>receipt(s.submissionKey));
      await expect(readOutbox(scope)).rejects.toThrow(/need recovery/);
      await expect(flushOutbox(scope,sender)).rejects.toThrow(/need recovery/);
      expect(sender).not.toHaveBeenCalled();
      const saved=await db.table("entries").get(id);
      expect(saved.sale.lines[0].quantity).toBe(-999);
      expect(await db.table("entries").count()).toBeGreaterThan(0);
    }finally{db.close();}
  });

  it("keeps compatibility with old single-payment and current split-tender queue formats",async()=>{
    const scope=newScope();
    const legacy=sale(key(211));
    const split:SaleRequest={
      storeId:"s1",submissionKey:key(212),clientRecordedAt:new Date().toISOString(),
      lines:[{productId:"p1",quantity:1}],
      tenders:[{method:"cash",amountMinor:300,tenderedMinor:500},
        {method:"credit",amountMinor:200,customerId:"customer-a"}],
      discountMinor:0,discountReason:""
    };
    await submitSale(scope,legacy,"legacy",offline);
    await submitSale(scope,split,"split",offline);
    expect((await readOutbox(scope)).map(row=>row.sale.submissionKey)).toEqual([legacy.submissionKey,split.submissionKey]);
  });

  it("retains queued evidence when a receipt matches the key but not the company or store", async()=>{
    const scope=newScope(), original=sale(key(213));
    const wrongCompany=async(s:SaleRequest)=>({...receipt(s.submissionKey),companyId:"another-company"});
    const first=await submitSale(scope,original,"Cross-company receipt",wrongCompany);
    expect(first.state).toBe("queued");
    expect((await readOutbox(scope)).map(e=>e.sale.submissionKey)).toEqual([original.submissionKey]);
    const wrongStore=async(s:SaleRequest)=>({...receipt(s.submissionKey),storeId:"another-store"});
    const second=await flushOutbox(scope,wrongStore);
    expect(second[0]?.state).toBe("queued");
    expect((await readOutbox(scope)).map(e=>e.sale.submissionKey)).toEqual([original.submissionKey]);
    const correct=await flushOutbox(scope,async s=>receipt(s.submissionKey,true));
    expect(correct[0]?.state).toBe("recorded");
    expect(await readOutbox(scope)).toEqual([]);
  });

  it("never drops pending sales for receipts lacking financial identity or proof", async()=>{
    const scope=newScope(), original=sale(key(214));
    const malformed=[
      { ...receipt(original.submissionKey), saleId:"" },
      { ...receipt(original.submissionKey), totalMinor:NaN },
      { ...receipt(original.submissionKey), currency:"not-currency" },
      { ...receipt(original.submissionKey), payment:undefined },
      { ...receipt(original.submissionKey), lines:[] },
      { ...receipt(original.submissionKey), lines:[{...receipt(original.submissionKey).lines[0],quantity:2}] },
      { ...receipt(original.submissionKey), lines:[{...receipt(original.submissionKey).lines[0],productId:"other-item"}] },
      { ...receipt(original.submissionKey), payment:{...receipt(original.submissionKey).payment,amountDueMinor:400} },
      { ...receipt(original.submissionKey), refundedMinor:900 },
      { ...receipt(original.submissionKey), receiptNumber:-1 }
    ];
    await submitSale(scope,original,"Financial proof",offline);
    for(const data of malformed) {
      const result=await flushOutbox(scope, async()=>data as ShopReceipt);
      expect(result[0]?.state).toBe("queued");
      expect((await readOutbox(scope)).map(item=>item.sale.submissionKey))
        .toEqual([original.submissionKey]);
    }
    const resolved=await flushOutbox(scope,async()=>receipt(original.submissionKey,true));
    expect(resolved[0]?.state).toBe("recorded");
    expect(await readOutbox(scope)).toEqual([]);
  });

});
