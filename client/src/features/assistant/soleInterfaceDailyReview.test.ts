import { describe, expect, it } from "vitest";
import { useAssistantDb } from "./testKit";
import { planForText } from "./taskPlanner";

describe("Clementia direct read-only daily checks",()=>{
  const kit=useAssistantDb();
  it.each(["Schedule a daily stock review","How do I schedule a weekly debt review?","Pause my scheduled local reviews"])("guides %s to explicit owner approval without changing a schedule or financial records",async(prompt)=>{
    const before={profiles:await kit.database.businessProfiles.toArray(),sales:await kit.database.sales.toArray(),shifts:await kit.database.staffShifts.toArray()};
    const reply=await kit.assistant.send(prompt);
    expect(reply.link?.href).toBe("/insights");expect(reply.text).toMatch(/unlocked owner/);expect(reply.text).toMatch(/never send messages or change money/);
    expect(reply.actions?.some(action=>action.type==="confirm")).not.toBe(true);
    expect({profiles:await kit.database.businessProfiles.toArray(),sales:await kit.database.sales.toArray(),shifts:await kit.database.staffShifts.toArray()}).toEqual(before);
  });
  it("recognizes hyphenated end-of-day summary as a saved-record plan",()=>{
    const plan=planForText("End-of-day summary");
    expect(plan?.plan.steps.map(step=>step.type)).toEqual(["read_sales","read_inventory","read_expenses","read_shift"]);
    expect(plan?.plan.requiresConfirmation).toBe(false);
  });
  it("answers end-of-day summary inside chat without closing a shift or making financial entries",async()=>{
    const before={
      sales:await kit.database.sales.count(),
      expenses:await kit.database.expenses.count(),
      shifts:await kit.database.staffShifts.toArray(),
    };
    const reply=await kit.assistant.send("End-of-day summary");
    expect(reply.kind).toBe("answer");
    expect(reply.text).toMatch(/end-of-day/i);
    expect(reply.details?.some(item=>item.label==="Show today's sales")).toBe(true);
    expect(reply.details?.some(item=>item.label==="What is running low?")).toBe(true);
    expect(reply.details?.some(item=>item.label==="Show expenses today")).toBe(true);
    expect(reply.details?.some(item=>item.label==="Show my shift cash")).toBe(true);
    expect(await kit.database.sales.count()).toBe(before.sales);
    expect(await kit.database.expenses.count()).toBe(before.expenses);
    expect(await kit.database.staffShifts.toArray()).toEqual(before.shifts);
  });
  it("runs a morning check and explicit business overview using existing read-only queries",async()=>{
    const morning=await kit.assistant.send("Morning check");
    expect(morning.kind).toBe("answer");
    expect(morning.details?.length).toBeGreaterThanOrEqual(3);
    const overview=await kit.assistant.send("Business overview");
    expect(overview.kind).toBe("answer");
    expect(overview.details?.length).toBe(4);
    expect(await kit.database.expenses.count()).toBe(0);
  });
});
