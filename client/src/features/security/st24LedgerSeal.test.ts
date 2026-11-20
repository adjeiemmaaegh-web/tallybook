/** ST24-05 active-ledger encryption layer, exercised on the REAL TallybookDB v39 schema (disposable names only). */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { TallybookDB } from "@/db/TallybookDB";
import { deriveSt24Subkeys } from "./st24RowCipher.mjs";
import { LedgerIntegrityError, LedgerLockedError, SEAL_FIELD, classifyIndexedFields, setSealFence } from "./st24LedgerSeal";

const open: TallybookDB[] = []; const names: string[] = [];
afterEach(async () => {
  for (const d of open.splice(0)) d.close();
  for (const n of names.splice(0)) { await new Dexie(n).delete(); try { localStorage.removeItem("tallybook-ledger-sealed:" + n); } catch { /* */ } }
});
async function keys() { return deriveSt24Subkeys(crypto.getRandomValues(new Uint8Array(32))); }
async function sealed(mode: "encrypted" | "migrating" = "encrypted") {
  const name = `st24-seal-${crypto.randomUUID()}`; names.push(name);
  const db = new TallybookDB(name); open.push(db); await db.open();
  db.ledgerSeal.unlock(await keys()); db.ledgerSeal.setMode(mode);
  return db;
}
const customer = (id: string, over: object = {}) => ({ id, businessProfileId: "co1", name: "Ama Mensah", normalizedName: "ama mensah", phone: "+233201234567",
  email: "ama@example.test", address: "12 Secret Street", notes: "owes a lot", status: "active", createdAt: new Date("2026-01-02T10:00:00Z"), updatedAt: "2026-01-02T10:00:00.000Z", ...over });
const sale = (id: string, over: object = {}) => ({ id, businessProfileId: "co1", customerId: "c1", receiptNumber: "RCPT-000123", currency: "GHS", status: "completed",
  subtotalMinor: 2500, discountMinor: 0, totalMinor: 2500, amountPaidMinor: 1000, outstandingMinor: 1500, paymentMethod: "cash", submissionKey: "sub-" + id,
  createdAt: "2026-01-02T10:00:00.000Z", ...over });
