import {describe,expect,it} from "vitest";
import {parseCommand} from "./intentParser";
import {normalizeSoleInterfaceRequest as normalize} from "./soleInterfaceLanguage";

describe("Clementia sole-interface recognized business questions",()=>{
  it.each([
    "Compare this month with last month",
    "Compare this month's sales with last month's",
    "Can you compare this month's sales with last month's?",
    "Compare last month's sales with this month's",
  ])("identifies exact read-only month comparison: %s",phrase=>{
    const parsed=parseCommand(normalize(phrase));
    expect(parsed.intent).toBe("INSIGHTS_QUERY");
    expect(parsed.qualifier).toBe("sales-comparison");
  });
  it.each([
    "What did we buy from Kofi Traders?",
    "Could you show what we bought from Kofi Traders?",
  ])("recognizes supplier purchase history: %s",phrase=>{
    const parsed=parseCommand(normalize(phrase));
    expect(parsed.intent).toBe("SUPPLIER_PURCHASES");
    expect(parsed.entities.supplierText).toMatch(/kofi/i);
  });
  it.each([
    "Can you correct the egg stock to 25 from 37 counted?",
    "Please adjust Rice stock to 17 from 20 counted.",
  ])("recognizes an audited physical recount, not a direct price edit: %s",phrase=>{
    const parsed=parseCommand(normalize(phrase));
    expect(parsed.intent).toBe("ADJUST_INVENTORY");
    expect(parsed.entities.counted).toBeGreaterThan(0);
    expect(parsed.entities.statedRecorded).toBeGreaterThan(0);
  });
  it.each([
    "Change Eggs stock to 25 without counting",
    "Edit the last sale",
    "Can I correct the egg stock to 25 from 37 counted?",
  ])("never reinterprets an unverified edit or self-question as a confirmed count: %s",phrase=>{
    expect(parseCommand(normalize(phrase)).intent).not.toBe("ADJUST_INVENTORY");
  });
});
