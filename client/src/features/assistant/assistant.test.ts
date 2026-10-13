/**
 * Tallybook Assistant integration tests.
 *
 * Nothing here is mocked: the assistant runs against a real TallybookDB (fake-indexeddb) and the real completeSale / completePurchase /
 * recordRepayment / report services. Assertions look at what those services actually stored.
 */
import Dexie from "dexie";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TallybookDB, initializeDatabase } from "@/db/TallybookDB";
import { saveBusinessProfile } from "@/features/business/businessProfile";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { getCustomerDebtSummary, recordRepayment } from "@/features/credit/credit";
import { createCustomer } from "@/features/customers/customers";
import { createProduct, formatMinorAmount, getInventorySnapshot } from "@/features/inventory/inventory";
import { addMobileMoneyProvider } from "@/features/payments/mobileMoney";
import { completePurchase, createSupplier } from "@/features/purchases/purchases";
import { getReportsSnapshot } from "@/features/reports/reports";
import { completeSale } from "@/features/sales/sales";
import { createAssistant, type Assistant } from "./assistant";
import type { AssistantAction, AssistantReply } from "./index";

const names = new Set<string>();
const opened: Dexie[] = [];
let sequence = 0;
let database: TallybookDB;
let assistant: Assistant;
let products: Record<"eggs" | "rice" | "soap", { id: string }>;
let customers: Record<"adwoa" | "kwame", { id: string }>;

const ghs = (minor: number) => formatMinorAmount(minor, "GHS");
const chip = (reply: AssistantReply, label: RegExp | string): AssistantAction => {
  const found = reply.actions?.find((action) => (typeof label === "string" ? action.label === label : label.test(action.label)));
  if (!found) throw new Error(`No action “${String(label)}” in: ${JSON.stringify(reply.actions?.map((action) => action.label))}`);
  return found;
};

async function counts() {
  return { sales: await database.sales.count(), saleLines: await database.saleLines.count(), payments: await database.payments.count(), purchases: await database.purchases.count(), repayments: await database.repayments.count(), movements: await database.inventoryMovements.count(), receipts: await database.receipts.count() };
}
async function stock(id: string) { return (await database.products.get(id))!.stockQuantity; }

async function seed(target: TallybookDB) {
  await saveBusinessProfile({ name: "Test Shop", country: "Ghana", currency: "GHS", businessType: "Retail shop", phone: "", email: "", address: "" }, target);
  const product = (name: string, price: string, stockQuantity: string, cost = "") => createProduct({ name, sku: "", categoryId: "uncategorized", sellingPrice: price, costPrice: cost, initialStock: stockQuantity, lowStockThreshold: "5" }, "GHS", target);
  const eggs = await product("Eggs", "60.00", "37", "45.00");
  const rice = await product("Rice", "150.00", "20");
  const soap = await product("Laundry soap", "12.50", "1");
  const adwoa = await createCustomer({ name: "Adwoa Mensah", phone: "0244000001", email: "", address: "", notes: "", status: "active" }, target);
  const kwame = await createCustomer({ name: "Kwame Boateng", phone: "0244000002", email: "", address: "", notes: "", status: "active" }, target);
  await createSupplier({ name: "Kofi Traders", phone: "", email: "", address: "", notes: "" }, target);
  await createSupplier({ name: "ABC Suppliers", phone: "", email: "", address: "", notes: "" }, target);
  // Adwoa owes GHS 450.00 from a real credit sale: 3 × 150.00.
  await completeSale({ lines: [{ productId: rice.id, quantity: 3 }], customerId: adwoa.id, discount: "0", paymentMethod: "credit", amountPaid: "0", currency: "GHS" }, target);
  products = { eggs, rice, soap }; customers = { adwoa, kwame };
}

beforeEach(async () => {
  setActiveBusinessProfileId("primary");
  database = new TallybookDB(`tallybook-assistant-test-${Date.now()}-${++sequence}`);
  names.add(database.name); opened.push(database);
  await initializeDatabase(database);
  await seed(database);
  assistant = createAssistant({ currency: "GHS", database });
});

afterEach(async () => {
  setActiveBusinessProfileId("primary");
  opened.splice(0).forEach((item) => item.close());
  await Promise.all(Array.from(names).map((name) => new Dexie(name).delete()));
  names.clear();
});

