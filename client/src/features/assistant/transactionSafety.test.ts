import { describe, expect, it } from "vitest";
import { compoundItemWarning } from "./transactionSafety";

describe("compound transaction safety", () => {
  it("requests separate lines instead of dropping a second sale item", () => {
    expect(compoundItemWarning("Sold 5 bags of rice and 3 bottles of oil to John, paid cash")).toContain("more than one product");
    expect(compoundItemWarning("Received 10 eggs plus 6 bags of rice")).toContain("more than one product");
  });
  it("permits ordinary single sales and payment phrases", () => {
    expect(compoundItemWarning("Sold 5 bags of rice to John; he paid 100")).toBeNull();
    expect(compoundItemWarning("Sold 5 bags of rice to John, paid 100")).toBeNull();
    expect(compoundItemWarning("How much did I sell yesterday? ")).toBeNull();
  });
});

import { createAssistant } from "./assistant";
import { ledgerCounts, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
it("rejects a combined product sale before preparing any financial write", async () => {
  const ai = createAssistant({ currency: "GHS", database: kit.database });
  const before = await ledgerCounts(kit.database);
  const response = await ai.send("Sold 5 bags of rice and 3 bottles of oil to John, paid cash");
  expect(response.kind).not.toBe("preview");
  expect(response.text).toMatch(/every product|more than one product/i);
  expect(await ledgerCounts(kit.database)).toEqual(before);
});
