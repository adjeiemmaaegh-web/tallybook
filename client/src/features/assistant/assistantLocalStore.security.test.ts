import { afterEach, describe, expect, it } from "vitest";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { assistantLocalDB, deleteStoredAlias, deleteStoredWorkflow, saveStoredAlias, saveStoredWorkflow } from "./assistantLocalStore";

const workflow = (businessProfileId: string, id = "same-workflow") => ({
  id, businessProfileId, name: "Morning check", description: "Read-only summary", commands: ["Morning check"],
});
const alias = (businessProfileId: string, id = "same-alias") => ({
  id, businessProfileId, phrase: "stock", canonicalValue: "inventory", kind: "intent" as const, confidence: 1, enabled: true,
});

afterEach(async () => {
  setActiveBusinessProfileId("primary");
  await assistantLocalDB.open();
  await assistantLocalDB.transaction("rw", [assistantLocalDB.aliases, assistantLocalDB.workflows, assistantLocalDB.history], async () => {
    await assistantLocalDB.aliases.clear();
    await assistantLocalDB.workflows.clear();
    await assistantLocalDB.history.clear();
  });
});

describe("assistant local company isolation", () => {
  it("rejects writes targeting an inactive company", async () => {
    setActiveBusinessProfileId("primary");
    await expect(saveStoredWorkflow(workflow("foreign"))).rejects.toThrow(/Switch to the company/);
    await expect(saveStoredAlias(alias("foreign"))).rejects.toThrow(/Switch to the company/);
  });

  it("cannot overwrite or delete another company's saved workflow by its globally unique ID", async () => {
    setActiveBusinessProfileId("company-two");
    await saveStoredWorkflow(workflow("company-two"));
    setActiveBusinessProfileId("primary");
    await expect(saveStoredWorkflow(workflow("primary"))).rejects.toThrow(/another company/);
    await expect(deleteStoredWorkflow("same-workflow")).rejects.toThrow(/another company/);
    expect(await assistantLocalDB.workflows.get("same-workflow")).toMatchObject({businessProfileId:"company-two"});
    setActiveBusinessProfileId("company-two");
    await deleteStoredWorkflow("same-workflow");
    expect(await assistantLocalDB.workflows.get("same-workflow")).toBeUndefined();
  });

  it("cannot overwrite or delete another company's saved alias by its globally unique ID", async () => {
    setActiveBusinessProfileId("company-two");
    await saveStoredAlias(alias("company-two"));
    setActiveBusinessProfileId("primary");
    await expect(saveStoredAlias(alias("primary"))).rejects.toThrow(/another company/);
    await expect(deleteStoredAlias("same-alias")).rejects.toThrow(/another company/);
    expect(await assistantLocalDB.aliases.get("same-alias")).toMatchObject({businessProfileId:"company-two"});
    setActiveBusinessProfileId("company-two");
    await deleteStoredAlias("same-alias");
    expect(await assistantLocalDB.aliases.get("same-alias")).toBeUndefined();
  });
});

describe("assistant history company protection and backup completeness", () => {
  it('omits absent optional intent rather than saving an unreplayable undefined field', async () => {
    const { recordAssistantHistory } = await import('./assistantLocalStore');
    setActiveBusinessProfileId('primary');
    const row = await recordAssistantHistory({businessProfileId:'primary',input:'hello',replyText:'hi',replayText:'hello',intent:undefined});
    const stored = await assistantLocalDB.history.get(row.id);
    expect(stored).toBeDefined();
    expect(Object.hasOwn(stored!, 'intent')).toBe(false);
  });

  it("rejects foreign-company history reads, writes and clear attempts", async () => {
    const { recordAssistantHistory, clearAssistantHistory, listAssistantHistory, listAllAssistantHistoryForBackup } = await import("./assistantLocalStore");
    setActiveBusinessProfileId("company-two");
    await recordAssistantHistory({businessProfileId:"company-two",input:"private",replyText:"secret",replayText:"private"});
    setActiveBusinessProfileId("primary");
    await expect(recordAssistantHistory({businessProfileId:"company-two",input:"injected",replyText:"x",replayText:"x"})).rejects.toThrow(/Switch to the company/);
    await expect(clearAssistantHistory("company-two")).rejects.toThrow(/Switch to the company/);
    await expect(listAssistantHistory("company-two")).rejects.toThrow(/Switch to the company/);
    await expect(listAllAssistantHistoryForBackup("company-two")).rejects.toThrow(/Switch to the company/);
    expect(await assistantLocalDB.history.where("businessProfileId").equals("company-two").count()).toBe(1);
  });

  it("lists newest history first, but exports every row rather than only the newest fifty", async () => {
    const { listAssistantHistory, listAllAssistantHistoryForBackup, clearAssistantHistory } = await import("./assistantLocalStore");
    setActiveBusinessProfileId("primary");
    await assistantLocalDB.open();
    const historicalRows=Array.from({length:55},(_,i)=>({id:`history-${i}`,businessProfileId:"primary",input:`input ${i}`,replyText:"ok",replayText:`input ${i}`,createdAt:new Date(Date.UTC(2026,9,11,0,0,i)).toISOString()}));
    await assistantLocalDB.history.bulkPut(historicalRows);
    const displayed=await listAssistantHistory("primary");
    expect(displayed).toHaveLength(50);
    expect(displayed[0].id).toBe("history-54");
    expect(displayed[49].id).toBe("history-5");
    const backedUp=await listAllAssistantHistoryForBackup("primary");
    expect(backedUp).toHaveLength(55);
    expect(backedUp.at(-1)?.id).toBe("history-0");
    await expect(listAssistantHistory("primary",Number.POSITIVE_INFINITY)).rejects.toThrow(/limit/);
    await clearAssistantHistory("primary");
    expect(await assistantLocalDB.history.where("businessProfileId").equals("primary").count()).toBe(0);
  });
});