describe("customer balance (real credit records)", () => {
  it.each(["How much does Adwoa owe?", "Adwoa owes how much?", "Show Adwoa's balance."])("%s", async (text) => {
    const reply = await assistant.send(text);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toBe(`Adwoa Mensah currently owes ${ghs(45000)}.`);
  });

  it("follows real repayments, because it uses the same debt service as the Customers page", async () => {
    await recordRepayment({ customerId: customers.adwoa.id, amount: "100.00", method: "cash", currency: "GHS" }, database);
    expect((await assistant.send("How much does Adwoa owe?")).text).toBe(`Adwoa Mensah currently owes ${ghs(35000)}.`);
    expect((await assistant.send("Adwoa owes how much?")).details?.find((detail) => detail.label === "Repaid so far")?.value).toBe(ghs(10000));
  });

  it("says so plainly when nothing is owed, and never invents a number for an unknown customer", async () => {
    expect((await assistant.send("How much does Kwame owe?")).text).toBe("Kwame Boateng has no outstanding balance.");
    const missing = await assistant.send("How much does Efua owe?");
    expect(missing.kind).toBe("error");
    expect(missing.text).toContain("couldn't find a customer named “Efua”");
    expect(missing.text).not.toMatch(/GHS/);
  });

  it("asks which customer when a first name is ambiguous, then answers for the one chosen", async () => {
    const second = await createCustomer({ name: "Adwoa Boateng", phone: "0244000003", email: "", address: "", notes: "", status: "active" }, database);
    const question = await assistant.send("How much does Adwoa owe?");
    expect(question.kind).toBe("question");
    expect(question.text).toContain("2 customers");
    expect(question.actions?.filter((action) => action.type === "fill")).toHaveLength(2);
    const chosen = await assistant.act(chip(question, /Adwoa Mensah/));
    expect(chosen.text).toBe(`Adwoa Mensah currently owes ${ghs(45000)}.`);
    expect(second.id).not.toBe(customers.adwoa.id);
  });

  it("offers a suggestion for a small typo instead of silently accepting it", async () => {
    const suggestion = await assistant.send("How much does Adwua owe?");
    expect(suggestion.kind).toBe("question");
    expect(suggestion.text).toContain("Did you mean Adwoa Mensah?");
    expect((await assistant.act(chip(suggestion, /Adwoa Mensah/))).text).toContain("currently owes");
  });

  it("asks whose balance when no name was given", async () => {
    const reply = await assistant.send("What is the balance?");
    expect(reply.kind).toBe("question");
    expect((await assistant.send("Adwoa")).text).toContain("currently owes");
  });
});

describe("inventory (real stock)", () => {
  it.each(["How many crates of eggs are left?", "Egg stock?", "How much eggs do we have?", "How many eggs are in stock?"])("%s", async (text) => {
    const reply = await assistant.send(text);
    expect(reply.kind).toBe("answer");
    expect(reply.text).toBe("Eggs: 37 in stock.");
  });

  it("does not claim eggs are counted in crates, because TallyBook stores no units", async () => {
    const reply = await assistant.send("How many crates of eggs are left?");
    expect(reply.moreText).toContain("does not have a verified unit");
    expect(reply.moreText).toContain("can't confirm a crate conversion");
    expect((await assistant.send("How many eggs are left?")).moreText).toBeUndefined();
  });

  it("reflects stock changes made by the real sale service", async () => {
    await completeSale({ lines: [{ productId: products.eggs.id, quantity: 5 }], discount: "0", paymentMethod: "cash", amountPaid: "300.00", currency: "GHS" }, database);
    expect((await assistant.send("Egg stock?")).text).toBe("Eggs: 32 in stock.");
  });

  it("lists every matching product when several match equally well, and reports unknown or out-of-stock items honestly", async () => {
    // Neither name is an exact match for "eggs", so both tie and the assistant lists both instead of guessing.
    await createProduct({ name: "Eggs (large)", sku: "", categoryId: "uncategorized", sellingPrice: "70.00", costPrice: "", initialStock: "9", lowStockThreshold: "5" }, "GHS", database);
    await createProduct({ name: "Eggs (small)", sku: "", categoryId: "uncategorized", sellingPrice: "40.00", costPrice: "", initialStock: "0", lowStockThreshold: "5" }, "GHS", database);
    await database.products.where("name").equals("Eggs").modify({ name: "Chicken", normalizedName: "chicken" });
    const many = await assistant.send("How many eggs do we have?");
    expect(many.rows?.map((row) => `${row.primary}: ${row.amount}`)).toEqual(["Eggs (large): 9 in stock", "Eggs (small): Out of stock"]);
    const none = await assistant.send("How many bananas are left?");
    expect(none.kind).toBe("error");
    expect(none.text).toContain("couldn't find a product named “Bananas”");
  });

  it("flags low stock using TallyBook's own rule", async () => {
    expect((await assistant.send("How many laundry soap are left?")).details?.some((detail) => detail.label === "Low-stock level")).toBe(true);
  });
});

