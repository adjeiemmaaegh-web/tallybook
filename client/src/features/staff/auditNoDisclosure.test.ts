// S6-05: every staff mutation is attributed (company, actor, time) and the audit trail never discloses a credential.
import Dexie from "dexie";
import {webcrypto} from "node:crypto";
import {afterEach, describe, expect, it} from "vitest";
import {TallybookDB, initializeDatabase} from "@/db/TallybookDB";
import {saveBusinessProfile} from "@/features/business/businessProfile";
import {setActiveBusinessProfileId} from "@/features/business/activeCompany";
import {createStaff, unlockStaff, lockStaff, openShift, closeShift, changeStaffRole, changeStaffStatus, setStaffPermissions, resetStaffPin, approveCheckoutDiscount} from "./staff";

if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, "crypto", {configurable: true, value: webcrypto});
const dbs: TallybookDB[] = []; let n = 0;
afterEach(async () => { lockStaff("primary"); for (const d of dbs.splice(0)) { const name = d.name; d.close(); await new Dexie(name).delete(); } setActiveBusinessProfileId("primary"); });

const PINS = ["123456", "222222", "333333", "444444", "555555"];

describe("staff audit trail", () => {
  it("attributes every mutation to a real actor in this company, in time order, and never contains a PIN, hash or salt", async () => {
    setActiveBusinessProfileId("primary");
    const d = new TallybookDB(`audit-nodisclose-${Date.now()}-${++n}`); dbs.push(d);
    await initializeDatabase(d);
    await saveBusinessProfile({name: "Audit Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: ""}, d);
    const owner = await createStaff("Owner", "owner", "123456", d);
    await unlockStaff(owner.id, "123456", d);
    const supervisor = await createStaff("Supervisor", "supervisor", "222222", d);
    const cashier = await createStaff("Cashier", "cashier", "333333", d);
    await resetStaffPin(cashier.id, "444444", d);
    await changeStaffRole(cashier.id, "supervisor", d);
    await changeStaffRole(cashier.id, "cashier", d);
    await setStaffPermissions(cashier.id, ["sell"], d);
    await changeStaffStatus(supervisor.id, true, d);
    await changeStaffStatus(supervisor.id, false, d);
    lockStaff("primary"); await unlockStaff(cashier.id, "444444", d);
    const shift = await openShift(100, d);
    await closeShift(shift.id, 100, d);
    // A supervisor approval attempt (needs the cashier's open shift) also leaves an attributed, secret-free trace.
    const shift2 = await openShift(0, d);
    await approveCheckoutDiscount(supervisor.id, "222222", "audit-approval-key-001", 100, 1000, d);
    await closeShift(shift2.id, 0, d);

    const audits = await d.staffAudits.toArray();
    const members = await d.staffMembers.toArray();
    const memberIds = new Set(members.map(m => m.id));
    expect(audits.length).toBeGreaterThanOrEqual(10);
    const secrets = [...PINS, ...members.flatMap(m => [m.pinHash, m.salt]).filter((x): x is string => typeof x === "string" && x.length >= 16)];
    for (const a of audits) {
      expect(a.businessProfileId, a.action).toBe("primary");
      expect(memberIds.has(a.staffId), `${a.action} must name a real staff member`).toBe(true);
      expect(Number.isFinite(Date.parse(a.createdAt)), a.action).toBe(true);
      expect(typeof a.details).toBe("string");
      for (const secret of secrets) expect(`${a.action} ${a.details}`.includes(secret), `${a.action} leaked a credential`).toBe(false);
      expect(/\bpin\b\s*[:=]\s*\S+/i.test(a.details), `${a.action} must not print a PIN value`).toBe(false);
    }
    const actions = new Set(audits.map(a => a.action));
    for (const expected of ["staff.created", "staff.pin.reset", "staff.role.changed", "staff.permissions.changed", "shift.opened", "shift.closed", "discount.supervisor.approved"])
      expect(actions.has(expected), `missing audit for ${expected}`).toBe(true);
    // Stored credentials are not recoverable from any audit-visible field and are never the PIN itself.
    for (const m of members) { expect(PINS).not.toContain(m.pinHash); expect(m.pinHash).toMatch(/^[a-f0-9]{64}$/); }
    // A shift is always audited as opened before it is audited as closed.
    for (const sh of [shift.id, shift2.id]) {
      const opened = audits.find(a => a.action === "shift.opened" && a.details.includes(sh)), closed = audits.find(a => a.action === "shift.closed" && a.details.includes(sh));
      expect(opened && closed, `shift ${sh} must be audited both ways`).toBeTruthy();
      expect(Date.parse(opened!.createdAt)).toBeLessThanOrEqual(Date.parse(closed!.createdAt));
    }
  });

  it("a refused mutation leaves no audit row (no half-recorded privileged change)", async () => {
    setActiveBusinessProfileId("primary");
    const d = new TallybookDB(`audit-refused-${Date.now()}-${++n}`); dbs.push(d);
    await initializeDatabase(d);
    await saveBusinessProfile({name: "Audit Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: ""}, d);
    const owner = await createStaff("Owner", "owner", "123456", d);
    await unlockStaff(owner.id, "123456", d);
    const cashier = await createStaff("Cashier", "cashier", "333333", d);
    lockStaff("primary"); await unlockStaff(cashier.id, "333333", d);
    const before = await d.staffAudits.count();
    await expect(resetStaffPin(owner.id, "999999", d)).rejects.toThrow();
    await expect(changeStaffRole(owner.id, "cashier" as never, d)).rejects.toThrow();
    await expect(setStaffPermissions(cashier.id, ["staff"], d)).rejects.toThrow();
    expect(await d.staffAudits.count()).toBe(before);
    expect((await d.staffMembers.get(owner.id))!.role).toBe("owner");
  });
});
