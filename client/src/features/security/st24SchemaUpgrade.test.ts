/** Encrypted-ledger schema upgrade: a newer Tallybook (schema 40, simulated) opening a ledger encrypted under schema 39. */
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DATABASE_SCHEMA_VERSION, TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";
import { createCustomer } from "@/features/customers/customers";
import { createProduct } from "@/features/inventory/inventory";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { KEYRING_DB_NAME, beginLedgerEncryption, beginDataKeyRotation, fingerprintLedger, prepareDataKeyRotation, prepareLedgerEncryption, prepareLedgerSecurity, scanRawLedger, unlockLedger, upgradeEncryptedLedger } from "./st24LedgerSecurity";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
const NEXT = DATABASE_SCHEMA_VERSION + 1;
/** What the next release might do: index a field that was never indexed, and back-fill a new indexed field in an upgrader. */
class NextTallybookDB extends TallybookDB {
  constructor(name: string) {
    super(name);
    // products gets a new index but NO upgrader touches its rows: only the re-projection step can make them consistent.
    this.version(NEXT).stores({ customers: "id, businessProfileId, name, normalizedName, phone, status, archivedAt, updatedAt, email, tier",
      products: "id, businessProfileId, name, normalizedName, sku, categoryId, archivedAt, lowStockThreshold, updatedAt, sellingPriceMinor" })
      .upgrade(tx => tx.table("customers").toCollection().modify((c: Record<string, unknown>) => { c.tier = "standard"; }));
  }
}
const open: Dexie[] = []; const names: string[] = [];
afterEach(async () => {
  lockStaff("primary"); for (const d of open.splice(0)) { try { (d as TallybookDB).ledgerSeal?.lock(); } catch { /* */ } d.close(); }
  for (const n of names.splice(0)) await Dexie.delete(n);
  await Dexie.delete(KEYRING_DB_NAME); setActiveBusinessProfileId("primary");
});
async function readRecord(dbName: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => { const o = indexedDB.open(KEYRING_DB_NAME); o.onsuccess = () => { const g = o.result.transaction("keyrings").objectStore("keyrings").get(dbName); g.onsuccess = () => { o.result.close(); resolve(g.result); }; }; o.onerror = () => reject(o.error); });
}
async function rawVersion(name: string) { return (await indexedDB.databases()).find(d => d.name === name)?.version; }
async function rawCustomers(name: string): Promise<string> {
  return new Promise((resolve) => { const o = indexedDB.open(name); o.onsuccess = () => { const g = o.result.transaction("customers").objectStore("customers").getAll(); g.onsuccess = () => { o.result.close(); resolve(JSON.stringify(g.result, (_k, v) => v instanceof Uint8Array ? "<bytes>" : v)); }; }; });
}
/** An encrypted ledger written by the CURRENT release (schema 39) with three customers. Returns its name and recovery code. */
async function encryptedV39() {
  setActiveBusinessProfileId("primary");
  const name = `st24-upgrade-${crypto.randomUUID()}`; names.push(name);
  const db = new TallybookDB(name); open.push(db); await initializeDatabase(db);
  await saveBusinessProfile({ name: "Upgrade Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db);
  for (const [n, p, e] of [["Ama Boateng", "+233205550001", "ama@example.test"], ["Kofi Mensah", "+233205550002", "kofi@example.test"], ["Esi Owusu", "+233205550003", ""]])
    await createCustomer({ name: n, phone: p, email: e, address: "", notes: "", status: "active" }, db);
  await createProduct({ name: "Jasmine Rice", sku: "RICE-777", categoryId: "uncategorized", sellingPrice: "10", costPrice: "4", initialStock: "50", lowStockThreshold: "1" }, "GHS", db);
  await recordBackupExportedAt(new Date().toISOString(), db, "primary", "a".repeat(64));
  const p = await prepareLedgerEncryption(db, PASS); await beginLedgerEncryption(db, p, { typedRecoveryCode: p.recoveryCode });
  const before = await db.customers.orderBy("id").toArray();
  db.ledgerSeal.lock(); db.close(); lockStaff("primary"); codes.set(name, p.recoveryCode);
  return { name, recoveryCode: p.recoveryCode, before };
}
const next = (name: string) => { const d = new NextTallybookDB(name); open.push(d); return d; };

describe.skipIf(forced)("encrypted-ledger schema upgrade", () => {
  it("a newer schema is detected without opening the database; a wrong passphrase changes nothing", async () => {
    const { name } = await encryptedV39();
    const db = next(name);
    expect(await prepareLedgerSecurity(db)).toMatchObject({ state: "schema-upgrade", locked: true });
    expect(db.isOpen()).toBe(false); expect(await rawVersion(name)).toBe(DATABASE_SCHEMA_VERSION * 10); // Dexie stores version*10
    const rec = await readRecord(name);
    await expect(upgradeEncryptedLedger(db, { passphrase: "wrong passphrase 123" })).rejects.toThrow();
    expect(await readRecord(name)).toEqual(rec); expect(await rawVersion(name)).toBe(DATABASE_SCHEMA_VERSION * 10); expect(db.ledgerSeal.unlocked).toBe(false);
  });

  it("upgrade: upgraders run through the seal, every row is re-projected, new indexes answer queries, nothing is readable at rest", async () => {
    const { name, before } = await encryptedV39();
    const db = next(name);
    expect((await prepareLedgerSecurity(db)).state).toBe("schema-upgrade");
    const progress: number[] = [];
    await upgradeEncryptedLedger(db, { passphrase: PASS }, { onProgress: d => progress.push(d) });
    expect(progress.length).toBeGreaterThan(0);
    const rec = await readRecord(name); expect(rec.schemaVersion).toBe(NEXT); expect(rec.upgradingTo).toBeUndefined(); expect(rec.state).toBe("encrypted");
    const after = await db.customers.orderBy("id").toArray();
    expect(after.map(c => ({ ...c, tier: undefined }))).toEqual(before.map(c => ({ ...c, tier: undefined })));   // bodies unchanged
    expect(after.every(c => (c as unknown as { tier: string }).tier === "standard")).toBe(true);                 // upgrader applied
    expect((await db.customers.where("email").equals("kofi@example.test").toArray()).map(c => c.name)).toEqual(["Kofi Mensah"]); // NEW index works
    expect(await db.customers.where("tier").equals("standard").count()).toBe(3);
    expect((await db.customers.where("phone").equals("+233205550001").toArray()).map(c => c.name)).toEqual(["Ama Boateng"]); // blinded index still works
    // A table whose rows no upgrader rewrote: readable under strict index verification, and its NEW index answers.
    expect((await db.products.toArray()).map(p => p.name)).toEqual(["Jasmine Rice"]);
    expect((await db.products.where("sellingPriceMinor").equals(1000).toArray()).map(p => p.sku)).toEqual(["RICE-777"]);
    expect(await scanRawLedger(db)).toMatchObject({ plaintext: 0, unblinded: 0 });
    const raw = await rawCustomers(name);
    for (const secret of ["Ama Boateng", "Kofi", "+233205550001"]) expect(raw.includes(secret), secret).toBe(false);
    // Next start of the new release: ordinary encrypted ledger, ordinary unlock.
    db.ledgerSeal.lock(); db.close();
    const again = next(name);
    expect(await prepareLedgerSecurity(again)).toMatchObject({ state: "encrypted", locked: true });
    await unlockLedger(again, { passphrase: PASS });
    expect(await again.customers.count()).toBe(3);
  });

  it("an interrupted upgrade (crash mid re-projection) is detected on the next start and finished with the recovery code; nothing is lost", async () => {
    const { name, before } = await encryptedV39();
    const db = next(name);
    await prepareLedgerSecurity(db);
    await expect(upgradeEncryptedLedger(db, { passphrase: PASS }, { onProgress: () => { throw new Error("power cut"); } })).rejects.toThrow("power cut");
    const mid = await readRecord(name);
    expect(mid.schemaVersion).toBe(DATABASE_SCHEMA_VERSION); expect(mid.upgradingTo).toBe(NEXT);                  // durable marker
    expect(await rawVersion(name)).toBe(NEXT * 10); expect(db.ledgerSeal.unlocked).toBe(false);
    const restart = next(name);
    expect((await prepareLedgerSecurity(restart)).state).toBe("schema-upgrade");
    await upgradeEncryptedLedger(restart, { recoveryCode: (await encryptedCode(name)) });
    const done = await readRecord(name); expect(done.schemaVersion).toBe(NEXT); expect(done.upgradingTo).toBeUndefined();
    const rows = await restart.customers.orderBy("id").toArray();
    expect(rows.map(c => c.name)).toEqual(before.map(c => c.name));
    expect(await restart.customers.where("email").equals("ama@example.test").count()).toBe(1);
    expect(await restart.products.where("sellingPriceMinor").equals(1000).count()).toBe(1);
    expect(await scanRawLedger(restart)).toMatchObject({ plaintext: 0, unblinded: 0 });
    const fp = await fingerprintLedger(restart); expect(fp.customers.count).toBe(3);
  });

  it("a ledger from a NEWER release is refused (no downgrade), and so is an older ledger with an unfinished encryption change", async () => {
    const { name } = await encryptedV39();
    await patchRecord(name, { schemaVersion: NEXT + 5 });
    const db = next(name);
    expect(await prepareLedgerSecurity(db)).toMatchObject({ state: "schema-mismatch", locked: true });
    await expect(upgradeEncryptedLedger(db, { passphrase: PASS })).rejects.toThrow(/newer version/);
    expect(db.isOpen()).toBe(false);
    await patchRecord(name, { schemaVersion: DATABASE_SCHEMA_VERSION, state: "rekeying" });
    const db2 = next(name);
    const s = await prepareLedgerSecurity(db2); expect(s.state).toBe("schema-mismatch"); expect(s.message).toMatch(/interrupted/);
    await expect(upgradeEncryptedLedger(db2, { passphrase: PASS })).rejects.toThrow(/previous version/);
  });

  it("same schema: upgrade is a no-op and ordinary unlock is unaffected; key rotation after an upgrade still works", async () => {
    const { name } = await encryptedV39();
    const db = next(name); await prepareLedgerSecurity(db); await upgradeEncryptedLedger(db, { passphrase: PASS });
    const v = (await readRecord(name)).version;
    await upgradeEncryptedLedger(db, { passphrase: PASS });
    expect((await readRecord(name)).version).toBe(v);
    setActiveBusinessProfileId("primary");
    const owner = (await db.staffMembers.toArray()).find(s => s.role === "owner")!; await unlockStaff(owner.id, "123456", db);
    const rot = await prepareDataKeyRotation(db, PASS); await beginDataKeyRotation(db, rot, { passphrase: PASS, typedRecoveryCode: rot.recoveryCode });
    expect(await db.customers.where("email").equals("kofi@example.test").count()).toBe(1);
    expect((await readRecord(name)).schemaVersion).toBe(NEXT);
  });
});

const codes = new Map<string, string>();
async function encryptedCode(name: string) { return codes.get(name)!; }
async function patchRecord(dbName: string, patch: Record<string, unknown>) {
  await new Promise<void>((resolve, reject) => { const o = indexedDB.open(KEYRING_DB_NAME); o.onsuccess = () => { const tx = o.result.transaction("keyrings", "readwrite"); const s = tx.objectStore("keyrings");
    const g = s.get(dbName); g.onsuccess = () => { s.put({ ...g.result, ...patch }); tx.oncomplete = () => { o.result.close(); resolve(); }; }; }; o.onerror = () => reject(o.error); });
}
