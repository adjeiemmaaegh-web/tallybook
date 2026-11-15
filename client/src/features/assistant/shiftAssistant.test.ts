import { describe, expect, it } from "vitest";
import { closeShift, lockStaff, unlockStaff } from "@/features/staff/staff";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { confirmAction, row, useAssistantDb } from "./testKit";
import { isShiftCashStatusRequest, isShiftOpenRequest } from "./shiftAssistant";

describe("Clementia native staff-shift operations", () => {
  const kit = useAssistantDb();
  const currentShift = async () => {
    const rows = await kit.database.staffShifts.where("businessProfileId").equals("primary").toArray();
    return rows.find(item => !item.closedAt);
  };
  const closeSeedShift = async () => {
    const shift = await currentShift();
    if (!shift) throw new Error("Fixture shift missing");
    await closeShift(shift.id, 0, kit.database);
  };

  it("recognizes specific read/open intents without intercepting instructions or close requests", () => {
    expect(isShiftOpenRequest("Open my shift with 25 cedis float")).toBe(true);
    expect(isShiftCashStatusRequest("Show my shift cash")).toBe(true);
    expect(isShiftCashStatusRequest("Shift status")).toBe(true);
    expect(isShiftOpenRequest("How do I open a shift?")).toBe(false);
    expect(isShiftOpenRequest("Close my shift")).toBe(false);
    expect(isShiftCashStatusRequest("Close my shift")).toBe(false);
  });

  it("reviews an authorized current shift without a write, cash count, settlement or closure", async () => {
    const shift = await currentShift();
    const before = await kit.database.staffShifts.toArray();
    const auditsBefore = await kit.database.staffAudits.toArray();
    const reply = await kit.assistant.send("Show my shift cash");
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain(formatMinorAmount(0, "GHS"));
    expect(reply.details?.find(item => item.label === "Opening float")?.value).toBe(formatMinorAmount(0, "GHS"));
    expect(reply.details?.find(item => item.label === "Expected drawer cash")?.value).toBe(formatMinorAmount(0, "GHS"));
    expect(reply.moreText).toMatch(/not reconciled/i);
    expect(await kit.database.staffShifts.toArray()).toEqual(before);
    expect(await kit.database.staffAudits.toArray()).toEqual(auditsBefore);
    expect((await kit.database.staffShifts.get(shift!.id))?.closedAt).toBeUndefined();
  });

  it("uses a separate preview and one-time confirm to open an actual native shift", async () => {
    await closeSeedShift();
    const before = await kit.database.staffShifts.count();
    const question = await kit.assistant.send("Open my shift");
    expect(question.kind).toBe("question");
    expect(await kit.database.staffShifts.count()).toBe(before);
    const preview = await kit.assistant.send("50 cedis");
    expect(preview.preview?.kind).toBe("shift_open");
    expect(row(preview, "Opening float")).toBe(formatMinorAmount(5000, "GHS"));
    expect(await kit.database.staffShifts.count()).toBe(before);
    expect((await kit.assistant.send("yes")).kind).toBe("info");
    const button = confirmAction(preview);
    expect((await kit.assistant.act(button)).kind).toBe("success");
    expect(await kit.database.staffShifts.count()).toBe(before + 1);
    expect((await currentShift())?.openingFloatMinor).toBe(5000);
    expect((await kit.assistant.act(button)).kind).toBe("error");
    expect(await kit.database.staffShifts.count()).toBe(before + 1);
    expect((await kit.database.assistantAudit.toArray()).some(item => item.action === "shift_open" && item.outcome === "saved")).toBe(true);
  });

  it("cancels pending shift approval on clear context and on explicit cancellation", async () => {
    await closeSeedShift();
    const before = await kit.database.staffShifts.count();
    const preview = await kit.assistant.send("Start shift with float 0 cedis");
    expect(preview.preview?.kind).toBe("shift_open");
    const action = confirmAction(preview);
    kit.assistant.clearContext();
    expect((await kit.assistant.act(action)).kind).toBe("error");
    const again = await kit.assistant.send("Open shift with 0 cedis");
    expect(again.preview?.kind).toBe("shift_open");
    await kit.assistant.act({ type: "cancel", label: "Cancel" });
    expect((await kit.assistant.act(confirmAction(again))).kind).toBe("error");
    expect(await kit.database.staffShifts.count()).toBe(before);
  });

  it("expires opening approval after company switch or a staff lock/unlock", async () => {
    await closeSeedShift();
    const owner = (await kit.database.staffMembers.where("businessProfileId").equals("primary").first())!;
    const preview = await kit.assistant.send("Open shift with 10 cedis float");
    expect(preview.preview?.kind).toBe("shift_open");
    lockStaff("primary");
    await unlockStaff(owner.id, "123456", kit.database);
    expect((await kit.assistant.act(confirmAction(preview))).kind).toBe("error");
    const next = await kit.assistant.send("Open shift with 10 cedis float");
    expect(next.preview?.kind).toBe("shift_open");
    setActiveBusinessProfileId("other-company");
    expect((await kit.assistant.act(confirmAction(next))).kind).toBe("error");
    setActiveBusinessProfileId("primary");
    expect(await currentShift()).toBeUndefined();
  });

  it("never opens a second shift or assumes an unauthorized monetary value", async () => {
    expect((await kit.assistant.send("Open my shift with 10 cedis")).kind).toBe("error");
    await closeSeedShift();
    const before = await kit.database.staffShifts.count();
    const otherCurrency = await kit.assistant.send("Open shift with 15 USD");
    expect(otherCurrency.kind).toBe("question");
    expect(otherCurrency.preview).toBeUndefined();
    await kit.assistant.send("cancel");
    const ambiguous = await kit.assistant.send("Start shift with 10 and 20 cedis");
    expect(ambiguous.kind).toBe("question");
    await kit.assistant.send("cancel");
    const precise = await kit.assistant.send("Start shift with 12.345 cedis");
    expect(precise.kind).toBe("question");
    await kit.assistant.send("cancel");
    const negative = await kit.assistant.send("Start shift with -50 cedis");
    expect(negative.kind).toBe("question");
    expect(negative.text).toMatch(/negative/i);
    expect(negative.preview).toBeUndefined();
    await kit.assistant.send("cancel");
    const unicodeMinus = await kit.assistant.send("Start shift with −50 cedis");
    expect(unicodeMinus.kind).toBe("question");
    expect(unicodeMinus.preview).toBeUndefined();
    await kit.assistant.send("cancel");
    const parentheses = await kit.assistant.send("Start shift with (50) cedis");
    expect(parentheses.kind).toBe("question");
    expect(parentheses.preview).toBeUndefined();
    await kit.assistant.send("cancel");
    expect(await kit.database.staffShifts.count()).toBe(before);
  });

  it("does not expose shift cash without an unlocked authorized staff session", async () => {
    lockStaff("primary");
    const reply = await kit.assistant.send("Shift status");
    expect(reply.kind).toBe("error");
    expect(reply.text).toMatch(/locked|permission|unlock/i);
  });
});
