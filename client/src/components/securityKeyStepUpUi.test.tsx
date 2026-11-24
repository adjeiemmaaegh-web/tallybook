/** Security-key step-up wired into the real encryption panel on a real encrypted ledger (no physical key: jsdom has no WebAuthn, which is exactly the "key unavailable" case). */
import Dexie from "dexie";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { createStaff, lockStaff, unlockStaff } from "@/features/staff/staff";
import { createCustomer } from "@/features/customers/customers";
import { recordBackupExportedAt } from "@/features/backup/backup";
import { KEYRING_DB_NAME, beginLedgerEncryption, lockLedger, prepareLedgerEncryption, prepareLedgerSecurity, scanRawLedger } from "@/features/security/st24LedgerSecurity";
import { loadStepUpState, saveStepUpState } from "@/features/security/webauthnClient";
import { getActiveBusinessProfileId } from "@/features/business/activeCompany";
import { LedgerSecurityPanel } from "./LedgerSecurityPanel";
import { SecurityKeysPanel } from "./SecurityKeysPanel";

const forced = process.env.TALLYBOOK_ENCRYPTED_TESTS === "1" || process.env.TALLYBOOK_ENCRYPTED_TESTS === "2";
const PASS = "correct horse battery staple";
afterEach(async () => {
  vi.restoreAllMocks(); lockStaff("primary"); lockLedger(db); db.ledgerSeal.setMode("plaintext"); db.close();
  await db.delete(); await new Dexie(KEYRING_DB_NAME).delete(); try { localStorage.clear(); } catch { /* */ }
});
async function seedEncrypted() {
  await initializeDatabase(db);
  await saveBusinessProfile({ name: "Key Shop", country: "Ghana", currency: "GHS", businessType: "Retail" }, db);
  const owner = await createStaff("Owner", "owner", "123456", db); await unlockStaff(owner.id, "123456", db);
  await createCustomer({ name: "Ama Boateng", phone: "+233205559999", email: "", address: "", notes: "", status: "active" }, db);
  await recordBackupExportedAt(new Date().toISOString(), db, "primary", "c".repeat(64));
  const p = await prepareLedgerEncryption(db, PASS); await beginLedgerEncryption(db, p, { typedRecoveryCode: p.recoveryCode });
  return p.recoveryCode;
}
const requireKey = () => saveStepUpState(getActiveBusinessProfileId(), { credentials: [{ credentialId: "k1", publicKeyJwk: {} as JsonWebKey, signCount: 0 }], requireForSensitive: true, recoveryCodeConfigured: true, passphraseConfigured: true });

describe.skipIf(forced)("security-key step-up in the encryption panel", () => {
  it("no key required: turning encryption off works exactly as before", async () => {
    await seedEncrypted(); vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LedgerSecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Turn encryption off/i }));
    expect(await screen.findByText(/Encryption is off/i)).toBeTruthy();
  });
  it("key required and unavailable: encryption stays on; the recovery code is offered; a wrong code is refused; the right code allows it", async () => {
    const code = await seedEncrypted(); requireKey(); vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<LedgerSecurityPanel />);
    fireEvent.click(await screen.findByRole("button", { name: /Turn encryption off/i }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(await screen.findByLabelText("Recovery code for security-key step-up")).toBeTruthy();
    expect((await prepareLedgerSecurity(db)).state).toBe("encrypted"); expect(await scanRawLedger(db)).toMatchObject({ plaintext: 0 });
    fireEvent.change(screen.getByLabelText("Recovery code for security-key step-up"), { target: { value: "WRONG-CODE" } });
    fireEvent.click(screen.getByRole("button", { name: /Turn encryption off/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/not correct/i));
    expect((await prepareLedgerSecurity(db)).state).toBe("encrypted");
    fireEvent.change(screen.getByLabelText("Recovery code for security-key step-up"), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: /Turn encryption off/i }));
    expect(await screen.findByText(/Encryption is off/i)).toBeTruthy();
  });
  it("key required: starting a key change is refused without proof and nothing is prepared", async () => {
    await seedEncrypted(); requireKey();
    render(<LedgerSecurityPanel />);
    fireEvent.change(await screen.findByLabelText("Current passphrase"), { target: { value: PASS } });
    fireEvent.click(screen.getByRole("button", { name: /Start key change/i }));
    expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.queryByTestId("rotation-recovery-code")).toBeNull();
  });
  it("security keys panel: cannot require a key with one key and no recovery code; the checkbox is disabled with the reason", () => {
    saveStepUpState("b1", { credentials: [{ credentialId: "k", publicKeyJwk: {} as JsonWebKey, signCount: 0 }], requireForSensitive: false, recoveryCodeConfigured: false, passphraseConfigured: true });
    render(<SecurityKeysPanel businessId="b1" ownerName="Owner" recoveryCodeConfigured={false} />);
    const box = screen.getByRole("checkbox") as HTMLInputElement; expect(box.disabled).toBe(true);
    expect(screen.getByText(/second key or confirm your recovery code/i)).toBeTruthy();
  });
  it("security keys panel: removing the last key switches the requirement off and says so; storage stays consistent", async () => {
    saveStepUpState("b2", { credentials: [{ credentialId: "k", publicKeyJwk: {} as JsonWebKey, signCount: 0, label: "Blue key" }], requireForSensitive: true, recoveryCodeConfigured: true, passphraseConfigured: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SecurityKeysPanel businessId="b2" ownerName="Owner" />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(await screen.findByText(/switched off/i)).toBeTruthy();
    expect(loadStepUpState("b2")).toMatchObject({ credentials: [], requireForSensitive: false });
    expect(screen.getByText(/No security key added/i)).toBeTruthy();
  });
});
