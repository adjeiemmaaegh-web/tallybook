/**
 * ST24-05 active-ledger encryption service: enable, reload, lock/unlock, crash/resume, rollback, credential
 * changes, recovery package, lost key record, schema guard, two tabs, key races. Real services, real schema,
 * disposable database names. Skipped when the whole suite is forced encrypted (this file creates its own plaintext ledger).
 */
import Dexie from "dexie";
import { IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createProduct } from "@/features/inventory/inventory";
import { createCustomer } from "@/features/customers/customers";
import { completeSale } from "@/features/sales/sales";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getFinancialSummary } from "@/features/reports/financialIntelligence";
import { createStaff, lockStaff, openShift, unlockStaff } from "@/features/staff/staff";
import { createBackup, parseBackup, recordBackupExportedAt, restoreBackup } from "@/features/backup/backup";
import { SEAL_FIELD, LedgerLockedError, isSealFenced, setSealFence } from "./st24LedgerSeal";
import {
  KEYRING_DB_NAME, beginLedgerEncryption, changeLedgerPassphraseFor, diffFingerprints, disableLedgerEncryption, discardPreparedEncryption,
  exportRecoveryPackage, fingerprintLedger, importRecoveryPackage, lockLedger, prepareLedgerEncryption, prepareLedgerSecurity,
  resetLedgerPassphraseFor, resumeLedgerEncryption, rotateLedgerRecoveryCode, scanRawLedger, unlockLedger,
} from "./st24LedgerSecurity";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple", PASS2 = "another long passphrase 2026";
const open: TallybookDB[] = []; const names: string[] = [];
afterEach(async () => {
  lockStaff("primary");
  for (const d of open.splice(0)) d.close();
  for (const n of names.splice(0)) { await new Dexie(n).delete(); try { localStorage.removeItem("tallybook-ledger-sealed:" + n); } catch { /* */ } }
  await new Dexie(KEYRING_DB_NAME).delete();
  setActiveBusinessProfileId("primary");
});
const connect = (name: string) => { const d = new TallybookDB(name); open.push(d); return d; };