describe("sales questions (same numbers as the Reports page)", () => {
  async function sellEggs(quantity: number, when?: Date) {
    const result = await completeSale({ lines: [{ productId: products.eggs.id, quantity }], discount: "0", paymentMethod: "cash", amountPaid: (quantity * 60).toFixed(2), currency: "GHS" }, database);
    if (when) { await database.sales.update(result.sale.id, { createdAt: when.toISOString() }); await database.payments.where("saleId").equals(result.sale.id).modify({ createdAt: when.toISOString() }); }
    return result;
  }

  // The seeded credit sale to Adwoa (GHS 450.00) was created "today", so every today-total already includes it.
  it.each(["Show today's sales.", "How much did we sell today?", "What are today's sales?", "Show sales for today."])("%s", async (text) => {
    await sellEggs(2); await sellEggs(1);
    const reply = await assistant.send(text);
    const report = await getReportsSnapshot("today", new Date(), database);
    expect(report.totals.transactionCount).toBe(3);
    expect(report.totals.salesMinor).toBe(45000 + 18000);
    expect(reply.text).toBe(`Today: 3 sales totalling ${ghs(report.totals.salesMinor)}.`);
    expect(reply.details).toContainEqual({ label: "Money collected", value: ghs(report.totals.receivedMinor) });
    expect(reply.rows).toHaveLength(3);
  });

  it("includes today's credit sale in the total but shows it as unpaid", async () => {
    const reply = await assistant.send("Show today's sales");
    expect(reply.text).toBe(`Today: 1 sale totalling ${ghs(45000)}.`);
    expect(reply.rows?.[0].secondary).toContain("unpaid");
  });

  it("answers for yesterday using the same report function, not new arithmetic", async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(10, 0, 0, 0);
    await sellEggs(4, yesterday);
    const reply = await assistant.send("How much did we sell yesterday?");
    expect(reply.text).toContain(`1 sale totalling ${ghs(24000)}`);
    expect((await assistant.send("Show today's sales")).text).toBe(`Today: 1 sale totalling ${ghs(45000)}.`);
  });

  it("supports the last 7 days, and says plainly that 'this week' means those 7 days", async () => {
    const old = new Date(); old.setDate(old.getDate() - 3); await sellEggs(1, old);
    expect((await assistant.send("Show sales for the last 7 days")).text).toContain("2 sales");
    const week = await assistant.send("What did we sell this week?");
    expect(week.text).toMatch(/This week|this week/);
  });

  it("reports an empty day without inventing a total", async () => {
    const reply = await assistant.send("Show sales for last Monday");
    expect(reply.text).toMatch(/no sales recorded/);
  });

  it("refuses filters and periods it cannot honour rather than answering a different question", async () => {
    const byProduct = await assistant.send("How many eggs did we sell today?");
    expect(byProduct.kind).toBe("question");
    expect(byProduct.text).toContain("can't filter");
    expect(byProduct.text).not.toMatch(/GHS/);
    expect((await assistant.send("Show sales for last quarter")).text).toContain("Last quarter");
    expect((await assistant.send("Show sales")).text).toContain("Which period");
  });
});

