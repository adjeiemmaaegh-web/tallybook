import { describe, expect, it } from "vitest";
import { expandCompoundSale } from "./compoundSales";
import { createAssistant } from "./assistant";
import { ledgerCounts, useAssistantDb } from "./testKit";

describe("compound sale expansion", () => {
  it("splits two products with explicitly shared buyer and terms", () => {
    expect(expandCompoundSale("Sell 2 eggs and 1 rice to Kwame, paid cash")).toEqual([
      "Sell 2 eggs to kwame, paid cash", "Sell 1 rice to kwame, paid cash",
    ]);
  });
  it("understands first-person completed sale requests without changing payment terms", () => {
    expect(expandCompoundSale("I sold 2 eggs plus 1 rice to Kwame, paid cash")).toEqual([
      "Sell 2 eggs to kwame, paid cash", "Sell 1 rice to kwame, paid cash",
    ]);
    expect(expandCompoundSale("We sold 2 eggs along with 1 rice to Kwame, cash")).toHaveLength(2);
  });
  it("never allocates a single partial payment to two separate sales", () => {
    expect(expandCompoundSale("Sell 2 eggs and 1 rice to Kwame, paid 100 cash")).toBeNull();
  });
  it("does not guess a customer or truncate a third product", () => {
    expect(expandCompoundSale("Sell 2 eggs and 1 rice")).toBeNull();
    expect(expandCompoundSale("Sell 2 eggs and 1 rice and 3 mangoes to Kwame cash")).toHaveLength(3);
    expect(expandCompoundSale("Sell 2 eggs and 1 rice and oil to Kwame cash")).toBeNull();
  });
});

const kit = useAssistantDb();
it("previews all explicitly shared sale items and makes no writes before confirmation", async () => {
  const assistant = createAssistant({ currency: "GHS", database: kit.database });
  const before = await ledgerCounts(kit.database);
  const preview = await assistant.send("Sell 2 eggs and 1 rice to Kwame, paid cash");
  expect(preview.kind).toBe("preview");
  expect(preview.preview?.kind).toBe("batch");
  expect(preview.preview?.rows).toHaveLength(2);
  expect(await ledgerCounts(kit.database)).toEqual(before);
});

it("does not expose a partial-confirm button when one compound item is unknown", async () => {
  const assistant = createAssistant({ currency: "GHS", database: kit.database });
  const before = await ledgerCounts(kit.database);
  const reply = await assistant.send("Sell 1 eggs and 1 nonexistentproduct to Kwame, paid cash");
  expect(reply.kind).toBe("error");
  expect(reply.actions?.some((a) => a.type === "confirm")).toBeFalsy();
  expect(await ledgerCounts(kit.database)).toEqual(before);
});