async function populated() {
  setActiveBusinessProfileId("primary");
  const name = `st24-sec-${crypto.randomUUID()}`; names.push(name);
  const db = connect(name); await initializeDatabase(db);
  await saveBusinessProfile({ name: "Ama Provisions", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db); await openShift(0, db);
  const customer = await createCustomer({ name: "Kofi Mensah", phone: "+233201112222", email: "", address: "7 Palm Road", notes: "", status: "active" }, db);
  const rice = await createProduct({ name: "Jasmine Rice", sku: "RICE-777", categoryId: "uncategorized", sellingPrice: "10", costPrice: "4", initialStock: "50", lowStockThreshold: "2" }, "GHS", db);
  await completeSale({ lines: [{ productId: rice.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "20", currency: "GHS", submissionKey: "sec-cash-0001" }, db);
  await completeSale({ lines: [{ productId: rice.id, quantity: 3 }], customerId: customer.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS", submissionKey: "sec-cred-0001" }, db);
  return { db, name, customer, rice };
}
async function withBackup(db: TallybookDB) { await recordBackupExportedAt(new Date().toISOString(), db, "primary", "a".repeat(64)); }
async function enable(db: TallybookDB, passphrase = PASS) {
  await withBackup(db);
  const prepared = await prepareLedgerEncryption(db, passphrase);
  await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
  return prepared.recoveryCode;
}
type Raw = Record<string, unknown>;
const raw = (db: TallybookDB, t: string) => new Promise<Raw[]>((res, rej) => { const r = db.backendDB().transaction(t, "readonly").objectStore(t).getAll(); r.onsuccess = () => res(r.result as Raw[]); r.onerror = () => rej(r.error); });
const everythingRaw = async (db: TallybookDB) => { let s = ""; for (const t of db.tables) s += JSON.stringify(await raw(db, t.name), (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v)); return s; };
const hasFailureHook = (db: TallybookDB, table: string, failOnCall: number) => {
  const proto = Object.getPrototypeOf(db.table(table)) as { bulkPut: (...a: unknown[]) => Promise<unknown> };
  const original = proto.bulkPut; let calls = 0; let fired = false;
  const spy = vi.spyOn(proto, "bulkPut").mockImplementation(function (this: { name: string }, ...args: unknown[]) {
    if (this.name === table && ++calls === failOnCall) { fired = true; return Promise.reject(new Error("simulated crash mid-conversion")); }
    return original.apply(this, args);
  });
  return { restore: () => spy.mockRestore(), fired: () => fired };
};

describe.skipIf(forced)("enable: verified, durable, reversible, conserving", () => {
  it("refuses to start without a verified backup, with a wrong typed code, for a weak passphrase, or for multiple companies", async () => {
    const { db } = await populated();
    const prepared = await prepareLedgerEncryption(db, PASS);
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/verify an encrypted backup/i);
    await withBackup(db);
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: "wrong" })).rejects.toThrow(/does not match/i);
    await expect(prepareLedgerEncryption(db, "short")).rejects.toThrow(/12 to 1024/);
    await db.businessProfiles.put({ ...(await db.businessProfiles.get("primary"))!, id: "second", name: "Second Shop" });
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/2 businesses/i);
    discardPreparedEncryption(prepared);
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/already used|cancelled/i);
    expect((await scanRawLedger(db)).sealed).toBe(0); // nothing was touched
    expect((await prepareLedgerSecurity(db)).state).toBe("plaintext");
  });

  it("encrypts the whole populated ledger; services keep working; money, stock and receivables are identical; nothing readable remains", async () => {
    const { db, customer } = await populated();
    const summaryBefore = await getFinancialSummary("month", new Date(), undefined, undefined, db);
    const debtBefore = (await getCustomerDebtSummary(customer.id, "GHS", db)).outstandingMinor;
    const before = await fingerprintLedger(db);
    expect(await everythingRaw(db)).toContain("Kofi Mensah"); // it IS plaintext today
    await enable(db);
    const scan = await scanRawLedger(db);
    expect(scan.plaintext).toBe(0); expect(scan.unblinded).toBe(0); expect(scan.sealed).toBeGreaterThan(8);
    const text = await everythingRaw(db);
    for (const secret of ["Kofi Mensah", "kofi mensah", "233201112222", "7 Palm Road", "Jasmine Rice", "jasmine rice", "RICE-777", "Ama Provisions", "sec-cash-0001"])
      if (secret !== "sec-cash-0001") expect(text, `leaked: ${secret}`).not.toContain(secret);
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);
    const summaryAfter = await getFinancialSummary("month", new Date(), undefined, undefined, db);
    expect([summaryAfter.revenueMinor, summaryAfter.collectionsMinor, summaryAfter.currentReceivablesMinor]).toEqual([summaryBefore.revenueMinor, summaryBefore.collectionsMinor, summaryBefore.currentReceivablesMinor]);
    expect((await getCustomerDebtSummary(customer.id, "GHS", db)).outstandingMinor).toBe(debtBefore);
    expect(isSealFenced(db.name)).toBe(true);
    // New activity after enabling is sealed too.
    const rice = (await db.products.toArray())[0];
    await completeSale({ lines: [{ productId: rice.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10", currency: "GHS", submissionKey: "sec-after-0001" }, db);
    expect((await scanRawLedger(db)).plaintext).toBe(0);
    expect(await db.sales.count()).toBe(3);
  });

  it("a reload (new connection) starts locked; wrong credentials change nothing; passphrase and recovery code both unlock", async () => {
    const { db, name } = await populated();
    const code = await enable(db);
    const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "encrypted", locked: true });
    await expect(fresh.customers.toArray()).rejects.toThrow(LedgerLockedError);
    await expect(unlockLedger(fresh, { passphrase: PASS2 })).rejects.toThrow(/Incorrect credential/);
    await expect(unlockLedger(fresh, { recoveryCode: "A".repeat(43) })).rejects.toThrow(/Incorrect credential/);
    expect(fresh.ledgerSeal.unlocked).toBe(false);
    await unlockLedger(fresh, { passphrase: PASS });
    expect((await fresh.customers.toArray())[0].name).toBe("Kofi Mensah");
    lockLedger(fresh); await expect(fresh.customers.toArray()).rejects.toThrow(LedgerLockedError);
    await unlockLedger(fresh, { recoveryCode: code });
    expect(await fresh.sales.count()).toBe(2);
  });
});