describe("recording a sale", () => {
  it("prepares a preview without writing anything, then saves through completeSale after confirmation", async () => {
    const before = await counts();
    const preview = await assistant.send("Record 2 crates of eggs sold to walk-in customer, paid cash.");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.rows).toEqual(expect.arrayContaining([
      { label: "Product", value: "Eggs" }, { label: "Quantity", value: "2 crates" }, { label: "Total", value: ghs(12000) },
      { label: "Customer", value: "Walk-in customer" }, { label: "Payment", value: "Cash — paid in full" },
    ]));
    expect(await counts()).toEqual(before);
    expect(await stock(products.eggs.id)).toBe(37);

    const saved = await assistant.act(chip(preview, "Confirm sale"));
    expect(saved.kind).toBe("success");
    expect(saved.text).toBe(`Sale recorded: 2 × Eggs for ${ghs(12000)}.`);
    const after = await counts();
    expect(after).toEqual({ ...before, sales: before.sales + 1, saleLines: before.saleLines + 1, payments: before.payments + 1, receipts: before.receipts + 1, movements: before.movements + 1 });
    expect(await stock(products.eggs.id)).toBe(35);

    const sale = (await database.sales.orderBy("createdAt").last())!;
    expect(sale).toMatchObject({ totalMinor: 12000, amountPaidMinor: 12000, outstandingMinor: 0, paymentMethod: "cash", customerId: undefined });
    expect(sale.receiptNumber).toMatch(/^TB-\d{8}-[A-Z0-9_]{5}$/);
    const movement = (await database.inventoryMovements.where("productId").equals(products.eggs.id).toArray()).find((item) => item.movementType === "sale")!;
    expect(movement).toMatchObject({ quantityDelta: -2, previousQuantity: 37, resultingQuantity: 35, note: `Sale ${sale.receiptNumber}` });
    expect(saved.details).toContainEqual({ label: "Eggs left", value: "35" });
  });

  it("uses TallyBook's saved price and never a price typed in the sentence", async () => {
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer at 10 each, paid cash");
    expect(preview.preview?.rows).toContainEqual({ label: "Total", value: ghs(12000) });
    expect(preview.preview?.notes.join(" ")).toContain("I don't set prices");
    await assistant.act(chip(preview, "Confirm sale"));
    expect((await database.sales.orderBy("createdAt").last())!.totalMinor).toBe(12000);
  });

  it("records a named customer's cash sale", async () => {
    const preview = await assistant.send("Sell 3 crates of eggs to Adwoa, paid cash.");
    expect(preview.preview?.rows).toContainEqual({ label: "Customer", value: "Adwoa Mensah" });
    await assistant.act(chip(preview, "Confirm sale"));
    const sale = (await database.sales.orderBy("createdAt").last())!;
    expect(sale).toMatchObject({ customerId: customers.adwoa.id, totalMinor: 18000, outstandingMinor: 0 });
    expect((await getCustomerDebtSummary(customers.adwoa.id, "GHS", database)).outstandingMinor).toBe(45000);
  });

  it("records a credit sale and the customer's real balance rises", async () => {
    const preview = await assistant.send("I sold 5 bags of rice to Kwame on credit.");
    expect(preview.preview?.rows).toContainEqual({ label: "Payment", value: expect.stringContaining("On credit") });
    await assistant.act(chip(preview, "Confirm sale"));
    expect((await getCustomerDebtSummary(customers.kwame.id, "GHS", database)).outstandingMinor).toBe(75000);
    expect((await assistant.send("How much does Kwame owe?")).text).toBe(`Kwame Boateng currently owes ${ghs(75000)}.`);
  });

  it("supports part payment for a named customer", async () => {
    const preview = await assistant.send("Sell 3 crates of eggs to Kwame, paid 100 cedis cash");
    expect(preview.preview?.rows).toContainEqual({ label: "Payment", value: expect.stringContaining(`${ghs(8000)} still owed`) });
    await assistant.act(chip(preview, "Confirm sale"));
    expect((await getCustomerDebtSummary(customers.kwame.id, "GHS", database)).outstandingMinor).toBe(8000);
  });

  it("does not record a sale that exceeds stock; it offers what can be done instead, and writes nothing", async () => {
    const before = await counts();
    const reply = await assistant.send("Sell 2 laundry soap to walk-in customer, paid cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain("TallyBook shows only 1 Laundry soap, but you asked for 2");
    expect(reply.actions?.map((action) => action.label)).toEqual(["Sell the 1 I have", "Receive more Laundry soap", "Recount Laundry soap", "Cancel"]);
    expect(await counts()).toEqual(before);
    expect((await assistant.send("Sell 50 crates of eggs to walk-in customer, paid cash")).text).toContain("TallyBook shows only 37 Eggs");
    expect(await counts()).toEqual(before);
  });

  it("rejects unknown products and customers, without offering to create them", async () => {
    const before = await counts();
    expect((await assistant.send("Sell 2 crates of bananas to walk-in customer, paid cash")).text).toContain("couldn't find a product named “Bananas”");
    const customer = await assistant.send("Sell 2 crates of eggs to Efua, paid cash");
    expect(customer.text).toContain("couldn't find a customer named “Efua”");
    expect(customer.link?.href).toBe("/customers");
    expect(await counts()).toEqual(before);
  });

  it("asks which product when several match equally well", async () => {
    // Neither name is an exact match for "eggs", so the assistant must ask rather than pick one.
    await createProduct({ name: "Eggs (large)", sku: "", categoryId: "uncategorized", sellingPrice: "70.00", costPrice: "", initialStock: "9", lowStockThreshold: "5" }, "GHS", database);
    await createProduct({ name: "Eggs (small)", sku: "", categoryId: "uncategorized", sellingPrice: "40.00", costPrice: "", initialStock: "9", lowStockThreshold: "5" }, "GHS", database);
    await database.products.where("name").equals("Eggs").modify({ name: "Chicken", normalizedName: "chicken" });
    const ask = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("more than one product");
    const preview = await assistant.act(chip(ask, /Eggs \(small\)/));
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.rows).toContainEqual({ label: "Product", value: "Eggs (small)" });
  });

  it("refuses credit for a walk-in and asks for a name, then completes", async () => {
    const ask = await assistant.send("Sell 2 crates of eggs to walk-in customer on credit");
    expect(ask.kind).toBe("question");
    expect(ask.text).toContain("named customer");
    expect(ask.actions?.some((action) => action.label === "Walk-in customer")).toBe(false);
    const preview = await assistant.send("Kwame");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.rows).toContainEqual({ label: "Customer", value: "Kwame Boateng" });
  });

  it("collects missing details step by step instead of guessing", async () => {
    const first = await assistant.send("record a sale");
    expect(first.kind).toBe("question");
    expect(first.text).toContain("What did you sell");
    const second = await assistant.send("2 crates of eggs");
    expect(second.text).toContain("who it was sold to");
    const third = await assistant.act(chip(second, "Walk-in customer"));
    expect(third.text).toContain("paid in cash");
    const preview = await assistant.act(chip(third, "Cash"));
    expect(preview.kind).toBe("preview");
    expect(await database.sales.count()).toBe(1);
  });

  it("asks for a quantity when it is missing", async () => {
    const reply = await assistant.send("Sell eggs to walk-in customer, paid cash");
    expect(reply.text).toBe("How many Eggs should I record?");
    expect((await assistant.send("4")).kind).toBe("preview");
  });

  it("does not guess anything for 'sell something'", async () => {
    const before = await counts();
    const reply = await assistant.send("sell something");
    expect(reply.kind).toBe("question");
    expect(await counts()).toEqual(before);
  });

  it("refuses discounts and unsupported currencies", async () => {
    expect((await assistant.send("Sell 2 crates of eggs to Kwame with a discount, cash")).text).toContain("can't apply discounts");
    expect((await assistant.send("Sell 2 crates of eggs to Kwame for 100 dollars, cash")).kind).toBe("preview");
    const rejected = await assistant.send("Sell 2 crates of eggs to Kwame, paid 100 dollars cash");
    expect(rejected.kind).toBe("error");
    expect(rejected.text).toContain("can't convert between currencies");
  });

  it("rejects fractional quantities", async () => {
    expect((await assistant.send("Sell 2.5 crates of eggs to walk-in customer, paid cash")).text).toContain("whole quantities only");
  });

  it("handles mobile money using the owner's own configured provider", async () => {
    const none = await assistant.send("Sell 1 crate of eggs to walk-in customer, paid momo");
    expect(none.kind).toBe("error");
    expect(none.link?.href).toBe("/business");
    await addMobileMoneyProvider({ name: "MTN MoMo" }, database);
    const preview = await assistant.send("Sell 1 crate of eggs to walk-in customer, paid momo");
    expect(preview.preview?.rows).toContainEqual({ label: "Provider", value: "MTN MoMo" });
    await assistant.act(chip(preview, "Confirm sale"));
    expect((await database.payments.orderBy("createdAt").last())).toMatchObject({ method: "mobile", mobileMoneyProviderName: "MTN MoMo" });
  });

  it("warns that units are not stored, because 'crates' cannot be verified", async () => {
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    expect(preview.preview?.notes.join(" ")).toContain("stores no units");
    expect((await assistant.send("Sell 2 eggs to walk-in customer, paid cash")).preview?.notes).toEqual([]);
  });
});

