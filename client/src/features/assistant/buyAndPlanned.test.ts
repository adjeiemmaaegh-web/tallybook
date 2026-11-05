/**
 * Two unsafe readings found by the held-out phrasing set (2026-11-05):
 * 1. In Ghanaian English and pidgin "Kwame buy 2 eggs" means Kwame bought them. It was read
 *    as the shop receiving stock ("Which supplier did you receive it from?").
 * 2. Planned actions ("will pay 50 next week", "wants to buy tomorrow") were read as done,
 *    partly because normalisation rewrites "pay 50" as "paid 50".
 * Nothing is ever saved without confirmation; these tests make sure the wrong preview is never offered.
 */
import { describe, expect, it } from "vitest";
import { describesPlannedAction, parseCommand } from "./intentParser";
import { ledgerCounts, useAssistantDb } from "./testKit";

describe("a customer 'buy' is a sale, not a stock delivery", () => {
  it.each([
    ["Kwame buy 2 eggs", 2, "kwame"],
    ["Ama buy 1 sugar", 1, "ama"],
    ["Yaw don buy 3 milo", 3, "yaw"],
    ["Ama buy 2 eggs on credit", 2, "ama"],
    ["Kwame took 3 eggs, he paid cash", 3, "kwame"],
    ["Kwame collected 4 eggs, he will pay later", 4, "kwame"],
    ["Ama has taken 2 bread on credit", 2, "ama"],
    ["Kwame bought 2 eggs", 2, "kwame"],
  ])("%s", (text, quantity, customer) => {
    const parsed = parseCommand(text);
    expect(parsed.intent).toBe("RECORD_SALE");
    expect(parsed.entities.quantity).toBe(quantity);
    expect(parsed.entities.customerText).toContain(customer);
  });

  it.each(["we buy 10 eggs", "I bought 10 eggs", "bought 10 eggs from Kofi", "Kofi brought 20 eggs", "receive 10 eggs from Kofi"])(
    "the shop buying stock is still a delivery: %s", (text) => {
      expect(parseCommand(text).intent).toBe("RECEIVE_STOCK");
    });

  it.each(["Kwame took 50 cedis", "should I buy more rice", "who bought eggs", "which customers bought rice today"])(
    "never a sale: %s", (text) => {
      expect(parseCommand(text).intent).not.toBe("RECORD_SALE");
      expect(parseCommand(text).intent).not.toBe("RECEIVE_STOCK");
    });
});

describe("planned actions are never offered for recording", () => {
  it.each([
    "Kwame said he will pay 50 next week",
    "Kwame will pay 50 next week",
    "Kwame go pay 50 tomorrow",
    "Kwame wants to buy 2 eggs tomorrow",
    "Kwame will buy 2 eggs",
    "Kofi will bring 20 eggs on Monday",
    "receive 10 eggs from Kofi tomorrow",
    "Ama has to pay 30",
    "should I buy more rice",
  ])("%s", (text) => {
    expect(describesPlannedAction(text)).toBe(true);
    expect(["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"]).not.toContain(parseCommand(text).intent);
  });

  it.each([
    "Kwame collected 4 eggs, he will pay later",
    "Kwame paid 50",
    "Kofi brought 20 eggs yesterday",
    "sell 2 eggs to Kwame cash",
    "Kwame took 3 eggs, he paid cash",
  ])("what has happened is still recorded: %s", (text) => {
    expect(describesPlannedAction(text)).toBe(false);
    expect(["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"]).toContain(parseCommand(text).intent);
  });
});

describe("through the full Assistant", () => {
  const kit = useAssistantDb();

  it("starts a sale for 'Kwame buy 2 eggs', never asking for a supplier", async () => {
    const reply = await kit.assistant.send("Kwame buy 2 eggs");
    expect(reply.text).not.toMatch(/supplier/i);
    expect(reply.preview?.title ?? reply.text).toMatch(/sale|sell|pay|cash|mobile|card|credit/i);
  });

  it("explains, and records nothing, for a payment promised for next week", async () => {
    const before = await ledgerCounts(kit.database);
    for (const text of ["Kwame said he will pay 50 next week", "Kwame Boateng will buy 2 eggs tomorrow"]) {
      const reply = await kit.assistant.send(text);
      expect(reply.preview).toBeUndefined();
      expect(reply.text).toMatch(/planned, not done yet/);
    }
    expect(await ledgerCounts(kit.database)).toEqual(before);
  });
});
