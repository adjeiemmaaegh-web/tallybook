import { describe, expect, it } from "vitest";
import { resolveContextFirst } from "./contextFirstResolver";

describe("context-first resolver", () => {
  const context = { customerNames: ["Kwame Boateng"], supplierNames: ["Kofi Traders"], productNames: ["Eggs", "Rice"] };

  it("resolves informal remaining-stock questions without UNKNOWN", () => {
    const result = resolveContextFirst("wetin dey left", context);
    expect(result.disposition).toBe("ANSWER");
    expect(result.candidates[0]?.intent).toBe("INVENTORY_QUERY");
    expect(result.factors.modifier).toBe("REMAINING");
  });

  it("resolves informal customer outstanding questions", () => {
    const result = resolveContextFirst("how much dey Kwame owe", context);
    expect(result.disposition).toBe("ANSWER");
    expect(result.candidates[0]?.intent).toBe("CUSTOMER_BALANCE");
    expect(result.roles.customerEntity?.value).toMatch(/kwame/i);
  });

  it("keeps show-stock ambiguity recoverable", () => {
    const result = resolveContextFirst("show stock", context);
    expect(result.disposition).toBe("ASK_CLARIFICATION");
    expect(result.clarification).toMatch(/open this section|saved records/i);
  });

  it("turns application help into an answer instead of UNKNOWN", () => {
    const result = resolveContextFirst("what can I do here", context);
    expect(result.disposition).toBe("ANSWER");
    expect(result.mode).toBe("HELP");
    expect(result.candidates[0]?.intent).toBe("HELP");
  });

  it("recognizes informal writes but only returns a preview disposition", () => {
    const sale = resolveContextFirst("give Kwame two eggs cash", context);
    expect(sale.disposition).toBe("PREVIEW_WRITE");
    expect(sale.safety.safety).toBe("FINANCIAL_WRITE");
    expect(sale.candidates[0]?.intent).toBe("RECORD_SALE");

    const receipt = resolveContextFirst("Kofi bring 8 eggs", context);
    expect(receipt.disposition).toBe("PREVIEW_WRITE");
    expect(receipt.safety.safety).toBe("FINANCIAL_WRITE");
    expect(receipt.candidates[0]?.intent).toBe("RECEIVE_STOCK");
  });

  it("rejects destructive and out-of-domain requests", () => {
    expect(resolveContextFirst("delete the last sale", context).disposition).toBe("REJECT");
    expect(resolveContextFirst("what is the weather", context).disposition).toBe("REJECT");
  });
});