describe("confirmation safety", () => {
  it("cancelling records nothing, and a stale confirm button does nothing", async () => {
    const before = await counts();
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    const confirm = chip(preview, "Confirm sale");
    expect((await assistant.act({ type: "cancel", label: "Cancel" })).text).toContain("Nothing was recorded");
    expect((await assistant.act(confirm)).kind).toBe("info");
    expect(await counts()).toEqual(before);
  });

  it("pressing confirm twice records exactly one sale", async () => {
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    const confirm = chip(preview, "Confirm sale");
    const [first, second] = await Promise.all([assistant.act(confirm), assistant.act(confirm)]);
    expect([first.kind, second.kind].sort()).toEqual(["info", "success"]);
    expect(await database.sales.count()).toBe(2);
    expect(await stock(products.eggs.id)).toBe(35);
  });

  it("a new command replaces the old preview, and the old confirm button no longer works", async () => {
    const first = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    const second = await assistant.send("Sell 1 crate of eggs to walk-in customer, paid cash");
    expect(second.notice).toContain("earlier preview was dropped");
    expect((await assistant.act(chip(first, "Confirm sale"))).kind).toBe("info");
    expect(await database.sales.count()).toBe(1);
    await assistant.act(chip(second, "Confirm sale"));
    expect(await stock(products.eggs.id)).toBe(36);
  });

  it("typed 'yes' confirms only when the preview was the last thing shown", async () => {
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    await assistant.send("How many eggs are left?");
    const refused = await assistant.send("yes");
    expect(refused.kind).toBe("info");
    expect(await database.sales.count()).toBe(1);
    expect(preview.kind).toBe("preview");

    await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    expect((await assistant.send("yes")).kind).toBe("success");
    expect(await database.sales.count()).toBe(2);
  });

  it("'no' cancels a preview", async () => {
    await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    expect((await assistant.send("no")).text).toContain("Cancelled");
    expect(await database.sales.count()).toBe(1);
  });

  it("refuses to save if the owner switched company after the preview", async () => {
    const preview = await assistant.send("Sell 2 crates of eggs to walk-in customer, paid cash");
    setActiveBusinessProfileId("another-company");
    const reply = await assistant.act(chip(preview, "Confirm sale"));
    expect(reply.kind).toBe("error");
    expect(reply.text).toContain("switched business");
    setActiveBusinessProfileId("primary");
    expect(await database.sales.count()).toBe(1);
    expect(await stock(products.eggs.id)).toBe(37);
  });

  it("reports a real service failure and saves nothing (stock sold elsewhere after the preview)", async () => {
    const preview = await assistant.send("Sell 30 crates of eggs to walk-in customer, paid cash");
    await completeSale({ lines: [{ productId: products.eggs.id, quantity: 20 }], discount: "0", paymentMethod: "cash", amountPaid: "1200.00", currency: "GHS" }, database);
    const before = await counts();
    const reply = await assistant.act(chip(preview, "Confirm sale"));
    expect(reply.kind).toBe("error");
    expect(reply.text).toContain("Nothing was saved");
    expect(await counts()).toEqual(before);
  });
});