describe.skipIf(forced)("crash safety: interrupted at any point, nothing is lost and it can be resumed or rolled back", () => {
  it("a crash part-way through conversion leaves every row readable; resume finishes and matches the ORIGINAL fingerprint", async () => {
    const { db, name } = await populated();
    const original = await fingerprintLedger(db);
    await withBackup(db);
    const prepared = await prepareLedgerEncryption(db, PASS);
    const hook = hasFailureHook(db, "sales", 1);
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/simulated crash/);
    hook.restore(); expect(hook.fired()).toBe(true);
    // Mixed ledger: some tables sealed, some still plaintext, all readable.
    const mid = await scanRawLedger(db); expect(mid.sealed).toBeGreaterThan(0); expect(mid.plaintext).toBeGreaterThan(0);
    expect(diffFingerprints(original, await fingerprintLedger(db))).toEqual([]);
    // "Restart the tab": new connection comes up locked in migrating state.
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "migrating", locked: true });
    await expect(resumeLedgerEncryption(fresh, { passphrase: PASS2 })).rejects.toThrow(/Incorrect credential/);
    await resumeLedgerEncryption(fresh, { passphrase: PASS });
    expect(diffFingerprints(original, await fingerprintLedger(fresh))).toEqual([]);
    expect(await scanRawLedger(fresh)).toMatchObject({ plaintext: 0, unblinded: 0 });
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
  });

  it("a crash after the data is converted but before the state is recorded as encrypted is also resumable", async () => {
    const { db, name } = await populated();
    const original = await fingerprintLedger(db);
    await withBackup(db);
    const prepared = await prepareLedgerEncryption(db, PASS);
    // Fail the very last write: the keyring record update to 'encrypted'.
    const real = IDBObjectStore.prototype.put; let n = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...a: Parameters<typeof real>) {
      if (this.name === "keyrings" && ++n === 2) throw new Error("simulated crash before commit marker");
      return real.apply(this, a);
    });
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow();
    spy.mockRestore();
    expect((await scanRawLedger(db)).plaintext).toBe(0); // data fully converted...
    db.close(); const fresh = connect(name);
    expect((await prepareLedgerSecurity(fresh)).state).toBe("migrating"); // ...but the marker says unfinished
    await resumeLedgerEncryption(fresh, { passphrase: PASS });
    expect(diffFingerprints(original, await fingerprintLedger(fresh))).toEqual([]);
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
  });

  it("a conversion that silently ALTERS a row is detected, never committed, and leaves the ledger resumable", async () => {
    const { db, name } = await populated();
    await withBackup(db);
    const prepared = await prepareLedgerEncryption(db, PASS);
    const proto = Object.getPrototypeOf(db.table("sales")) as { bulkPut: (rows: Record<string, unknown>[], ...a: unknown[]) => Promise<unknown> };
    const original = proto.bulkPut;
    const spy = vi.spyOn(proto, "bulkPut").mockImplementation(function (this: { name: string }, rows: Record<string, unknown>[], ...args: unknown[]) {
      if (this.name === "sales") return original.call(this, rows.map(r => ({ ...r, totalMinor: (r.totalMinor as number) + 1 })), ...args);
      return original.call(this, rows, ...args);
    });
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/Verification failed for sales/);
    spy.mockRestore();
    db.close(); expect((await prepareLedgerSecurity(connect(name))).state).toBe("migrating"); // NOT marked encrypted
  });

  it("rolling back from an interrupted migration is checked against the ORIGINAL ledger, not the half-converted one", async () => {
    const { db, name } = await populated();
    const original = await fingerprintLedger(db);
    await withBackup(db);
    const prepared = await prepareLedgerEncryption(db, PASS);
    const hook = hasFailureHook(db, "sales", 1);
    await expect(beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/simulated crash/);
    hook.restore();
    db.close(); const fresh = connect(name); await prepareLedgerSecurity(fresh); await unlockLedger(fresh, { passphrase: PASS });
    await disableLedgerEncryption(fresh);
    expect(await scanRawLedger(fresh)).toMatchObject({ sealed: 0 });
    expect(diffFingerprints(original, await fingerprintLedger(fresh))).toEqual([]);
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("plaintext");
  });

  it("rollback to plaintext restores a readable, identical, unfenced ledger and removes the key record", async () => {
    const { db, name } = await populated();
    const original = await fingerprintLedger(db);
    await enable(db);
    await disableLedgerEncryption(db);
    expect(await scanRawLedger(db)).toMatchObject({ sealed: 0 });
    expect(diffFingerprints(original, await fingerprintLedger(db))).toEqual([]);
    expect(isSealFenced(db.name)).toBe(false);
    expect(await everythingRaw(db)).toContain("Kofi Mensah");
    const fresh = connect(name);
    expect((await prepareLedgerSecurity(fresh)).state).toBe("plaintext");
    await expect(fresh.sales.count()).resolves.toBe(2);
    // And it can be encrypted again.
    await enable(fresh, PASS2);
    expect((await scanRawLedger(fresh)).plaintext).toBe(0);
  });

  it("a crash during rollback is resumable and loses nothing", async () => {
    const { db, name } = await populated();
    const original = await fingerprintLedger(db);
    await enable(db);
    const hook = hasFailureHook(db, "sales", 1);
    await expect(disableLedgerEncryption(db)).rejects.toThrow(/simulated crash/);
    hook.restore();
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "decrypting", locked: true });
    await unlockLedger(fresh, { passphrase: PASS });
    expect(diffFingerprints(original, await fingerprintLedger(fresh))).toEqual([]);
    await disableLedgerEncryption(fresh);
    expect(await scanRawLedger(fresh)).toMatchObject({ sealed: 0 });
    expect(diffFingerprints(original, await fingerprintLedger(fresh))).toEqual([]);
  });
});

