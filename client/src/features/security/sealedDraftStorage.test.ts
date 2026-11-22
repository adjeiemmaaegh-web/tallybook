import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TallybookDB, db as singleton, initializeDatabase } from "@/db/TallybookDB";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { loadParkedCart, saveParkedCart, clearParkedCart } from "@/features/sales/parkedCart";
import { getPendingCheckoutStatus, savePendingCheckout } from "@/features/sales/pendingCheckout";
import { LedgerIntegrityError, LedgerLockedError, LedgerSeal } from "./st24LedgerSeal";
import { createDraftStore } from "./sealedDraftStorage";
import { KEYRING_DB_NAME, beginDataKeyRotation, beginLedgerEncryption, disableLedgerEncryption, prepareDataKeyRotation, prepareLedgerEncryption } from "./st24LedgerSecurity";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
const keys = () => ({ rowKey: crypto.getRandomValues(new Uint8Array(32)), blindKey: crypto.getRandomValues(new Uint8Array(32)) });
const KEY = "ws:tallybook:parked-cart:v1:co1";
beforeEach(() => localStorage.clear());
afterEach(() => { localStorage.clear(); singleton.ledgerSeal.lock(); singleton.ledgerSeal.setMode("plaintext"); });

describe("draft store", () => {
  it("plaintext ledger: stored exactly as before", () => {
    const seal = new LedgerSeal("s"); seal.setMode("plaintext"); const d = createDraftStore(() => seal);
    d.write(KEY, '{"a":1}'); expect(localStorage.getItem(KEY)).toBe('{"a":1}'); expect(d.read(KEY)).toBe('{"a":1}'); d.remove(KEY); expect(d.read(KEY)).toBeNull();
  });
  it("encrypted + unlocked: nothing readable at rest, round-trips, and a draft cannot be moved to another key or tampered with", () => {
    const seal = new LedgerSeal("s"); seal.unlock(keys()); seal.setMode("encrypted"); const d = createDraftStore(() => seal);
    d.write(KEY, JSON.stringify({ customer: "Kofi Mensah", amount: 123456 }));
    const raw = localStorage.getItem(KEY)!; expect(raw.startsWith("tb-sealed:v1:")).toBe(true);
    for (const secret of ["Kofi", "123456", "customer", "amount"]) expect(raw.includes(secret), secret).toBe(false);
    expect(JSON.parse(d.read(KEY)!)).toEqual({ customer: "Kofi Mensah", amount: 123456 });
    const OTHER = "ws:tallybook:parked-cart:v1:co2"; localStorage.setItem(OTHER, raw);
    expect(() => d.read(OTHER)).toThrow(LedgerIntegrityError);                       // moved to another key: refused
    const body = JSON.parse(raw.slice("tb-sealed:v1:".length)); body.c = body.c.slice(0, -4) + "AAAA";
    localStorage.setItem(KEY, "tb-sealed:v1:" + JSON.stringify(body)); expect(() => d.read(KEY)).toThrow(LedgerIntegrityError);
    localStorage.setItem(KEY, "tb-sealed:v1:not json"); expect(() => d.read(KEY)).toThrow(LedgerIntegrityError);
  });
  it("encrypted + locked: sealed drafts are unreadable (throws, never 'empty'), writes are refused, removal still works", () => {
    const seal = new LedgerSeal("s"); seal.unlock(keys()); seal.setMode("encrypted"); const d = createDraftStore(() => seal);
    d.write(KEY, "secret"); seal.lock();
    expect(() => d.read(KEY)).toThrow(LedgerLockedError); expect(() => d.write(KEY, "x")).toThrow(LedgerLockedError);
    d.remove(KEY); expect(localStorage.getItem(KEY)).toBeNull();
  });
  it("sealAll / unsealAll / resealAll convert only drafts, and only in the right direction", () => {
    const seal = new LedgerSeal("s"); seal.unlock(keys()); const d = createDraftStore(() => seal);
    localStorage.setItem(KEY, "one"); localStorage.setItem("ws:tallybook:pending-checkout:v1:co1", "two"); localStorage.setItem("theme", "dark");
    seal.setMode("encrypted");
    expect(d.sealAll()).toBe(2); expect(localStorage.getItem("theme")).toBe("dark"); expect(d.sealAll()).toBe(0);
    expect(d.read(KEY)).toBe("one");
    const oldKeys = keys(); const before = localStorage.getItem(KEY);
    seal.unlockForRotation(keys(), { rowKey: oldKeys.rowKey, blindKey: oldKeys.blindKey });
    expect(() => d.read(KEY)).toThrow();                                           // sealed under a key neither generation holds
    seal.lock(); seal.unlock(keys()); localStorage.setItem(KEY, before!);
    expect(() => d.read(KEY)).toThrow();                                           // a different key cannot open it
  });
});