describe("receiving stock", () => {
  it("previews with the product's saved cost, then records through completePurchase", async () => {
    const before = await counts();
    const preview = await assistant.send("I received 10 crates of eggs from Kofi Traders.");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.rows).toEqual(expect.arrayContaining([
      { label: "Supplier", value: "Kofi Traders" }, { label: "Quantity", value: "10 crates" },
      { label: "Cost each", value: `${ghs(4500)} (saved cost price)` }, { label: "Total cost", value: ghs(45000) }, { label: "Stock after", value: "37 → 47" },
    ]));
    expect(preview.preview?.notes.join(" ")).toContain("saved on Eggs");
    expect(await counts()).toEqual(before);

    const saved = await assistant.act(chip(preview, "Confirm stock receipt"));
    expect(saved.kind).toBe("success");
    expect(saved.details).toContainEqual({ label: "Eggs in stock now", value: "47" });
    expect(await stock(products.eggs.id)).toBe(47);
    const purchase = (await database.purchases.toArray())[0];
    expect(purchase).toMatchObject({ supplierName: "Kofi Traders", totalCostMinor: 45000 });
    const movement = (await database.inventoryMovements.toArray()).find((item) => item.purchaseId === purchase.id)!;
    expect(movement).toMatchObject({ movementType: "purchase", quantityDelta: 10, resultingQuantity: 47 });
  });

  it("uses a stated cost, and never invents one when none exists", async () => {
    // The seeded credit sale already took 3 rice off the shelf, so rice starts this test at 20 - 3 = 17.
    const stated = await assistant.send("Record 20 bags of rice received from ABC Suppliers at 120 each");
    expect(stated.preview?.rows).toContainEqual({ label: "Cost each", value: ghs(12000) });
    await assistant.act({ type: "cancel", label: "Cancel" });

    const unknownCost = await assistant.send("Record 20 bags of rice received from ABC Suppliers.");
    expect(unknownCost.kind).toBe("question");
    expect(unknownCost.text).toContain("needs a cost");
    const preview = await assistant.send("125 each");
    expect(preview.preview?.rows).toContainEqual({ label: "Total cost", value: ghs(250000) });
    await assistant.act(chip(preview, "Confirm stock receipt"));
    expect(await stock(products.rice.id)).toBe(37);
  });

  it("splits a stated total across the quantity only when it divides evenly", async () => {
    expect((await assistant.send("Received 10 crates of eggs from Kofi Traders for 250 total")).preview?.rows).toContainEqual({ label: "Cost each", value: ghs(2500) });
    expect((await assistant.send("Received 3 crates of eggs from Kofi Traders for 100 total")).text).toContain("doesn't divide evenly");
  });

  it("lets the owner correct the proposed cost on the preview", async () => {
    const preview = await assistant.send("I received 10 crates of eggs from Kofi Traders.");
    const changed = await assistant.send("48 each");
    expect(changed.preview?.rows).toContainEqual({ label: "Cost each", value: ghs(4800) });
    expect(changed.preview?.token).not.toBe(preview.preview?.token);
    expect((await assistant.act(chip(preview, "Confirm stock receipt"))).kind).toBe("info");
    await assistant.act(chip(changed, "Confirm stock receipt"));
    expect((await database.purchases.toArray())[0].totalCostMinor).toBe(48000);
  });

  it("accepts a past date but not a future one", async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const preview = await assistant.send("I received 10 crates of eggs from Kofi Traders yesterday");
    await assistant.act(chip(preview, "Confirm stock receipt"));
    const stored = (await database.purchases.toArray())[0].purchaseDate;
    expect(stored).toBe(new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(yesterday));
    expect((await assistant.send("I received 10 crates of eggs from Kofi Traders on 2099-01-01")).text).toContain("received today or on an earlier day");
  });

  it("rejects unknown suppliers or products and never creates them", async () => {
    const before = await counts();
    const supplier = await assistant.send("I received 10 crates of eggs from Nobody Ltd.");
    expect(supplier.text).toContain("couldn't find a supplier named “Nobody Ltd”");
    expect(supplier.link?.href).toBe("/purchases");
    expect((await assistant.send("I received 10 crates of bananas from Kofi Traders")).text).toContain("couldn't find a product");
    expect(await counts()).toEqual(before);
    expect(await database.suppliers.count()).toBe(2);
  });

  it("asks which supplier when one is not given", async () => {
    const ask = await assistant.send("I received 10 crates of eggs");
    expect(ask.text).toContain("Which supplier");
    expect((await assistant.send("Kofi Traders")).kind).toBe("preview");
  });

  it("answers what was received, and says supplier balances are not tracked", async () => {
    await completePurchase({ supplierId: (await database.suppliers.toArray()).find((supplier) => supplier.name === "Kofi Traders")!.id, purchaseDate: "2026-09-01", note: "", lines: [{ productId: products.eggs.id, quantity: "10", unitCost: "45.00" }] }, "GHS", database);
    const received = await assistant.send("What did we receive from Kofi Traders?");
    expect(received.text).toContain("1 purchase recorded");
    expect(received.rows?.[0]).toMatchObject({ secondary: "10 × Eggs", amount: ghs(45000) });
    expect((await assistant.send("What did we receive from ABC Suppliers?")).text).toBe("No purchases are recorded from ABC Suppliers yet.");
    const owed = await assistant.send("How much do we owe Kofi Traders?");
    expect(owed.kind).toBe("unsupported");
    expect(owed.text).toContain("doesn't track what you owe suppliers");
    expect(owed.text).not.toMatch(/GHS\s?\d/);
  });
});