describe.skipIf(forced)("recovery and credential management", () => {
  it("changing the passphrase re-wraps the key only: rows are byte-identical, old passphrase stops working, recovery code still works", async () => {
    const { db, name } = await populated();
    const code = await enable(db);
    const rowsBefore = JSON.stringify(await raw(db, "sales"), (_k, v) => (v instanceof Uint8Array ? [...v] : v));
    await expect(changeLedgerPassphraseFor(db, PASS2, PASS2 + "x")).rejects.toThrow(/Incorrect credential/);
    await expect(changeLedgerPassphraseFor(db, PASS, "short")).rejects.toThrow(/12 to 1024/);
    await changeLedgerPassphraseFor(db, PASS, PASS2);
    expect(JSON.stringify(await raw(db, "sales"), (_k, v) => (v instanceof Uint8Array ? [...v] : v))).toBe(rowsBefore);
    const fresh = connect(name); await prepareLedgerSecurity(fresh);
    await expect(unlockLedger(fresh, { passphrase: PASS })).rejects.toThrow(/Incorrect credential/);
    await unlockLedger(fresh, { passphrase: PASS2 }); lockLedger(fresh);
    await unlockLedger(fresh, { recoveryCode: code });
    expect(await fresh.sales.count()).toBe(2);
  });

  it("forgot the passphrase: the recovery code sets a new one without any data change; the code keeps working", async () => {
    const { db, name } = await populated();
    const code = await enable(db);
    await expect(resetLedgerPassphraseFor(db, "A".repeat(43), PASS2)).rejects.toThrow(/Incorrect credential/);
    await resetLedgerPassphraseFor(db, code, PASS2);
    const fresh = connect(name); await prepareLedgerSecurity(fresh);
    await unlockLedger(fresh, { passphrase: PASS2 });
    expect((await fresh.customers.toArray()).length).toBe(1);
    lockLedger(fresh); await unlockLedger(fresh, { recoveryCode: code });
  });

  it("rotating the recovery code needs the passphrase and retires the old code in the current keyring", async () => {
    const { db, name } = await populated();
    const oldCode = await enable(db);
    await expect(rotateLedgerRecoveryCode(db, PASS2)).rejects.toThrow(/Incorrect credential/);
    const newCode = await rotateLedgerRecoveryCode(db, PASS);
    expect(newCode).not.toBe(oldCode); expect(newCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const fresh = connect(name); await prepareLedgerSecurity(fresh);
    await expect(unlockLedger(fresh, { recoveryCode: oldCode })).rejects.toThrow(/Incorrect credential/);
    await unlockLedger(fresh, { recoveryCode: newCode });
  });

  it("lost key record: the ledger reports 'orphaned', and the recovery package + a credential restore access", async () => {
    const { db, name } = await populated();
    const code = await enable(db);
    const pkg = await exportRecoveryPackage(db);
    expect(pkg).not.toContain(PASS); expect(pkg).not.toContain(code); // wrapped keys only
    db.close(); await new Dexie(KEYRING_DB_NAME).delete(); // the device lost its key record
    const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "orphaned", locked: true });
    await expect(fresh.customers.toArray()).rejects.toThrow(LedgerLockedError);
    await expect(importRecoveryPackage(fresh, "not json")).rejects.toThrow(/does not look like/);
    await expect(importRecoveryPackage(fresh, "x".repeat(30_000))).rejects.toThrow(/does not look like/);
    const foreign = JSON.parse(pkg); foreign.keyring.workspaceId = "someone-else";
    await expect(importRecoveryPackage(fresh, JSON.stringify(foreign))).rejects.toThrow(/different ledger/);
    await importRecoveryPackage(fresh, pkg);
    await expect(importRecoveryPackage(fresh, pkg)).rejects.toThrow(/already has encryption keys/);
    await unlockLedger(fresh, { recoveryCode: code });
    expect(await fresh.sales.count()).toBe(2);
    expect((await fresh.customers.toArray())[0].name).toBe("Kofi Mensah");
  });

  it("a package for a plaintext ledger, or a key that does not belong to this data, is refused", async () => {
    const a = await populated(); const codeA = await enable(a.db); const pkgA = await exportRecoveryPackage(a.db); void codeA;
    const b = await populated(); // different ledger, plaintext
    const rewritten = JSON.parse(pkgA); rewritten.keyring.workspaceId = b.name;
    await expect(importRecoveryPackage(b.db, JSON.stringify(rewritten))).rejects.toThrow(/not encrypted/);
  });

  it("with both credentials gone there is no backdoor: no default, no empty passphrase, no raw access", async () => {
    const { db, name } = await populated(); await enable(db);
    const fresh = connect(name); await prepareLedgerSecurity(fresh);
    for (const guess of ["", "password", "admin", "0".repeat(12), PASS.toUpperCase(), PASS + " "])
      await expect(unlockLedger(fresh, { passphrase: guess })).rejects.toThrow(/Incorrect credential|12 to 1024/);
    expect(fresh.ledgerSeal.unlocked).toBe(false);
    await expect(fresh.customers.toArray()).rejects.toThrow(LedgerLockedError);
    expect(await everythingRaw(fresh)).not.toContain("Kofi Mensah");
  });

  it("the independent recovery path works: a backup made from the unlocked encrypted ledger restores into a brand-new ledger", async () => {
    const { db, customer } = await populated(); await enable(db);
    const backup = parseBackup(JSON.stringify(await createBackup(db)));
    const target = connect(`st24-sec-restore-${crypto.randomUUID()}`); names.push(target.name); await initializeDatabase(target);
    await restoreBackup(backup, target);
    expect(await target.sales.count()).toBe(2);
    expect((await getCustomerDebtSummary(customer.id, "GHS", target)).outstandingMinor).toBe(3000);
    // ...and restoring INTO an already-encrypted ledger seals every restored row.
    const other = await populated(); await enable(other.db);
    await restoreBackup(backup, other.db);
    expect(await other.db.sales.count()).toBe(2);
    expect(await scanRawLedger(other.db)).toMatchObject({ plaintext: 0, unblinded: 0 });
  });
});

