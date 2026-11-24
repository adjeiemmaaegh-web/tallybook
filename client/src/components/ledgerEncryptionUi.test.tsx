/** ST24-05 UI: startup gate and owner wizard against the real singleton ledger (fake IndexedDB, synthetic data). */
import Dexie from "dexie";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { db, initializeDatabase } from "@/db/TallybookDB";
import { DatabaseProvider, useDatabase } from "@/contexts/DatabaseContext";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";
import { createCustomer } from "@/features/customers/customers";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { KEYRING_DB_NAME, beginLedgerEncryption, lockLedger, prepareLedgerEncryption, prepareLedgerSecurity, scanRawLedger } from "@/features/security/st24LedgerSecurity";
import { LedgerSecurityPanel } from "./LedgerSecurityPanel";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
function Probe() { const s = useDatabase(); return <p>APP {s.status}</p>; }

afterEach(async () => {
  lockStaff("primary"); lockLedger(db); db.ledgerSeal.setMode("plaintext"); db.close();
  await db.delete(); await new Dexie(KEYRING_DB_NAME).delete();
  try { localStorage.clear(); } catch { /* */ }
});
async function seed() {
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "UI Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db);
  await createCustomer({ name: "Ama Boateng", phone: "+233205559999", email: "", address: "", notes: "", status: "active" }, db);
  await recordBackupExportedAt(new Date().toISOString(), db, "primary", "c".repeat(64));
}

describe.skipIf(forced)("startup gate", () => {
  it("an encrypted ledger shows the unlock screen instead of the app; wrong passphrase is refused; the right one opens it", async () => {
    await seed();
    const prepared = await prepareLedgerEncryption(db, PASS);
    await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
    lockLedger(db); // as after a reload: keys are gone from memory
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    expect(await screen.findByRole("heading", { name: /Unlock Tallybook/i })).toBeTruthy();
    expect(screen.queryByText(/APP ready/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "wrong wrong wrong wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Incorrect credential/);
    expect(screen.queryByText(/APP ready/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("APP ready")).toBeTruthy();
    expect((await db.customers.toArray())[0].name).toBe("Ama Boateng");
  });
  it("the recovery code works from the 'I forgot my passphrase' path", async () => {
    await seed();
    const prepared = await prepareLedgerEncryption(db, PASS);
    await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
    lockLedger(db);
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    fireEvent.click(await screen.findByRole("button", { name: /forgot my passphrase/i }));
    fireEvent.change(screen.getByLabelText("Recovery code"), { target: { value: prepared.recoveryCode } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect(await screen.findByText("APP ready")).toBeTruthy();
  });
  it("a plaintext ledger starts exactly as before: no gate", async () => {
    await seed();
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    expect(await screen.findByText("APP ready")).toBeTruthy();
    expect(await prepareLedgerSecurity(db)).toMatchObject({ state: "plaintext" });
  });
  const setRecordSchema = (v: number) => new Promise<void>((resolve, reject) => { const o = indexedDB.open(KEYRING_DB_NAME, 1); o.onsuccess = () => { const tx = o.result.transaction("keyrings", "readwrite"); const s = tx.objectStore("keyrings");
      const g = s.get(db.name); g.onsuccess = () => { s.put({ ...g.result, schemaVersion: v }); tx.oncomplete = () => { o.result.close(); resolve(); }; }; }; o.onerror = () => reject(o.error); });
  it("a ledger from a NEWER version refuses to open and says why", async () => {
    await seed();
    const prepared = await prepareLedgerEncryption(db, PASS);
    await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
    lockLedger(db); await setRecordSchema(9999);
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getAllByText(/newer version/i).length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Passphrase")).toBeNull();
  });
  it("a ledger from an OLDER version offers the one-time update, then opens the app", async () => {
    await seed();
    const prepared = await prepareLedgerEncryption(db, PASS);
    await beginLedgerEncryption(db, prepared, { typedRecoveryCode: prepared.recoveryCode });
    lockLedger(db); db.close(); await setRecordSchema(1);
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    expect(await screen.findByRole("heading", { name: /Update your encrypted records/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /Update and unlock/i }));
    expect(await screen.findByText("APP ready", {}, { timeout: 5000 })).toBeTruthy();
    expect(await prepareLedgerSecurity(db)).toMatchObject({ state: "encrypted" });
  });
});

describe.skipIf(forced)("owner wizard", () => {
  it("walks passphrase -> recovery code (typed back) -> backup confirmation -> encrypted, and refuses a wrong typed code", async () => {
    await seed();
    render(<LedgerSecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on encryption" }));
    fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: PASS } });
    fireEvent.change(screen.getByLabelText("Repeat passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const code = (await screen.findByTestId("recovery-code")).textContent!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(true); // must tick "saved"
    fireEvent.click(screen.getByLabelText(/saved my recovery code/i));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const submit = await screen.findByRole("button", { name: "Encrypt my records" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/exported an encrypted backup/i));
    fireEvent.change(screen.getByLabelText("Type your recovery code"), { target: { value: "x".repeat(43) } });
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toMatch(/does not match/i);
    expect((await scanRawLedger(db)).sealed).toBe(0); // nothing started
    fireEvent.change(screen.getByLabelText("Type your recovery code"), { target: { value: code } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Encrypt my records" })); });
    await waitFor(() => expect(screen.getByText(/Encryption is on/)).toBeTruthy(), { timeout: 15000 });
    expect(await scanRawLedger(db)).toMatchObject({ plaintext: 0 });
    expect(JSON.stringify(await Promise.all(db.tables.map(t => new Promise(r => { const q = db.backendDB().transaction(t.name).objectStore(t.name).getAll(); q.onsuccess = () => r(q.result); }))))).not.toContain("Ama Boateng");
  }, 30000);
  it("without a verified backup the wizard's final step fails safely and changes nothing", async () => {
    await initializeDatabase(db);
    await saveBusinessProfile({ name: "No Backup Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
    render(<LedgerSecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Turn on encryption" }));
    fireEvent.change(screen.getByLabelText("New passphrase"), { target: { value: PASS } });
    fireEvent.change(screen.getByLabelText("Repeat passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    const code = (await screen.findByTestId("recovery-code")).textContent!;
    fireEvent.click(screen.getByLabelText(/saved my recovery code/i)); fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(await screen.findByLabelText(/exported an encrypted backup/i));
    fireEvent.change(screen.getByLabelText("Type your recovery code"), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Encrypt my records" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/verify an encrypted backup/i);
    expect((await scanRawLedger(db)).sealed).toBe(0);
  });
});