describe("customer payments", () => {
  it("asks for the method, previews the balance change, and records through recordRepayment", async () => {
    const ask = await assistant.send("Adwoa paid 100 cedis.");
    expect(ask.kind).toBe("question");
    const preview = await assistant.act(chip(ask, "Cash"));
    expect(preview.preview?.rows).toEqual(expect.arrayContaining([{ label: "Owes now", value: ghs(45000) }, { label: "Would owe after", value: ghs(35000) }]));
    expect(await database.repayments.count()).toBe(0);
    const saved = await assistant.act(chip(preview, "Confirm payment"));
    expect(saved.text).toBe(`Payment recorded: Adwoa Mensah paid ${ghs(10000)}.`);
    expect(saved.details).toContainEqual({ label: "Now owes", value: ghs(35000) });
    expect(await database.repayments.count()).toBe(1);
    expect((await assistant.send("Adwoa owes how much?")).text).toContain(ghs(35000));
  });

  it("accepts the method in the sentence", async () => {
    const preview = await assistant.send("Record 200 GHS payment from Adwoa by momo");
    expect(preview.preview?.rows).toContainEqual({ label: "Method", value: "Mobile Money" });
  });

  it("rejects overpayment, customers with no debt, and other currencies", async () => {
    expect((await assistant.send("Adwoa paid 500 cedis by cash")).text).toContain(`owes ${ghs(45000)}`);
    expect((await assistant.send("Kwame paid 50 cedis by cash")).text).toContain("no outstanding balance");
    expect((await assistant.send("Adwoa paid 50 dollars by cash")).text).toContain("can't convert between currencies");
    expect(await database.repayments.count()).toBe(0);
  });

  it("asks which customer paid when a pronoun is used, then completes from a bare name", async () => {
    const ask = await assistant.send("She paid 100 cedis by cash");
    expect(ask.text).toContain("Which customer");
    expect((await assistant.send("Adwoa")).kind).toBe("preview");
  });

  it("asks how much when only the customer and method are given", async () => {
    const ask = await assistant.send("Adwoa made a cash payment");
    expect(ask.text).toContain("How much");
    expect((await assistant.send("100")).kind).toBe("preview");
  });

  it("treats 'received 100 from Adwoa' as ambiguous and asks", async () => {
    const reply = await assistant.send("Received 100 from Adwoa");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain("customer pay you money, or did you receive stock");
    expect(await database.repayments.count()).toBe(0);
  });
});

