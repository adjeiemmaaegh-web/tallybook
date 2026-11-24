/** ST24-05 remainder UI: idle auto-lock through the real startup gate, interrupted key change gate, and the rotation wizard. */
import Dexie from "dexie";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, initializeDatabase } from "@/db/TallybookDB";
import { DatabaseProvider, useDatabase } from "@/contexts/DatabaseContext";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, lockStaff, unlockStaff, currentStaffId } from "@/features/staff/staff";
import { createCustomer } from "@/features/customers/customers";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { saveAutoLockMinutes } from "@/features/security/ledgerAutoLock";
import { KEYRING_DB_NAME, beginDataKeyRotation, beginLedgerEncryption, lockLedger, prepareDataKeyRotation, prepareLedgerEncryption, prepareLedgerSecurity, scanRawLedger } from "@/features/security/st24LedgerSecurity";
import { LedgerSecurityPanel } from "./LedgerSecurityPanel";
import { LedgerAutoLock } from "./LedgerAutoLock";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
function Probe() { const s = useDatabase(); return <p>APP {s.status}</p>; }
afterEach(async () => {
  vi.useRealTimers(); lockStaff("primary"); lockLedger(db); db.ledgerSeal.setMode("plaintext"); db.close();
  await db.delete(); await new Dexie(KEYRING_DB_NAME).delete(); try { localStorage.clear(); } catch { /* */ }
});
async function seed() {
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "UI Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db);
  await createCustomer({ name: "Ama Boateng", phone: "+233205559999", email: "", address: "", notes: "", status: "active" }, db);
  await recordBackupExportedAt(new Date().toISOString(), db, "primary", "c".repeat(64));
}
async function encrypt() { const p = await prepareLedgerEncryption(db, PASS); await beginLedgerEncryption(db, p, { typedRecoveryCode: p.recoveryCode }); }

describe("LedgerAutoLock component", () => {
  it("calls onIdle after the period, postponed by activity; does nothing when off (0)", () => {
    vi.useFakeTimers(); const onIdle = vi.fn();
    const { rerender } = render(<LedgerAutoLock minutes={1} onIdle={onIdle} />);
    act(() => { vi.advanceTimersByTime(50_000); }); fireEvent.keyDown(window); act(() => { vi.advanceTimersByTime(50_000); }); expect(onIdle).not.toHaveBeenCalled();
    fireEvent.pointerDown(window); act(() => { vi.advanceTimersByTime(59_000); }); expect(onIdle).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(2_000); }); expect(onIdle).toHaveBeenCalledTimes(1);
    const off = vi.fn(); rerender(<LedgerAutoLock minutes={0} onIdle={off} />); act(() => { vi.advanceTimersByTime(3_600_000); }); expect(off).not.toHaveBeenCalled();
  });
  it("removes its listeners and timer on unmount", () => {
    vi.useFakeTimers(); const onIdle = vi.fn(); const { unmount } = render(<LedgerAutoLock minutes={1} onIdle={onIdle} />); unmount();
    act(() => { vi.advanceTimersByTime(3_600_000); }); expect(onIdle).not.toHaveBeenCalled();
  });
});

describe.skipIf(forced)("real gate: idle lock", () => {
  it("an unlocked encrypted ledger locks itself after the idle time: unlock screen, keys gone, staff session cleared, rows still sealed; unlock returns to the app", async () => {
    await seed(); await encrypt(); saveAutoLockMinutes(db.name, 1);
    expect(db.ledgerSeal.unlocked).toBe(true);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    await waitFor(() => expect(screen.getByText(/APP ready/)).toBeTruthy(), { timeout: 5000 });
    expect(currentStaffId("primary")).not.toBeNull();
    // The idle watcher mounts one render after "ready"; keep the clock moving in minute steps until it has fired.
    for (let i = 0; i < 6 && db.ledgerSeal.unlocked; i++) await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    await waitFor(() => expect(screen.getByRole("heading", { name: /Unlock Tallybook/i })).toBeTruthy(), { timeout: 5000 });
    expect(db.ledgerSeal.unlocked).toBe(false); expect(currentStaffId("primary")).toBeNull();
    expect(screen.queryByText(/APP ready/)).toBeNull();
    expect(await scanRawLedger(db)).toMatchObject({ plaintext: 0 });
    vi.useRealTimers();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /^Unlock/ }));
    await waitFor(() => expect(screen.getByText(/APP ready/)).toBeTruthy());
  });
  it("does NOT lock while the user keeps interacting, and 'Never' disables it", async () => {
    await seed(); await encrypt(); saveAutoLockMinutes(db.name, 1);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    await waitFor(() => expect(screen.getByText(/APP ready/)).toBeTruthy());
    for (let i = 0; i < 4; i++) { await act(async () => { await vi.advanceTimersByTimeAsync(40_000); }); fireEvent.pointerDown(window); }
    expect(screen.getByText(/APP ready/)).toBeTruthy(); expect(db.ledgerSeal.unlocked).toBe(true);
  });
  it("a plaintext ledger never auto-locks", async () => {
    await seed(); vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    await waitFor(() => expect(screen.getByText(/APP ready/)).toBeTruthy());
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * 3_600_000); });
    expect(screen.getByText(/APP ready/)).toBeTruthy();
  });
});

