/**
 * Adding customers, suppliers, categories and products by chat — end to end, against the real services and a real (fake-indexeddb) database.
 * Every test checks what was actually stored, and that nothing is stored before the owner confirms.
 */
import { describe, expect, it } from "vitest";
import { getCustomerSnapshot } from "@/features/customers/customers";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { getPurchasesSnapshot } from "@/features/purchases/purchases";
import { chip, confirmAction, row, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const customerCount = async () => (await getCustomerSnapshot(kit.database)).customers.length;

describe("add customer", () => {
  it("asks for the phone number the app requires, shows a preview, and saves only after confirming", async () => {
    const ask = await kit.assistant.send("Add customer Ama Mensah");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("phone number");

    const preview = await kit.assistant.send("0241234567");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.kind).toBe("create_record");
    expect(row(preview, "Name")).toBe("Ama Mensah");
    expect(row(preview, "Phone")).toBe("0241234567");
    expect(await customerCount()).toBe(2); // preview saved nothing

    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("success");
    expect(done.text).toBe("Customer added: Ama Mensah.");
    const saved = (await getCustomerSnapshot(kit.database)).customers.find((customer) => customer.name === "Ama Mensah")!;
    expect(saved).toMatchObject({ phone: "0241234567", status: "active", normalizedName: expect.any(String) });
    expect(typeof saved.id).toBe("string");
    expect(await customerCount()).toBe(3);
  });

  it("goes straight to the preview when the phone is in the same sentence", async () => {
    const preview = await kit.assistant.send("Please add a new customer Kofi Boateng phone 024 123 4567");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Name")).toBe("Kofi Boateng");
    await kit.assistant.act(confirmAction(preview));
    expect((await getCustomerSnapshot(kit.database)).customers.some((customer) => customer.name === "Kofi Boateng")).toBe(true);
  });

  it("asks for the name when none is given", async () => {
    const ask = await kit.assistant.send("add a customer");
    expect(ask.text).toContain("name");
    const preview = await kit.assistant.send("yaa asantewaa 0551234567"); // name and number in one breath
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Name")).toBe("Yaa Asantewaa");
    expect(row(preview, "Phone")).toBe("0551234567");
  });

  it("a new customer works straight away in the other flows", async () => {
    const preview = await kit.assistant.send("Add customer Ama Mensah 0241234567");
    await kit.assistant.act(confirmAction(preview));
    const balance = await kit.assistant.send("How much does Ama owe?");
    expect(balance.kind).toBe("answer");
    expect(balance.text).toContain("Ama Mensah");
  });

  it("never creates a second customer with the same name", async () => {
    const reply = await kit.assistant.send("Add customer Adwoa Mensah");
    expect(reply.kind).toBe("info");
    expect(reply.text).toContain("already have a customer called “Adwoa Mensah”");
    expect(reply.preview).toBeUndefined();
    expect(await customerCount()).toBe(2);
  });

  it("asks before adding someone with a similar name, and then adds them if the owner says so", async () => {
    const ask = await kit.assistant.send("Add customer Adwoa");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("Adwoa Mensah");
    const phone = await kit.assistant.act(chip(ask, /add “Adwoa” as a new customer/));
    expect(phone.text).toContain("phone number");
    const preview = await kit.assistant.send("0201112222");
    await kit.assistant.act(confirmAction(preview));
    expect(await customerCount()).toBe(3);
  });

  it("a typed 'yes' answers the similar-name question", async () => {
    await kit.assistant.send("Add customer Kwame");
    expect((await kit.assistant.send("yes")).text).toContain("phone number");
  });

  it("re-asks for a phone number that is too short, and stops after repeated misses without saving", async () => {
    await kit.assistant.send("Add customer Ama Mensah");
    const again = await kit.assistant.send("12345");
    expect(again.text).toContain("didn't catch that");
    await kit.assistant.send("abc");
    const stopped = await kit.assistant.send("???");
    expect(stopped.text).toContain("Nothing was recorded");
    expect(await customerCount()).toBe(2);
  });

  it("cancelling at the preview saves nothing and the old confirm button is dead", async () => {
    const preview = await kit.assistant.send("Add customer Ama Mensah 0241234567");
    const confirm = confirmAction(preview);
    expect((await kit.assistant.send("cancel")).text).toContain("Nothing was recorded");
    expect((await kit.assistant.act(confirm)).text).toContain("no longer active");
    expect(await customerCount()).toBe(2);
  });
});

describe("add supplier", () => {
  it("previews, then saves through the real supplier service", async () => {
    const preview = await kit.assistant.send("Add supplier Mama Esi Foods");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Name")).toBe("Mama Esi Foods");
    expect((await getPurchasesSnapshot(kit.database)).suppliers).toHaveLength(2);
    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.text).toBe("Supplier added: Mama Esi Foods.");
    expect((await getPurchasesSnapshot(kit.database)).suppliers.map((supplier) => supplier.name)).toContain("Mama Esi Foods");
  });

  it("keeps a phone number given in the sentence", async () => {
    const preview = await kit.assistant.send("new vendor Esi Wholesale phone 0301234567");
    expect(row(preview, "Phone")).toBe("0301234567");
    await kit.assistant.act(confirmAction(preview));
    expect((await getPurchasesSnapshot(kit.database)).suppliers.find((supplier) => supplier.name === "Esi Wholesale")?.phone).toBe("0301234567");
  });

  it("does not duplicate an existing supplier, and a new one can be used for stock straight away", async () => {
    expect((await kit.assistant.send("Add supplier Kofi Traders")).text).toContain("already have a supplier");
    await kit.assistant.act(confirmAction(await kit.assistant.send("Add supplier Mama Esi Foods")));
    const receipt = await kit.assistant.send("I received 5 eggs from Mama Esi Foods at 40 each");
    expect(receipt.kind).toBe("preview");
  });
});

