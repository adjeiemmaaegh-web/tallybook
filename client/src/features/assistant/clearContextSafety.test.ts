import {describe,expect,it} from "vitest";
import {confirmAction,useAssistantDb} from "./testKit";

describe("Clementia clearing chat revokes every unconfirmed financial action",()=>{
  const kit=useAssistantDb();

  it("makes the old native sale confirmation unusable after clear",async()=>{
    const before=await kit.database.sales.count();
    const draft=await kit.assistant.send("Sell 2 eggs to walk-in customer, paid cash");
    expect(draft.preview?.kind).toBe("sale");
    const confirm=confirmAction(draft);
    kit.assistant.clearContext();
    expect(kit.assistant.pendingToken()).toBeNull();
    expect((await kit.assistant.act(confirm)).kind).not.toBe("success");
    expect(await kit.database.sales.count()).toBe(before);
  });

  it("clears a pending expense preview with no expense saved",async()=>{
    const draft=await kit.assistant.send("Record expense transport 25 cedis today");
    expect(draft.preview?.kind).toBe("expense");
    const confirm=confirmAction(draft);
    kit.assistant.clearContext();
    expect(kit.assistant.pendingToken()).toBeNull();
    expect((await kit.assistant.act(confirm)).kind).not.toBe("success");
    expect(await kit.database.expenses.count()).toBe(0);
  });

  it("clears a pending reversal token so an old button cannot mutate the original sale",async()=>{
    const draft=await kit.assistant.send("Undo the last sale");
    expect(draft.kind).toBe("preview");
    const confirm=draft.actions?.find(a=>a.type==="confirm_reversal");
    expect(confirm?.type).toBe("confirm_reversal");
    kit.assistant.clearContext();
    if(!confirm)throw Error("Missing reversal button");
    expect((await kit.assistant.act(confirm)).kind).toBe("error");
    expect(await kit.database.saleReversals.count()).toBe(0);
  });
});