describe.skipIf(forced)("guards: schema pinning, two tabs, key races", () => {
  it("a different app schema refuses to open an encrypted ledger instead of building empty indexes over sealed rows", async () => {
    const { db, name } = await populated(); await enable(db); db.close();
    await new Promise<void>((resolve, reject) => {
      const o = indexedDB.open(KEYRING_DB_NAME, 1);
      o.onsuccess = () => { const tx = o.result.transaction("keyrings", "readwrite"); const s = tx.objectStore("keyrings"); const g = s.get(name);
        g.onsuccess = () => { s.put({ ...g.result, schemaVersion: 38 }); tx.oncomplete = () => { o.result.close(); resolve(); }; }; };
      o.onerror = () => reject(o.error);
    });
    const fresh = connect(name);
    const status = await prepareLedgerSecurity(fresh);
    expect(status.state).toBe("schema-mismatch"); expect(status.message).toMatch(/schema 38/);
    expect(fresh.isOpen()).toBe(false); // the guard must not have opened the database
  });

  it("two tabs: a stale plaintext-mode tab cannot write or read after sealing; a second tab that unlocks writes sealed rows", async () => {
    const { db, name } = await populated();
    const stale = connect(name); await stale.open(); // a tab that loaded before encryption
    await enable(db);
    await expect(stale.customers.add({ id: "evil", businessProfileId: "primary", name: "Evil", normalizedName: "evil", phone: "1", status: "active", createdAt: new Date(), updatedAt: "x" } as never)).rejects.toThrow(/encrypted in another tab/);
    await expect(stale.customers.toArray()).rejects.toThrow(LedgerLockedError);
    const second = connect(name); await prepareLedgerSecurity(second); await unlockLedger(second, { passphrase: PASS });
    const rice = (await second.products.toArray())[0];
    await Promise.all([
      completeSale({ lines: [{ productId: rice.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10", currency: "GHS", submissionKey: "tab-a-key-0001" }, db),
      completeSale({ lines: [{ productId: rice.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10", currency: "GHS", submissionKey: "tab-b-key-0001" }, second),
    ]);
    expect(await db.sales.count()).toBe(4); expect((await scanRawLedger(db)).plaintext).toBe(0);
    expect((await db.products.get(rice.id))!.stockQuantity).toBe(50 - 2 - 3 - 2);
  });

  it("two concurrent credential changes: exactly one wins, the other is told it changed elsewhere", async () => {
    const { db, name } = await populated(); await enable(db);
    const other = connect(name); await prepareLedgerSecurity(other);
    const results = await Promise.allSettled([changeLedgerPassphraseFor(db, PASS, PASS2), changeLedgerPassphraseFor(other, PASS, PASS2 + "-b")]);
    expect(results.filter(r => r.status === "fulfilled").length).toBe(1);
    const lost = results.find(r => r.status === "rejected") as PromiseRejectedResult;
    expect(String(lost.reason.message)).toMatch(/changed elsewhere|Incorrect credential/);
    const fresh = connect(name); await prepareLedgerSecurity(fresh);
    const winner = results[0].status === "fulfilled" ? PASS2 : PASS2 + "-b";
    await unlockLedger(fresh, { passphrase: winner });
  });

  it("a stale fence left behind when the keyring was wiped does not block a genuinely plaintext ledger", async () => {
    const { name } = await populated();
    setSealFence(name, true);
    const fresh = connect(name);
    expect((await prepareLedgerSecurity(fresh)).state).toBe("plaintext");
    expect(isSealFenced(name)).toBe(false);
    await expect(fresh.sales.count()).resolves.toBe(2);
  });

  it("every sealed row carries the marker and the raw store never shows the recovery code or passphrase", async () => {
    const { db } = await populated(); const code = await enable(db);
    const text = await everythingRaw(db);
    expect(text).not.toContain(PASS); expect(text).not.toContain(code);
    const rows = await raw(db, "sales"); expect(rows.every(r => r[SEAL_FIELD])).toBe(true);
    const keyringDb = await new Promise<string>((resolve, reject) => { const o = indexedDB.open(KEYRING_DB_NAME, 1); o.onsuccess = () => { const r = o.result.transaction("keyrings").objectStore("keyrings").getAll(); r.onsuccess = () => { o.result.close(); resolve(JSON.stringify(r.result)); }; }; o.onerror = () => reject(o.error); });
    expect(keyringDb).not.toContain(PASS); expect(keyringDb).not.toContain(code);
  });
});