describe("parked cart and pending checkout use it", () => {
  it("encrypted ledger: nothing readable in localStorage; locked ledger reports unavailable instead of empty and never overwrites a sealed draft", () => {
    singleton.ledgerSeal.unlock(keys()); singleton.ledgerSeal.setMode("encrypted");
    saveParkedCart("co1", [{ productId: "p-rice", quantity: 3 }]);
    savePendingCheckout("co1", { lines: [{ productId: "p-rice", quantity: 3 }], customerId: "cust-kofi", discount: "0", paymentMethod: "cash", amountPaid: "30", currency: "GHS", submissionKey: "pending-key-0001" } as never);
    let dump = ""; for (let i = 0; i < localStorage.length; i++) dump += localStorage.key(i) + "=" + localStorage.getItem(localStorage.key(i)!);
    for (const secret of ["p-rice", "cust-kofi", "pending-key-0001"]) expect(dump.includes(secret), secret).toBe(false);
    expect(loadParkedCart("co1")?.lines).toEqual([{ productId: "p-rice", quantity: 3 }]);
    expect(getPendingCheckoutStatus("co1").state).toBe("pending");
    singleton.ledgerSeal.lock();
    expect(loadParkedCart("co1")).toBeNull();
    expect(getPendingCheckoutStatus("co1").state).toBe("unavailable");               // NOT "empty": a crashed sale is never silently forgotten
    expect(() => saveParkedCart("co1", [{ productId: "p2", quantity: 1 }])).toThrow();
    singleton.ledgerSeal.unlock(keys());                                              // wrong key: still not readable, not overwritten
    expect(loadParkedCart("co1")).toBeNull();
  });
  it("plaintext ledger: exactly the old behaviour", () => {
    saveParkedCart("co1", [{ productId: "p1", quantity: 1 }]);
    expect(JSON.parse(localStorage.getItem([...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).find(k => k.includes("parked-cart"))!)!).lines).toEqual([{ productId: "p1", quantity: 1 }]);
    expect(loadParkedCart("co1")?.lines.length).toBe(1); clearParkedCart("co1"); expect(loadParkedCart("co1")).toBeNull();
  });
});

describe.skipIf(forced)("lifecycle on a real ledger", () => {
  const open: TallybookDB[] = []; const names: string[] = [];
  afterEach(async () => { lockStaff("primary"); for (const d of open.splice(0)) d.close(); for (const n of names.splice(0)) { await new Dexie(n).delete(); try { localStorage.removeItem("tallybook-ledger-sealed:" + n); } catch { /* */ } } await new Dexie(KEYRING_DB_NAME).delete(); setActiveBusinessProfileId("primary"); });
  it("enable seals existing drafts, key rotation keeps them readable under the new key only, disable restores plaintext", async () => {
    setActiveBusinessProfileId("primary");
    const name = `st24-draft-${crypto.randomUUID()}`; names.push(name);
    const db = new TallybookDB(name); open.push(db); await initializeDatabase(db);
    await saveBusinessProfile({ name: "Draft Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
    const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db);
    await recordBackupExportedAt(new Date().toISOString(), db, "primary", "a".repeat(64));
    localStorage.setItem("ws:tallybook:parked-cart:v1:primary", JSON.stringify({ version: 1, parkedAt: "2026-01-01T00:00:00.000Z", lines: [{ productId: "p-secret-rice", quantity: 2 }] }));
    const store = createDraftStore(() => db.ledgerSeal);
    const p = await prepareLedgerEncryption(db, PASS); await beginLedgerEncryption(db, p, { typedRecoveryCode: p.recoveryCode });
    expect(localStorage.getItem("ws:tallybook:parked-cart:v1:primary")!.includes("p-secret-rice")).toBe(false);
    expect(store.read("ws:tallybook:parked-cart:v1:primary")).toContain("p-secret-rice");
    const sealedBefore = localStorage.getItem("ws:tallybook:parked-cart:v1:primary");
    const rot = await prepareDataKeyRotation(db, PASS); await beginDataKeyRotation(db, rot, { passphrase: PASS, typedRecoveryCode: rot.recoveryCode });
    const sealedAfter = localStorage.getItem("ws:tallybook:parked-cart:v1:primary");
    expect(sealedAfter).not.toBe(sealedBefore);                                      // re-sealed under the NEW key
    expect(store.read("ws:tallybook:parked-cart:v1:primary")).toContain("p-secret-rice");
    await disableLedgerEncryption(db);
    expect(JSON.parse(localStorage.getItem("ws:tallybook:parked-cart:v1:primary")!).lines[0].productId).toBe("p-secret-rice");
  });
});