describe.skipIf(forced)("interrupted key change gate", () => {
  it("shows 'Finish changing the encryption key', refuses a wrong passphrase, and the right one completes it and opens the app", async () => {
    await seed(); await encrypt();
    const prepared = await prepareDataKeyRotation(db, PASS);
    const proto = Object.getPrototypeOf(db.table("sales")) as { bulkPut: (...a: unknown[]) => Promise<unknown> };
    const original = proto.bulkPut;
    await createCustomerForSales();
    const spy = vi.spyOn(proto, "bulkPut").mockImplementation(function (this: { name: string }, ...args: unknown[]) { return this.name === "customers" ? Promise.reject(new Error("simulated crash")) : original.apply(this, args); });
    await expect(beginDataKeyRotation(db, prepared, { passphrase: PASS, typedRecoveryCode: prepared.recoveryCode })).rejects.toThrow(/simulated crash/);
    spy.mockRestore(); lockLedger(db);
    render(<DatabaseProvider><Probe /></DatabaseProvider>);
    expect(await screen.findByRole("heading", { name: /Finish changing the encryption key/i })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: "wrong wrong wrong wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /Finish|Unlock|Continue/i }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.queryByText(/APP ready/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /Finish|Unlock|Continue/i }));
    await waitFor(() => expect(screen.getByText(/APP ready/)).toBeTruthy());
    expect((await prepareLedgerSecurity(db)).state).toBe("encrypted");
  });
});
async function createCustomerForSales() { /* data already seeded; the customers table is rewritten during rotation */ }

describe.skipIf(forced)("rotation wizard", () => {
  it("shows the NEW recovery code once, needs it typed back, then re-encrypts everything", async () => {
    await seed(); await encrypt();
    const before = await scanRawLedger(db);
    render(<LedgerSecurityPanel />);
    fireEvent.change(await screen.findByLabelText("Current passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /Start key change/i }));
    const code = (await screen.findByTestId("rotation-recovery-code")).textContent!;
    const go = screen.getByRole("button", { name: /Re-encrypt everything now/i }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/I saved the new recovery code/i));
    fireEvent.change(screen.getByLabelText("Type the new recovery code"), { target: { value: code.slice(0, -1) + "x" } });
    expect(go.disabled).toBe(true);                     // a mistyped code can never start it
    fireEvent.change(screen.getByLabelText("Type the new recovery code"), { target: { value: code } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    expect(await screen.findByText(/Every record is now encrypted under a new key/i)).toBeTruthy();
    const after = await scanRawLedger(db);
    expect(after).toMatchObject({ plaintext: 0, unblinded: 0 }); expect(after.sealed).toBe(before.sealed);
  });
  it("a wrong passphrase is refused before anything is shown or changed; cancel discards the preparation", async () => {
    await seed(); await encrypt();
    render(<LedgerSecurityPanel />);
    fireEvent.change(await screen.findByLabelText("Current passphrase"), { target: { value: "not the passphrase 1" } });
    fireEvent.click(screen.getByRole("button", { name: /Start key change/i }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.queryByTestId("rotation-recovery-code")).toBeNull();
    fireEvent.change(screen.getByLabelText("Current passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /Start key change/i }));
    await screen.findByTestId("rotation-recovery-code");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("rotation-recovery-code")).toBeNull();
    expect((await prepareLedgerSecurity(db)).state).toBe("encrypted");
  });
  it("the auto-lock choice is saved per device and explained", async () => {
    await seed(); await encrypt();
    render(<LedgerSecurityPanel />);
    const select = await screen.findByLabelText("Lock automatically") as HTMLSelectElement;
    expect(select.value).toBe("15");
    fireEvent.change(select, { target: { value: "5" } });
    expect(await screen.findByText(/lock after 5 minutes/i)).toBeTruthy();
    expect(localStorage.getItem("tallybook-ledger-autolock:" + db.name)).toBe("5");
    fireEvent.change(select, { target: { value: "0" } });
    expect(await screen.findByText(/Automatic locking is off/i)).toBeTruthy();
  });
});
