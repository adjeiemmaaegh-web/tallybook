import { describe, expect, it } from "vitest";
import { appCapabilities, applicationReply, findAppCapability, parseApplicationRequest } from "./appKnowledge";
import { parseCommand } from "./intentParser";

describe("Universal In-App Assistant application knowledge", () => {
  it("uses only routes from the real application registry", () => {
    expect(appCapabilities.length).toBeGreaterThan(8);
    for (const capability of appCapabilities) {
      const request = parseApplicationRequest(`where can I find ${capability.aliases[0]}`);
      expect(request?.capability.route).toBe(capability.route);
      const reply = applicationReply(request!);
      expect(reply.link?.href).toBeDefined();
    }
  });

  it.each([
    ["where can I find suppliers", "purchases", "navigate"],
    ["open expenses", "expenses", "navigate"],
    ["take me to business health", "business-health", "navigate"],
    ["how do I add a supplier", "purchases", "help"],
    ["what does reconciliation do", undefined, undefined],
    ["supplier", "purchases", "discover"],
    ["suplier", "purchases", "discover"],
    ["inventry", "stock", "discover"],
    ["expence section", "expenses", "navigate"],
  ])("interprets ordinary or imperfect application language: %s", (text, id, kind) => {
    const request = parseApplicationRequest(text);
    if (!id) {
      expect(request).toBeNull();
      return;
    }
    expect(request?.capability.id).toBe(id);
    expect(request?.kind).toBe(kind);
  });

  it("does not steal business queries or explicit writes", () => {
    expect(parseApplicationRequest("Show sales for last month")).toBeNull();
    expect(parseApplicationRequest("How many eggs are left?")).toBeNull();
    expect(parseApplicationRequest("record a sale")).toBeNull();
    expect(parseApplicationRequest("Add customer Ama Mensah")).toBeNull();
    expect(parseCommand("record a sale").intent).toBe("RECORD_SALE");
  });

  it("rejects close fuzzy matches instead of inventing an application destination", () => {
    expect(findAppCapability("zzzzzz")).toBeNull();
    expect(parseApplicationRequest("what is reconciliation")).toBeNull();
  });
});
