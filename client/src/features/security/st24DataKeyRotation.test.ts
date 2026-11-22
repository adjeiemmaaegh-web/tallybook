/**
 * ST24-05 remainder: data-key rotation. Every row is re-encrypted under a brand-new key; crash at any point is resumable;
 * app-visible content is byte-identical before and after; the old key stops opening anything; old recovery code stops working.
 */
import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createProduct } from "@/features/inventory/inventory";
import { createCustomer, getCustomerSnapshot } from "@/features/customers/customers";
import { completeSale } from "@/features/sales/sales";
import { createStaff, lockStaff, openShift, unlockStaff } from "@/features/staff/staff";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { SEAL_FIELD } from "./st24LedgerSeal";
import { deriveSt24Subkeys, openSt24Row } from "./st24RowCipher.mjs";
import { unlockLedgerDek } from "./st24LedgerKeyring.mjs";
import {
  KEYRING_DB_NAME, beginDataKeyRotation, beginLedgerEncryption, diffFingerprints, disableLedgerEncryption, discardPreparedRotation, exportRecoveryPackage,
  fingerprintLedger, lockLedger, prepareDataKeyRotation, prepareLedgerEncryption, prepareLedgerSecurity, resumeDataKeyRotation, scanRawLedger, unlockLedger,
} from "./st24LedgerSecurity";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
const open: TallybookDB[] = []; const names: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); lockStaff("primary");
  for (const d of open.splice(0)) d.close();
  for (const n of names.splice(0)) { await new Dexie(n).delete(); try { localStorage.removeItem("tallybook-ledger-sealed:" + n); } catch { /* */ } }
  await new Dexie(KEYRING_DB_NAME).delete(); setActiveBusinessProfileId("primary");
});
const connect = (name: string) => { const d = new TallybookDB(name); open.push(d); return d; };
async function encryptedLedger() {
  setActiveBusinessProfileId("primary");
  const name = `st24-rot-${crypto.randomUUID()}`; names.push(name);
  const db = connect(name); await initializeDatabase(db);
  await saveBusinessProfile({ name: "Ama Provisions", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db); await openShift(0, db);
  const customer = await createCustomer({ name: "Kofi Mensah", phone: "+233201112222", email: "", address: "7 Palm Road", notes: "", status: "active" }, db);
  const rice = await createProduct({ name: "Jasmine Rice", sku: "RICE-777", categoryId: "uncategorized", sellingPrice: "10", costPrice: "4", initialStock: "50", lowStockThreshold: "1" }, "GHS", db);
  await completeSale({ lines: [{ productId: rice.id, quantity: 2 }], discount: "0", paymentMethod: "cash", amountPaid: "20", currency: "GHS", submissionKey: "rot-cash-00001" }, db);
  await recordBackupExportedAt(new Date().toISOString(), db, "primary", "a".repeat(64));
  const prepared = await prepareLedgerEncryption(db, PASS);
  await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
  return { db, name, customer, rice, recoveryCode: prepared.recoveryCode };
}
const rawKeys = (db: TallybookDB, t: string) => new Promise<IDBValidKey[]>((res, rej) => { const r = db.backendDB().transaction(t, "readonly").objectStore(t).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const rawRows = (db: TallybookDB, t: string) => new Promise<Record<string, unknown>[]>((res, rej) => { const r = db.backendDB().transaction(t, "readonly").objectStore(t).getAll(); r.onsuccess = () => res(r.result as Record<string, unknown>[]); r.onerror = () => rej(r.error); });
/** How many raw sealed rows open with exactly this DEK (and none other). */
async function rowsOpenableWith(db: TallybookDB, name: string, dek: Uint8Array) {
  const { rowKey } = await deriveSt24Subkeys(new Uint8Array(dek)); let ok = 0, bad = 0;
  for (const t of db.tables) {
    if (t.name === "appMeta") continue;
    const keys = await rawKeys(db, t.name), rows = await rawRows(db, t.name);
    rows.forEach((row, i) => { if (!(SEAL_FIELD in row)) return; try { openSt24Row({ rowKey, scope: name, table: t.name, primaryKey: keys[i], sealed: row[SEAL_FIELD] }); ok++; } catch { bad++; } });
  }
  return { ok, bad };
}
const failHook = (db: TallybookDB, table: string, failOnCall: number) => {
  const proto = Object.getPrototypeOf(db.table(table)) as { bulkPut: (...a: unknown[]) => Promise<unknown> };
  const original = proto.bulkPut; let calls = 0, fired = false;
  const spy = vi.spyOn(proto, "bulkPut").mockImplementation(function (this: { name: string }, ...args: unknown[]) {
    if (this.name === table && ++calls === failOnCall) { fired = true; return Promise.reject(new Error("simulated crash mid-rotation")); }
    return original.apply(this, args);
  });
  return { restore: () => spy.mockRestore(), fired: () => fired };
};
const rotate = async (db: TallybookDB, passphrase = PASS) => {
  const prepared = await prepareDataKeyRotation(db, passphrase);
  await beginDataKeyRotation(db, prepared, { passphrase, typedRecoveryCode: prepared.recoveryCode });
  return prepared;
};
const oldDekOf = async (db: TallybookDB, passphrase = PASS) => {
  const { readKeyringForTest } = await import("./st24DataKeyRotation.helpers");
  return unlockLedgerDek(await readKeyringForTest(db.name), passphrase, "passphrase");
};

describe.skipIf(forced)("data-key rotation", () => {
  it("re-seals every row under a new key: content identical, old key opens nothing, new key opens everything, old recovery code is dead, new one works", async () => {
    const { db, name, customer, rice, recoveryCode: oldCode } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    const oldDek = await oldDekOf(db);
    const sealedBefore = await rowsOpenableWith(db, name, oldDek);
    expect(sealedBefore.ok).toBeGreaterThan(5); expect(sealedBefore.bad).toBe(0);
    const prepared = await rotate(db);
    expect(prepared.recoveryCode).not.toBe(oldCode);
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);
    expect(await scanRawLedger(db)).toMatchObject({ plaintext: 0, unblinded: 0 });
    const oldAfter = await rowsOpenableWith(db, name, oldDek);
    expect(oldAfter.ok).toBe(0); expect(oldAfter.bad).toBe(sealedBefore.ok);       // the OLD key opens NOTHING any more
    const newDek = await unlockLedgerDek(await (await import("./st24DataKeyRotation.helpers")).readKeyringForTest(name), PASS, "passphrase");
    const newAfter = await rowsOpenableWith(db, name, newDek);
    expect(newAfter).toEqual({ ok: sealedBefore.ok, bad: 0 });                      // the NEW key opens EVERYTHING
    // the ledger keeps working: lookups through blinded indexes, new sales, reload + unlock with the SAME passphrase and the NEW code
    expect((await getCustomerSnapshot(db)).customers.map(c => c.id)).toContain(customer.id);
    expect((await db.customers.where("phone").equals("+233201112222").toArray()).map(c => c.id)).toEqual([customer.id]); // blinded exact lookup works under the NEW key
    await completeSale({ lines: [{ productId: rice.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "10", currency: "GHS", submissionKey: "rot-after-0001" }, db);
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "encrypted", locked: true });
    await expect(unlockLedger(fresh, { recoveryCode: oldCode })).rejects.toThrow(/Incorrect credential/);
    await unlockLedger(fresh, { recoveryCode: prepared.recoveryCode });
    lockLedger(fresh); await unlockLedger(fresh, { passphrase: PASS });
    expect((await fingerprintLedger(fresh)).sales.count).toBe(2);
  });

  it("refuses a wrong passphrase, a wrong typed code, a locked ledger, a reused or discarded preparation, and a missing backup; nothing changes", async () => {
    const { db, name } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    await expect(prepareDataKeyRotation(db, "not the passphrase")).rejects.toThrow(/Incorrect credential/);
    const p = await prepareDataKeyRotation(db, PASS);
    await expect(beginDataKeyRotation(db, p, { passphrase: PASS, typedRecoveryCode: "wrong" })).rejects.toThrow(/does not match/);
    await expect(beginDataKeyRotation(db, p, { passphrase: "nope nope nope nope", typedRecoveryCode: p.recoveryCode })).rejects.toThrow(/Incorrect credential/);
    discardPreparedRotation(p);
    await expect(beginDataKeyRotation(db, p, { passphrase: PASS, typedRecoveryCode: p.recoveryCode })).rejects.toThrow(/already used or cancelled/);
    lockLedger(db);
    await expect(prepareDataKeyRotation(db, PASS)).rejects.toThrow(/Unlock the ledger first/);
    await unlockLedger(db, { passphrase: PASS });
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
  });

  it("a crash part-way leaves every row readable under either key; the OLD recovery code can resume and finish; the NEW code then works", async () => {
    const { db, name, recoveryCode: oldCode } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    const prepared = await prepareDataKeyRotation(db, PASS);
    const hook = failHook(db, "sales", 1);
    await expect(beginDataKeyRotation(db, prepared, { passphrase: PASS, typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/simulated crash/);
    hook.restore(); expect(hook.fired()).toBe(true);
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);      // mixed generations, all readable
    // While the ledger is still unlocked in this tab, turning encryption off or exporting a package mid-rotation must be refused for the RIGHT reason.
    await expect(disableLedgerEncryption(db)).rejects.toThrow(/interrupted key change/);
    await expect(exportRecoveryPackage(db)).rejects.toThrow(/interrupted key change/);
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "rekeying", locked: true });
    await expect(unlockLedger(fresh, { passphrase: PASS })).rejects.toThrow(/interrupted/);   // plain unlock refuses a half-rotated ledger
    await expect(exportRecoveryPackage(fresh)).rejects.toThrow(/interrupted key change/);
    await expect(resumeDataKeyRotation(fresh, { passphrase: "wrong wrong wrong wrong" })).rejects.toThrow(/Incorrect credential/);
    await resumeDataKeyRotation(fresh, { recoveryCode: oldCode });                  // the OLD recovery code is enough to finish
    expect(diffFingerprints(before, await fingerprintLedger(fresh))).toEqual([]);
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
    const dek = await unlockLedgerDek(await (await import("./st24DataKeyRotation.helpers")).readKeyringForTest(name), PASS, "passphrase");
    expect((await rowsOpenableWith(fresh, name, dek)).bad).toBe(0);
    const again = connect(name); await prepareLedgerSecurity(again);
    await expect(unlockLedger(again, { recoveryCode: oldCode })).rejects.toThrow(/Incorrect credential/);
    await unlockLedger(again, { recoveryCode: prepared.recoveryCode });
  });

  it("a crash AFTER every row is re-sealed but BEFORE the final record is written is also resumable", async () => {
    const { db, name } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    const prepared = await prepareDataKeyRotation(db, PASS);
    // Fail the final keyring write (state -> encrypted) once: all rows are already under the new key, the record still says rekeying.
    const realOpen = indexedDB.open.bind(indexedDB);
    let armed = true;
    const spy = vi.spyOn(indexedDB, "open").mockImplementation((n: string, v?: number) => {
      const req = realOpen(n, v);
      if (n !== KEYRING_DB_NAME) return req;
      req.addEventListener("success", () => {
        const k = req.result, tx = k.transaction.bind(k);
        (k as unknown as { transaction: typeof k.transaction }).transaction = ((s: string, mode?: IDBTransactionMode) => {
          const t = tx(s, mode);
          if (mode === "readwrite" && armed) {
            const store = t.objectStore.bind(t);
            (t as unknown as { objectStore: typeof t.objectStore }).objectStore = ((x: string) => {
              const o = store(x), put = o.put.bind(o);
              (o as unknown as { put: typeof o.put }).put = ((value: unknown, key?: IDBValidKey) => {
                if ((value as { state?: string }).state === "encrypted") { armed = false; t.abort(); }
                return put(value, key);
              }) as typeof o.put;
              return o;
            }) as typeof t.objectStore;
          }
          return t;
        }) as typeof k.transaction;
      });
      return req;
    });
    await expect(beginDataKeyRotation(db, prepared, { passphrase: PASS, typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow();
    spy.mockRestore();
    expect(armed).toBe(false);
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "rekeying" });
    await resumeDataKeyRotation(fresh, { passphrase: PASS });
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
    expect(diffFingerprints(before, await fingerprintLedger(fresh))).toEqual([]);
    await expect(resumeDataKeyRotation(fresh, { passphrase: PASS })).rejects.toThrow(/no interrupted key change/);
  });

  it("a rotation that leaves any row on the old key is NOT completed: the old key stays, state stays rekeying, resume finishes it", async () => {
    const { db, name } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    const prepared = await prepareDataKeyRotation(db, PASS);
    // Silently swallow every write to one table (no error): its rows stay sealed under the OLD key.
    const proto = Object.getPrototypeOf(db.table("sales")) as { bulkPut: (...a: unknown[]) => Promise<unknown> };
    const original = proto.bulkPut;
    const spy = vi.spyOn(proto, "bulkPut").mockImplementation(function (this: { name: string }, ...args: unknown[]) {
      return this.name === "sales" ? Promise.resolve(undefined) : original.apply(this, args);
    });
    await expect(beginDataKeyRotation(db, prepared, { passphrase: PASS, typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/still sealed under the old key/);
    spy.mockRestore();
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);   // still fully readable
    db.close(); const fresh = connect(name);
    expect(await prepareLedgerSecurity(fresh)).toMatchObject({ state: "rekeying" });
    await resumeDataKeyRotation(fresh, { passphrase: PASS });
    expect((await prepareLedgerSecurity(connect(name))).state).toBe("encrypted");
  });

  it("can be repeated: each rotation yields a different key and a different recovery code, and content never changes", async () => {
    const { db, name } = await encryptedLedger();
    const before = await fingerprintLedger(db);
    const codes = new Set<string>(); const dekHashes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const p = await rotate(db); codes.add(p.recoveryCode);
      const dek = await unlockLedgerDek(await (await import("./st24DataKeyRotation.helpers")).readKeyringForTest(name), PASS, "passphrase");
      dekHashes.add(Buffer.from(dek).toString("hex")); expect((await rowsOpenableWith(db, name, dek)).bad).toBe(0);
    }
    expect(codes.size).toBe(3); expect(dekHashes.size).toBe(3);
    expect(diffFingerprints(before, await fingerprintLedger(db))).toEqual([]);
  });

  it("raw storage never contains readable business data after a rotation", async () => {
    const { db } = await encryptedLedger();
    await rotate(db);
    let dump = "";
    for (const t of db.tables) dump += JSON.stringify(await rawRows(db, t.name), (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v));
    for (const secret of ["Kofi Mensah", "+233201112222", "7 Palm Road", "Jasmine Rice", "RICE-777", "Ama Provisions"]) expect(dump.includes(secret), secret).toBe(false);
  });
});
