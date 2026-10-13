import { describe, expect, it } from "vitest";
import { useAssistantDb } from "./testKit";

describe("Universal In-App Assistant conversations", () => {
  const kit = useAssistantDb();

  it("offers a verified destination for navigation questions", async () => {
    const reply = await kit.assistant.send("where can I find suplier");
    expect(reply.intent).toBe("NAVIGATE");
    expect(reply.link).toEqual({ label: "Open Purchases and Suppliers", href: "/purchases" });
    expect(reply.actions?.some((action) => action.type === "navigate" && action.href === "/purchases")).toBe(true);
  });

  it("turns a bare feature into useful choices and understands add one as that feature", async () => {
    const first = await kit.assistant.send("supplier");
    expect(first.intent).toBe("FEATURE_DISCOVERY");
    expect(first.text).toContain("suppliers");
    const next = await kit.assistant.send("add one");
    expect(next.text.toLowerCase()).toContain("name");
    expect(next.actions?.some((action) => action.type === "cancel")).toBe(true);
  });

  it("keeps vague application language out of transaction writes", async () => {
    const before = await kit.database.purchases.count();
    const reply = await kit.assistant.send("I bought some goods from a supplier");
    expect(reply.preview).toBeUndefined();
    expect(await kit.database.purchases.count()).toBe(before);
  });

  it("keeps a low-stock follow-up in the read-only path", async () => {
    await kit.assistant.send("inventory");
    const reply = await kit.assistant.send("low stock");
    expect(reply.kind).not.toBe("preview");
    expect(reply.text.toLowerCase()).toMatch(/low|stock|running/);
  });
});