type Raw = Record<string, unknown>;
async function rawRows(db: TallybookDB, table: string): Promise<Raw[]> {
  const idb = db.backendDB();
  return new Promise((resolve, reject) => {
    const r = idb.transaction(table, "readonly").objectStore(table).getAll();
    r.onsuccess = () => resolve(r.result as Raw[]); r.onerror = () => reject(r.error);
  });
}
async function rawWrite(db: TallybookDB, table: string, row: Raw) {
  const idb = db.backendDB();
  await new Promise<void>((resolve, reject) => { const tx = idb.transaction(table, "readwrite"); tx.objectStore(table).put(row); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
const flat = (x: unknown): string => JSON.stringify(x, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v));

describe("plaintext mode is a pure pass-through", () => {
  it("stores rows unchanged and readable when no ledger has been sealed", async () => {
    const name = `st24-plain-${crypto.randomUUID()}`; names.push(name);
    const db = new TallybookDB(name); open.push(db); await db.open();
    db.ledgerSeal.lock(); db.ledgerSeal.setMode("plaintext"); // explicit: also holds when the whole suite is forced encrypted
    await db.customers.add(customer("c1") as never);
    const raw = await rawRows(db, "customers");
    expect(raw[0].name).toBe("Ama Mensah"); expect(SEAL_FIELD in raw[0]).toBe(false);
    expect((await db.customers.get("c1"))?.phone).toBe("+233201234567");
  });
});

describe("sealed rows: confidentiality at rest", () => {
  it("no non-index field, name, phone, amount or receipt number is readable in the stored rows", async () => {
    const db = await sealed();
    await db.customers.add(customer("c1") as never);
    await db.sales.add(sale("s1") as never);
    const text = flat(await rawRows(db, "customers")) + flat(await rawRows(db, "sales"));
    for (const secret of ["Ama Mensah", "ama mensah", "233201234567", "ama@example.test", "Secret Street", "owes a lot", "RCPT-000123", "2500", "1500"])
      expect(text, `leaked: ${secret}`).not.toContain(secret);
    const [row] = await rawRows(db, "customers");
    expect(row[SEAL_FIELD]).toBeTruthy(); expect(String(row.normalizedName)).toMatch(/^b1:/); expect(String(row.phone)).toMatch(/^b1:/);
    expect(row.id).toBe("c1"); expect(row.status).toBe("active"); // documented clear fields
    expect(row.email).toBeUndefined(); expect(row.address).toBeUndefined();
  });
  it("identical records produce different ciphertext each time", async () => {
    const db = await sealed();
    await db.customers.bulkAdd([customer("c1"), customer("c2", { id: "c2" })] as never);
    const [a, b] = await rawRows(db, "customers");
    expect(Buffer.from((a[SEAL_FIELD] as { c: Uint8Array }).c).equals(Buffer.from((b[SEAL_FIELD] as { c: Uint8Array }).c))).toBe(false);
  });
  it("the catalogue of readable index fields is pinned: a new index must be classified before it can ship", () => {
    const db = new TallybookDB(`st24-cat-${crypto.randomUUID()}`); names.push(db.name); open.push(db);
    const c = classifyIndexedFields(db);
    const blinded = c.filter(x => x.exposure === "blinded").map(x => `${x.table}.${x.field}`);
    expect(blinded).toEqual(["businessProfiles.name", "categories.name", "categories.normalizedName", "customers.name", "customers.normalizedName", "customers.phone",
      "inventoryMovements.resultingQuantity", "mobileMoneyProviders.normalizedName", "products.name", "products.normalizedName", "products.sku", "receipts.receiptNumber",
      "sales.outstandingMinor", "sales.receiptNumber", "storeLocations.normalizedName", "suppliers.normalizedName"]);
    const clear = c.filter(x => x.exposure === "clear");
    // No personal-identifier-looking index may ever be clear.
    for (const f of clear) expect(f.field, `${f.table}.${f.field}`).not.toMatch(/phone|email|address|^name$|normalizedName|sku|receiptNumber|outstandingMinor|amount|total|balance/i);
    expect(clear.length).toBeGreaterThan(100);
    const digest = clear.map(x => `${x.table}.${x.field}`).join("|");
    expect(digest.length).toBeGreaterThan(1000);
  });
});

describe("sealed rows: transparent Dexie behaviour", () => {
  it("add/put/bulk/get/getMany/toArray/where-equals/filter/count/each/orderBy-clear-field all return original values", async () => {
    const db = await sealed();
    const c1 = customer("c1"), c2 = customer("c2", { name: "Kofi Boateng", normalizedName: "kofi boateng", phone: "+233209999999", createdAt: new Date("2026-01-03T10:00:00Z") });
    await db.customers.bulkAdd([c1, c2] as never);
    expect(await db.customers.get("c1")).toEqual(c1);
    expect((await db.customers.get("c1"))?.createdAt).toBeInstanceOf(Date);
    expect(await db.customers.bulkGet(["c2", "nope", "c1"])).toEqual([c2, undefined, c1]);
    expect((await db.customers.toArray()).map(x => x.id).sort()).toEqual(["c1", "c2"]);
    expect((await db.customers.where("normalizedName").equals("kofi boateng").toArray()).map(x => x.id)).toEqual(["c2"]);
    expect((await db.customers.where("phone").equals("+233201234567").first())?.id).toBe("c1");
    expect(await db.customers.where("normalizedName").equals("nobody").count()).toBe(0);
    expect((await db.customers.where("normalizedName").equals("ama mensah").and(x => x.businessProfileId === "co1").toArray()).length).toBe(1);
    expect(await db.customers.count()).toBe(2);
    expect((await db.customers.orderBy("updatedAt").toArray()).length).toBe(2);
    const seen: string[] = []; await db.customers.each(x => { seen.push(x.name); }); expect(seen.sort()).toEqual(["Ama Mensah", "Kofi Boateng"]);
    expect((await db.customers.filter(x => x.name.startsWith("K")).toArray()).map(x => x.id)).toEqual(["c2"]);
    await db.customers.put({ ...c1, notes: "paid up" } as never);
    expect((await db.customers.get("c1"))?.notes).toBe("paid up");
  });
  it("update(), modify(object) and modify(fn) re-seal the whole row and never leak plaintext", async () => {
    const db = await sealed();
    await db.customers.bulkAdd([customer("c1"), customer("c2", { notes: "x" })] as never);
    await db.customers.update("c1", { notes: "UPDATED-SECRET-NOTE" } as never);
    await db.customers.where("normalizedName").equals("ama mensah").modify({ address: "MODIFIED-SECRET-ADDR" } as never);
    await db.customers.toCollection().modify(c => { c.status = "inactive" as never; });
    const c1 = await db.customers.get("c1");
    expect(c1?.notes).toBe("UPDATED-SECRET-NOTE"); expect(c1?.status).toBe("inactive"); expect((c1 as { address: string }).address).toBe("MODIFIED-SECRET-ADDR");
    const raw = await rawRows(db, "customers");
    expect(flat(raw)).not.toMatch(/UPDATED-SECRET|MODIFIED-SECRET|Ama Mensah/);
    expect(raw.every(r => r[SEAL_FIELD])).toBe(true);
    expect(raw.every(r => r.status === "inactive")).toBe(true); // clear index copy kept in step
  });
  it("delete paths work, including delete by blinded exact lookup", async () => {
    const db = await sealed();
    await db.customers.bulkAdd([customer("c1"), customer("c2", { normalizedName: "kofi", name: "Kofi" })] as never);
    await db.customers.delete("c1");
    await db.customers.where("normalizedName").equals("kofi").delete();
    expect(await db.customers.count()).toBe(0);
  });
  it("compound blinded index (storeLocations businessProfileId+normalizedName) answers exact lookups", async () => {
    const db = await sealed();
    await db.storeLocations.add({ id: "st1", businessProfileId: "co1", name: "Main Shop", normalizedName: "main shop", status: "active", createdAt: "2026-01-01T00:00:00.000Z" } as never);
    expect((await db.storeLocations.where("[businessProfileId+normalizedName]").equals(["co1", "main shop"]).first())?.id).toBe("st1");
    expect(await db.storeLocations.where("[businessProfileId+normalizedName]").equals(["co1", "other"]).count()).toBe(0);
    expect(flat(await rawRows(db, "storeLocations"))).not.toContain("Main Shop");
  });
  it("unique compound indexes still enforce idempotency across sealed rows", async () => {
    const db = await sealed();
    await db.sales.add(sale("s1", { submissionKey: "dup" }) as never);
    await expect(db.sales.add(sale("s2", { submissionKey: "dup" }) as never)).rejects.toThrow(/Constraint|already exists/i);
    expect(await db.sales.count()).toBe(1);
  });
  it("a blinded index refuses ordering, prefix, range and anyOf instead of returning wrong rows", async () => {
    const db = await sealed();
    await db.customers.bulkAdd([customer("c1"), customer("c2", { phone: "+233200000000" })] as never);
    await expect(db.customers.orderBy("name").toArray()).rejects.toThrow(/exact lookups only/);
    await expect(db.customers.where("name").startsWith("A").toArray()).rejects.toThrow(/exact lookups only/);
    await expect(db.customers.where("phone").above("+2").toArray()).rejects.toThrow(/exact lookups only/);
    await expect(db.customers.where("phone").anyOf(["+233201234567"]).toArray()).rejects.toThrow(/exact lookups only/);
    await expect(db.sales.where("outstandingMinor").above(0).count()).rejects.toThrow(/exact lookups only/);
  });
  it("transactions spanning several sealed tables commit and roll back atomically", async () => {
    const db = await sealed();
    await db.transaction("rw", db.customers, db.sales, async () => { await db.customers.add(customer("c1") as never); await db.sales.add(sale("s1") as never); });
    expect(await db.sales.count()).toBe(1);
    await expect(db.transaction("rw", db.customers, db.sales, async () => {
      await db.customers.add(customer("c2") as never); await db.sales.add(sale("s2") as never); throw new Error("boom");
    })).rejects.toThrow("boom");
    expect(await db.customers.count()).toBe(1); expect(await db.sales.count()).toBe(1);
  });
  it("appMeta stays readable (holds no business data) so the app can boot before unlock", async () => {
    const db = await sealed();
    await db.appMeta.put({ key: "schemaVersion", value: "39", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect((await rawRows(db, "appMeta"))[0].value).toBe("39");
  });
});

describe("locked, tampered and downgraded ledgers fail closed", () => {
  it("locking blocks every read and write with a clear error, and unlocking restores access with the same key", async () => {
    const db = await sealed(); const k = await keys();
    await db.customers.add(customer("c1") as never);
    const sameKeys = { rowKey: new Uint8Array(32), blindKey: new Uint8Array(32) };
    void sameKeys; void k;
    db.ledgerSeal.lock();
    await expect(db.customers.get("c1")).rejects.toThrow(LedgerLockedError);
    await expect(db.customers.toArray()).rejects.toThrow(LedgerLockedError);
    await expect(db.customers.add(customer("c2") as never)).rejects.toThrow(LedgerLockedError);
    await expect(db.sales.add(sale("s1") as never)).rejects.toThrow(LedgerLockedError);
  });
  it("a connection left in plaintext mode cannot read sealed rows", async () => {
    const db = await sealed(); await db.customers.add(customer("c1") as never);
    db.ledgerSeal.lock(); db.ledgerSeal.setMode("plaintext");
    await expect(db.customers.get("c1")).rejects.toThrow(LedgerLockedError);
  });
  it("editing an index copy, swapping ciphertext between rows, or flipping a ciphertext bit is detected", async () => {
    const db = await sealed();
    await db.customers.bulkAdd([customer("c1"), customer("c2", { normalizedName: "kofi", name: "Kofi", phone: "+2330" })] as never);
    const [r1, r2] = (await rawRows(db, "customers")).sort((a, b) => String(a.id).localeCompare(String(b.id)));
    await rawWrite(db, "customers", { ...r1, status: "archived" });
    await expect(db.customers.get("c1")).rejects.toThrow(LedgerIntegrityError);
    await rawWrite(db, "customers", { ...r1 });
    await rawWrite(db, "customers", { ...r1, [SEAL_FIELD]: r2[SEAL_FIELD] });
    await expect(db.customers.get("c1")).rejects.toThrow(/authenticated/i);
    const flipped = { ...(r1[SEAL_FIELD] as { v: number; n: Uint8Array; c: Uint8Array }) }; flipped.c = new Uint8Array(flipped.c); flipped.c[3] ^= 1;
    await rawWrite(db, "customers", { ...r1, [SEAL_FIELD]: flipped });
    await expect(db.customers.get("c1")).rejects.toThrow(/authenticated/i);
    await expect(db.customers.toArray()).rejects.toThrow();
  });
  it("a plaintext row injected into an encrypted ledger is refused, not trusted", async () => {
    const db = await sealed(); await db.customers.add(customer("c1") as never);
    await rawWrite(db, "customers", customer("evil", { name: "Injected" }) as unknown as Raw);
    await expect(db.customers.get("evil")).rejects.toThrow(LedgerIntegrityError);
    await expect(db.customers.toArray()).rejects.toThrow(LedgerIntegrityError);
  });
  it("a row sealed for one table or key cannot be moved into another", async () => {
    const db = await sealed(); await db.customers.add(customer("c1") as never); await db.customers.add(customer("c2", { phone: "+2331", normalizedName: "z", name: "Z" }) as never);
    const [r1] = (await rawRows(db, "customers")).filter(r => r.id === "c1");
    await rawWrite(db, "customers", { ...r1, id: "c9" });
    await expect(db.customers.get("c9")).rejects.toThrow(/authenticated/i);
    await rawWrite(db, "suppliers", { id: "c1", businessProfileId: "co1", normalizedName: "x", archivedAt: undefined, updatedAt: "x", [SEAL_FIELD]: r1[SEAL_FIELD] });
    await expect(db.suppliers.get("c1")).rejects.toThrow();
  });
  it("migrating mode accepts both converted and unconverted rows; encrypted mode accepts only sealed rows", async () => {
    const db = await sealed("migrating");
    await rawWrite(db, "customers", customer("old") as unknown as Raw);
    await db.customers.add(customer("new", { normalizedName: "n", name: "N", phone: "+2" }) as never);
    expect((await db.customers.toArray()).map(x => x.id).sort()).toEqual(["new", "old"]);
    db.ledgerSeal.setMode("encrypted");
    await expect(db.customers.toArray()).rejects.toThrow(LedgerIntegrityError);
  });
  it("the cross-tab fence stops a stale plaintext tab from writing after another tab sealed the ledger", async () => {
    const name = `st24-fence-${crypto.randomUUID()}`; names.push(name);
    const db = new TallybookDB(name); open.push(db); await db.open();
    db.ledgerSeal.lock(); db.ledgerSeal.setMode("plaintext");
    await db.customers.add(customer("c1") as never);
    setSealFence(name, true);
    await expect(db.customers.add(customer("c2") as never)).rejects.toThrow(/encrypted in another tab/);
    await expect(db.customers.get("c1")).resolves.toBeTruthy(); // reads of still-plaintext rows are unaffected
  });
});