describe("ambiguity, unsupported input, and read-only guarantees", () => {
  it("offers choices for a bare name rather than guessing an action", async () => {
    const customer = await assistant.send("Adwoa");
    expect(customer.kind).toBe("question");
    expect(customer.actions?.map((action) => action.label)).toEqual(expect.arrayContaining(["Adwoa Mensah's balance"]));
    const product = await assistant.send("eggs");
    expect(product.kind).toBe("question");
    expect(product.actions?.map((action) => action.label)).toEqual(expect.arrayContaining(["Eggs stock", "Sell Eggs"]));
    expect((await assistant.act(chip(product, "Eggs stock"))).text).toBe("Eggs: 37 in stock.");
  });

  it("says it does not support unrelated or unsafe requests, and touches nothing", async () => {
    const before = await counts();
    for (const text of ["What is the capital of France?", "Tell me a joke", "asdf qwerty", "<script>alert(1)</script>", "Delete the last sale", "Clear Adwoa's balance", "Add a new customer called Ama"]) {
      const reply = await assistant.send(text);
      expect(["unsupported", "question", "info"]).toContain(reply.kind);
      expect(reply.preview).toBeUndefined();
    }
    expect((await assistant.send("Delete the last sale")).text).toContain("can't edit, delete, refund or clear");
    expect(await counts()).toEqual(before);
    expect((await getCustomerDebtSummary(customers.adwoa.id, "GHS", database)).outstandingMinor).toBe(45000);
  });

  it("gives help and handles empty input", async () => {
    expect((await assistant.send("help")).kind).toBe("info");
    expect((await assistant.send("   ")).kind).toBe("info");
  });

  it("stops asking after repeated unclear answers, and writes nothing", async () => {
    await assistant.send("record a sale");
    await assistant.send("??");
    await assistant.send("...");
    const stopped = await assistant.send("###");
    expect(stopped.text).toContain("Nothing was recorded");
    expect(await database.sales.count()).toBe(1);
  });

  it("looks for a real product before giving up on an odd single word", async () => {
    // A single unrecognised word is still checked against real records rather than triggering an immediate give-up.
    const reply = await assistant.act(chip(await assistant.send("record a sale"), "Cancel"));
    expect(reply.text).toContain("Nothing was recorded");
    await assistant.send("record a sale");
    const checked = await assistant.send("parsnips");
    expect(checked.kind).toBe("error");
    expect(checked.text).toContain("couldn't find a product named “Parsnips”");
  });

  it("read-only questions never change stored data", async () => {
    const snapshot = async () => JSON.stringify({ counts: await counts(), products: await database.products.toArray(), customers: await database.customers.toArray() });
    const before = await snapshot();
    for (const text of ["How much does Adwoa owe?", "How many eggs are left?", "Show today's sales", "What did we receive from Kofi Traders?", "Adwoa", "help"]) await assistant.send(text);
    expect(await snapshot()).toBe(before);
  });

  it("never exposes another company's records", async () => {
    await database.businessProfiles.put({ id: "company-two", name: "Second Co", country: "Ghana", currency: "GHS", businessType: "Retail shop", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    setActiveBusinessProfileId("company-two");
    const second = createAssistant({ currency: "GHS", database });
    expect((await second.send("How much does Adwoa owe?")).text).toContain("couldn't find a customer");
    expect((await second.send("How many eggs are left?")).text).toContain("couldn't find a product");
    expect((await second.send("Show today's sales")).text).toMatch(/no sales recorded/);
    setActiveBusinessProfileId("primary");
    expect((await getInventorySnapshot(database)).products).toHaveLength(3);
  });

  it("handles rapid messages in order", async () => {
    const replies = await Promise.all([assistant.send("Egg stock?"), assistant.send("How much does Adwoa owe?"), assistant.send("help")]);
    expect(replies.map((reply) => reply.kind)).toEqual(["answer", "answer", "info"]);
  });
});