describe("add category", () => {
  it("creates a real category the Stock page can use", async () => {
    const preview = await kit.assistant.send("Add category Drinks");
    expect(preview.kind).toBe("preview");
    expect((await getInventorySnapshot(kit.database)).categories).toHaveLength(0);
    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.text).toBe("Category added: Drinks.");
    const categories = (await getInventorySnapshot(kit.database)).categories;
    expect(categories.map((category) => category.name)).toEqual(["Drinks"]);
    expect(typeof categories[0].id).toBe("string");
  });

  it("does not add the same category twice", async () => {
    await kit.assistant.act(confirmAction(await kit.assistant.send("Add category Drinks")));
    expect((await kit.assistant.send("new category drinks")).text).toContain("already have a category");
    expect((await getInventorySnapshot(kit.database)).categories).toHaveLength(1);
  });
});

describe("add product", () => {
  it("asks for the selling price, then saves a real product with the stock history the app creates", async () => {
    const ask = await kit.assistant.send("Add product Palm oil");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("selling price");

    const preview = await kit.assistant.send("12.50");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Name")).toBe("Palm oil");
    expect(row(preview, "Selling price")).toContain("12.50");
    expect(row(preview, "Opening stock")).toBe("0");
    expect(row(preview, "Category")).toBe("Uncategorized");
    expect((await getInventorySnapshot(kit.database)).products).toHaveLength(3);

    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.text).toBe("Product added: Palm oil.");
    const product = (await getInventorySnapshot(kit.database)).products.find((item) => item.name === "Palm oil")!;
    expect(product).toMatchObject({ sellingPriceMinor: 1250, stockQuantity: 0, lowStockThreshold: 0 });
    expect(typeof product.id).toBe("string");
  });

  it("takes price, opening stock, cost and low-stock level from one sentence", async () => {
    const preview = await kit.assistant.send("Add product Sugar, selling price 8, cost 6, 40 in stock, low stock at 10");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Opening stock")).toBe("40");
    expect(row(preview, "Low-stock level")).toBe("10");
    expect(row(preview, "Cost price")).toContain("6.00");
    await kit.assistant.act(confirmAction(preview));
    const product = (await getInventorySnapshot(kit.database)).products.find((item) => item.name === "Sugar")!;
    expect(product).toMatchObject({ sellingPriceMinor: 800, costPriceMinor: 600, stockQuantity: 40, lowStockThreshold: 10 });
    const movements = await kit.database.inventoryMovements.where("productId").equals(product.id).toArray();
    expect(movements.reduce((sum, movement) => sum + movement.quantityDelta, 0)).toBe(40);
  });

  it("uses an existing category by name", async () => {
    await kit.assistant.act(confirmAction(await kit.assistant.send("Add category Drinks")));
    const preview = await kit.assistant.send("Add product Cola price 5 in category drinks");
    expect(row(preview, "Category")).toBe("Drinks");
    await kit.assistant.act(confirmAction(preview));
    const snapshot = await getInventorySnapshot(kit.database);
    expect(snapshot.products.find((item) => item.name === "Cola")?.categoryId).toBe(snapshot.categories[0].id);
  });

  it("offers choices when the named category doesn't exist, instead of failing", async () => {
    const ask = await kit.assistant.send("Add product Bread price 3.50 category Bakery");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("“Bakery”");
    const preview = await kit.assistant.act(chip(ask, "Leave uncategorized"));
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Category")).toBe("Uncategorized");
  });

  it("re-asks a price the currency can't hold and never saves a zero price", async () => {
    await kit.assistant.send("Add product Salt");
    expect((await kit.assistant.send("0")).text).toContain("didn't catch");
    expect((await getInventorySnapshot(kit.database)).products.some((product) => product.name === "Salt")).toBe(false);
  });

  it("never creates a second product with the same name; asks about a similar one", async () => {
    expect((await kit.assistant.send("Add product Eggs")).text).toContain("already have a product called “Eggs”");
    const similar = await kit.assistant.send("Add product Egg");
    expect(similar.kind).toBe("question");
    expect(similar.text).toContain("Eggs");
    expect((await getInventorySnapshot(kit.database)).products).toHaveLength(3);
  });

  it("a new product can be sold once stock is added", async () => {
    await kit.assistant.act(confirmAction(await kit.assistant.send("Add product Bread price 3, 10 in stock")));
    const sale = await kit.assistant.send("Sell 2 bread to walk-in customer, paid cash");
    expect(sale.kind).toBe("preview");
    expect(row(sale, "Total")).toContain("6.00");
  });
});
