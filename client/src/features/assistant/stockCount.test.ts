/**
 * Stock counts ("I counted 25 but we have 37") — end to end, against the real adjustStock service.
 * The headline check is the one that was missing before: after confirming, the product's stock quantity really changes.
 */
import { describe, expect, it } from "vitest";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { completeSale } from "@/features/sales/sales";
import { chip, confirmAction, ledgerCounts, row, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const stockOf = async (id: string) => (await getInventorySnapshot(kit.database)).products.find((product) => product.id === id)!.stockQuantity;

describe("stock count", () => {
  it("“I counted 25 eggs but we have 37”: previews, then really changes the stock and writes a correction", async () => {
    const before = await ledgerCounts(kit.database);
    const preview = await kit.assistant.send("I counted 25 eggs but we have 37");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.kind).toBe("stock_count");
    expect(row(preview, "TallyBook shows")).toBe("37");
    expect(row(preview, "You counted")).toBe("25");
    expect(row(preview, "Difference")).toBe("12 fewer than recorded");
    expect(row(preview, "Stock after")).toBe("37 → 25");
    expect(await stockOf(kit.products.eggs.id)).toBe(37); // a preview changes nothing

    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("success");
    expect(done.text).toBe("Stock corrected: Eggs is now 25 (it was 37).");
    expect(await stockOf(kit.products.eggs.id)).toBe(25);

    const movements = await kit.database.inventoryMovements.where("productId").equals(kit.products.eggs.id).toArray();
    const correction = movements.find((movement) => movement.movementType === "correction")!;
    expect(correction).toMatchObject({ quantityDelta: -12, previousQuantity: 37, resultingQuantity: 25 });
    expect(await ledgerCounts(kit.database)).toEqual(before); // sales, purchases and payments are untouched
  });

  it("the new stock shows up in later answers", async () => {
    await kit.assistant.act(confirmAction(await kit.assistant.send("I counted 25 eggs but we have 37")));
    expect((await kit.assistant.send("How many eggs are left?")).text).toContain("25");
  });

  it("counting more than recorded raises stock", async () => {
    const preview = await kit.assistant.send("I counted 50 eggs");
    expect(row(preview, "Difference")).toBe("13 more than recorded");
    await kit.assistant.act(confirmAction(preview));
    expect(await stockOf(kit.products.eggs.id)).toBe(50);
  });

  it("asks which product when only numbers were given, and keeps the count", async () => {
    const ask = await kit.assistant.send("I counted 25 but we have 37");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("Which product");
    const preview = await kit.assistant.send("eggs");
    expect(row(preview, "You counted")).toBe("25");
    expect(row(preview, "Product")).toBe("Eggs");
  });

  it("asks for the number when only the product was given", async () => {
    const ask = await kit.assistant.send("Recount eggs");
    expect(ask.text).toContain("How many");
    expect(row(await kit.assistant.send("30"), "Difference")).toBe("7 fewer than recorded");
  });

  it("accepts 'none' as a count of zero", async () => {
    await kit.assistant.send("Recount laundry soap");
    const preview = await kit.assistant.send("none");
    expect(row(preview, "You counted")).toBe("0");
    await kit.assistant.act(confirmAction(preview));
    expect(await stockOf(kit.products.soap.id)).toBe(0);
  });

  it("says so, and changes nothing, when the count matches", async () => {
    const reply = await kit.assistant.send("I counted 37 eggs");
    expect(reply.kind).toBe("info");
    expect(reply.text).toContain("nothing to correct");
    expect(await kit.database.inventoryMovements.where("movementType").equals("correction").count()).toBe(0);
  });

  it("uses TallyBook's real figure when the owner's remembered figure is wrong, and says so", async () => {
    const preview = await kit.assistant.send("I counted 25 eggs but the system says 40");
    expect(row(preview, "TallyBook shows")).toBe("37");
    expect(preview.preview?.notes.join(" ")).toContain("You said TallyBook had 40, but it currently shows 37");
  });

  it("understands several ways of saying it", async () => {
    for (const [text, product, shows, counted] of [
      ["counted 3 laundry soap, app says 5", "Laundry soap", "1", "3"],
      ["we only have 15 rice but the system says 20", "Rice", "17", "15"],
      ["set rice stock to 18", "Rice", "17", "18"],
      ["stock count: eggs = 30", "Eggs", "37", "30"],
    ] as const) {
      const preview = await kit.assistant.send(text);
      expect(preview.kind, text).toBe("preview");
      expect([row(preview, "Product"), row(preview, "TallyBook shows"), row(preview, "You counted")], text).toEqual([product, shows, counted]);
      await kit.assistant.send("cancel");
    }
  });

  it("refuses to apply a stale preview if stock moved in the meantime", async () => {
    const preview = await kit.assistant.send("I counted 25 eggs");
    await completeSale({ lines: [{ productId: kit.products.eggs.id, quantity: 1 }], discount: "0", paymentMethod: "cash", amountPaid: "60", currency: "GHS" }, kit.database);
    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("error");
    expect(done.text).toContain("changed from 37 to 36");
    expect(await stockOf(kit.products.eggs.id)).toBe(36);
  });

  it("does nothing until confirmed, and cancel leaves stock alone", async () => {
    await kit.assistant.send("I counted 25 eggs");
    await kit.assistant.send("cancel");
    expect(await stockOf(kit.products.eggs.id)).toBe(37);
  });

  it("offers to add a product it can't find", async () => {
    const reply = await kit.assistant.send("I counted 5 mangoes");
    expect(reply.kind).toBe("error");
    expect(chip(reply, /Add “Mangoes” as a new product/)).toBeDefined();
  });

  it("is not mistaken for a question or a different request", async () => {
    expect((await kit.assistant.send("How many eggs are left?")).kind).toBe("answer");
    expect((await kit.assistant.send("Sell 2 eggs to walk-in customer, paid cash")).preview?.kind).toBe("sale");
  });
});
