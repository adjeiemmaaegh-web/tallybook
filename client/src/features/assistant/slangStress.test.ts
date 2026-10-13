import { describe, expect, it } from "vitest";
import { ledgerCounts, useAssistantDb } from "./testKit";

describe("assistant extreme-language stress corpus", () => {
  const kit = useAssistantDb();

  it("understands slang and broken grammar without losing the intended domain", async () => {
    const cases: Array<[string, RegExp]> = [
      ["how much kwame dey owe me", /owe|balance|Kwame/i],
      ["wetin i sell today", /today|sales|sold/i],
      ["sales for yestaday", /yesterday|sales/i],
      ["wetin dey low for shop", /low|running|stock/i],
      ["who buy eggs", /customer|bought|buy|sales|recorded/i],
      ["which product no dey move", /slow|mover|selling/i],
      ["make i know who owe pass", /owe|debtor|outstanding/i],
      ["show me wetin assistant do today", /assistant|record|saved|activity/i],
    ];
    for (const [input, expected] of cases) {
      const reply = await kit.assistant.send(input);
      expect(`${reply.intent} ${reply.text}`).toMatch(expected);
    }
  });

  it("understands application navigation and setup slang", async () => {
    for (const input of ["supplier dey where", "open custmer", "inventry", "expence section", "abeg show me sales"]) {
      const reply = await kit.assistant.send(input);
      expect(reply.preview).toBeUndefined();
      expect(reply.text.length).toBeGreaterThan(10);
    }
  });

  it("keeps multi-turn customer context explicit and confirmation-gated", async () => {
    const first = await kit.assistant.send("how much does Adwoa owe?");
    expect(first.text).toMatch(/Adwoa|owe|balance/i);
    const follow = await kit.assistant.send("she paid 100 cash");
    expect(follow.kind).toBe("preview");
    expect(follow.text).toMatch(/Adwoa|customer|confirm/i);
    expect(follow.context).toMatch(/Adwoa/i);
  });

  it("keeps slang writes safe and refuses vague stock receipts", async () => {
    const before = await ledgerCounts(kit.database);
    const vague = await kit.assistant.send("i bought goods from supplier");
    expect(vague.preview).toBeUndefined();
    expect(await ledgerCounts(kit.database)).toEqual(before);
    const payment = await kit.assistant.send("kwame don pay me 100");
    expect(payment.kind).toBe("question");
    expect(payment.text).toMatch(/pay|cash|mobile|card|method/i);
    expect(await ledgerCounts(kit.database)).toEqual(before);
  });

  it("treats what-if language as a dry run, never a sale", async () => {
    const before = await ledgerCounts(kit.database);
    const reply = await kit.assistant.send("what if i sell 2 eggs to kwame");
    expect(reply.text).toMatch(/dry run|simulate|no records|would/i);
    expect(reply.preview).toBeUndefined();
    expect(await ledgerCounts(kit.database)).toEqual(before);
  });
});
