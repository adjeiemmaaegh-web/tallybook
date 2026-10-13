/** "Which customers bought eggs this month?" — customers filtered by a product, end to end. */
import { describe, expect, it } from "vitest";
import { completeSale } from "@/features/sales/sales";
import { chip, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
async function sell(productId: string, customerId: string | undefined, quantity: number) {
  const price = (await kit.database.products.get(productId))!.sellingPriceMinor / 100; // paid in full, so the total and the payment always match
  return completeSale({ lines: [{ productId, quantity }], customerId, discount: "0", paymentMethod: "cash", amountPaid: String(price * quantity), currency: "GHS" }, kit.database);
}
const names = (rows?: Array<{ primary: string }>) => rows?.map((row) => row.primary) ?? [];

describe("customers who bought a particular product", () => {
  it("lists only the customers who bought it, and says which product", async () => {
    await sell(kit.products.eggs.id, kit.customers.kwame.id, 2);
    const reply = await kit.assistant.send("Which customers bought eggs today?");
    expect(reply.kind).toBe("answer");
    expect(names(reply.rows)).toEqual(["Kwame Boateng"]);
    expect(reply.text).toContain("bought Eggs");
  });

  it("does not list a customer who bought something else (the seed sold rice to Adwoa on credit)", async () => {
    await sell(kit.products.eggs.id, kit.customers.kwame.id, 2);
    expect(names((await kit.assistant.send("Which customers bought rice today?")).rows)).toEqual(["Adwoa Mensah"]);
    expect(names((await kit.assistant.send("Which customers bought eggs today?")).rows)).not.toContain("Adwoa Mensah");
  });

  it("without a product it still lists everyone who bought", async () => {
    await sell(kit.products.eggs.id, kit.customers.kwame.id, 2);
    expect(names((await kit.assistant.send("Which customers bought today?")).rows).sort()).toEqual(["Adwoa Mensah", "Kwame Boateng"]);
  });

  it("says plainly when nobody bought that product in the period", async () => {
    const reply = await kit.assistant.send("Which customers bought laundry soap today?");
    expect(reply.text).toContain("no sales recorded for Laundry soap");
    expect(reply.rows).toBeUndefined();
  });

  it("an unknown product gets the usual 'add it' offer instead of a wrong list", async () => {
    const reply = await kit.assistant.send("Which customers bought mangoes today?");
    expect(reply.kind).toBe("error");
    expect(chip(reply, /Add “Mangoes” as a new product/)).toBeDefined();
  });

  it("walk-in sales are not listed as customers", async () => {
    await sell(kit.products.eggs.id, undefined, 2);
    const reply = await kit.assistant.send("Which customers bought eggs today?");
    expect(reply.text).toContain("walk-in");
  });
});
