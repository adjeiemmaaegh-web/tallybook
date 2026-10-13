import { describe, expect, it } from "vitest";
import { findAppCapability, parseApplicationRequest } from "./appKnowledge";
import { explainLanguage, interpretLanguage } from "./languageUnderstanding";
import { parseCommand } from "./intentParser";

describe("offline compositional language understanding", () => {
  it("resolves unseen Stock navigation variations from action + entity concepts", () => {
    const cases = [
      "opin sto", "opn stk", "show stk", "view sto", "bring up inventory",
      "let me see my stock", "check inventry", "open the goods", "display my items",
      "go stock page", "show my stk", "bring up the stock screen", "see my goods",
      "open inv", "show product list", "go to stk screen", "bring inventory page",
      "view items", "check stock", "show my products", "open the stock section",
    ];
    for (const text of cases) {
      const request = parseApplicationRequest(text);
      expect(request?.capability.id, text).toBe("stock");
      expect(request?.kind, text).toBe("navigate");
    }
  });

  it("generalizes other domain concepts without full-sentence aliases", () => {
    expect(parseApplicationRequest("opn custmr")?.capability.id).toBe("customers");
    expect(parseApplicationRequest("show suplier page")?.capability.id).toBe("purchases");
    expect(parseApplicationRequest("view expence section")?.capability.id).toBe("expenses");
    expect(parseApplicationRequest("open rpts")?.capability.id).toBe("reports");
    expect(parseCommand("recieve stock").intent).toBe("RECEIVE_STOCK");
    expect(parseCommand("pay john 500").intent).toBe("RECORD_CUSTOMER_PAYMENT");
    expect(parseCommand("pay john 500").confidence).toBeLessThan(0.75);
  });

  it("keeps exact, alias, fuzzy, and unknown interpretations observable", () => {
    const exact = explainLanguage("open stock");
    const alias = explainLanguage("show stk");
    const fuzzy = explainLanguage("stok");
    const unknown = explainLanguage("zzzx qqq");
    expect(exact.diagnostics.matched.some((token) => token.method === "exact")).toBe(true);
    expect(alias.diagnostics.matched.some((token) => token.method === "alias")).toBe(true);
    expect(fuzzy.diagnostics.matched.some((token) => token.method === "fuzzy")).toBe(true);
    expect(unknown.confidence).toBe(0);
    expect(unknown.normalizedText).toBe("zzzx qqq");
  });

  it("does not turn ambiguous words into Stock or unsupported routes", () => {
    expect(findAppCapability("open store")).toBeNull();
    expect(parseApplicationRequest("what is reconciliation")).toBeNull();
    expect(parseApplicationRequest("open pament")).toBeNull();
  });

  it("preserves write safety for typo and word-order variations", () => {
    const parsed = parseCommand("pay john 500");
    expect(parsed.entities.customerText).toBe("john");
    expect(parsed.entities.amount).toBe("500");
    expect(parsed.confidence).toBeLessThan(0.75);
    expect(parseCommand("opn stk").intent).toBe("INVENTORY_QUERY");
  });

  it("stays fast and bounded for repeated long inputs", () => {
    const input = `${"please show my stock and check inventry ".repeat(20)}now`;
    const started = Date.now();
    for (let index = 0; index < 250; index += 1) interpretLanguage(input);
    const elapsed = Date.now() - started;
    expect(input.length).toBeGreaterThan(300);
    expect(elapsed).toBeLessThan(1500);
  });
});
