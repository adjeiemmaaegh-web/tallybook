import { describe, expect, it } from "vitest";
import { lockStaff } from "@/features/staff/staff";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { confirmAction, row, useAssistantDb } from "./testKit";

describe("Clementia permissioned conversational expenses",()=>{
  const kit=useAssistantDb();

  it("previews without writing, then records exactly one native immutable expense on explicit confirmation",async()=>{
    const before=await kit.database.expenses.count();
    const preview=await kit.assistant.send("Record expense transport 12.50 cedis today for market delivery");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.kind).toBe("expense");
    expect(row(preview,"Category")).toBe("Transport");
    expect(row(preview,"Amount")).toBe("GHS 12.50");
    expect(row(preview,"Note")).toBe("market delivery");
    expect(await kit.database.expenses.count()).toBe(before);
    const confirm=confirmAction(preview);
    const saved=await kit.assistant.act(confirm);
    expect(saved.kind).toBe("success");
    expect(await kit.database.expenses.count()).toBe(before+1);
    const entry=await kit.database.expenses.orderBy("createdAt").last();
    expect(entry).toMatchObject({category:"transport",amountMinor:1250,currency:"GHS",note:"market delivery",businessProfileId:"primary"});
    expect((await kit.database.assistantAudit.toArray()).some(x=>x.action==="expense"&&x.recordId===entry!.id&&x.outcome==="saved")).toBe(true);
    expect((await kit.assistant.act(confirm)).kind).not.toBe("success");
    expect(await kit.database.expenses.count()).toBe(before+1);
  });

  it("supports a full first-time user conversation and cancellation",async()=>{
    const first=await kit.assistant.send("Record an expense");
    expect(first.kind).toBe("question");
    expect(first.text).toMatch(/category/i);
    const second=await kit.assistant.send("rent");
    expect(second.text).toMatch(/amount/i);
    const third=await kit.assistant.send("150 cedis");
    expect(third.text).toMatch(/when|date/i);
    const preview=await kit.assistant.send("today");
    expect(preview.preview?.kind).toBe("expense");
    expect(row(preview,"Category")).toBe("Rent");
    expect(row(preview,"Amount")).toBe("GHS 150");
    await kit.assistant.act({type:"cancel",label:"Cancel"});
    expect(await kit.database.expenses.count()).toBe(0);
    expect((await kit.assistant.act(confirmAction(preview))).kind).not.toBe("success");
  });

  it("never treats explanation questions as a request to post an expense",async()=>{
    const response=await kit.assistant.send("How do I record a business expense?");
    expect(response.kind).toBe("answer");
    expect(response.preview).toBeUndefined();
    expect(await kit.database.expenses.count()).toBe(0);
  });

  it("refuses a future date and mismatched source currency before any preview",async()=>{
    const first=await kit.assistant.send("Record expense rent 150 cedis on 2999-01-01");
    expect(first.kind).toBe("question");
    expect(first.preview).toBeUndefined();
    expect(first.text).toMatch(/future/i);
    await kit.assistant.act({type:"cancel",label:"Cancel"});
    const second=await kit.assistant.send("Record expense utilities 50 USD today");
    expect(second.kind).toBe("question");
    expect(second.preview).toBeUndefined();
    expect(second.text).toMatch(/currency/i);
    expect(await kit.database.expenses.count()).toBe(0);
  });

  it("keeps staff permission and active-company enforcement inside the service",async()=>{
    const preview=await kit.assistant.send("Record rent expense 350 cedis today");
    expect(preview.preview?.kind).toBe("expense");
    lockStaff("primary");
    const result=await kit.assistant.act(confirmAction(preview));
    expect(result.kind).toBe("error");
    expect(await kit.database.expenses.count()).toBe(0);
  });

  it("expires the preview after company selection changes",async()=>{
    const preview=await kit.assistant.send("Record expense repairs 90 cedis today");
    expect(preview.preview?.kind).toBe("expense");
    setActiveBusinessProfileId("other-company");
    const result=await kit.assistant.act(confirmAction(preview));
    expect(result.kind).toBe("error");
    setActiveBusinessProfileId("primary");
    expect(await kit.database.expenses.count()).toBe(0);
  });

  it("asks rather than guessing when an amount or date was not provided",async()=>{
    const first=await kit.assistant.send("Record expense rent");
    expect(first.kind).toBe("question");
    expect(first.text).toMatch(/amount/i);
    const second=await kit.assistant.send("40 cedis");
    expect(second.kind).toBe("question");
    expect(second.text).toMatch(/when|date/i);
    expect(await kit.database.expenses.count()).toBe(0);
  });
});
