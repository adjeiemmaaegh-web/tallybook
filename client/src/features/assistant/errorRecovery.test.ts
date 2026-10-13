/**
 * Error recovery — instead of refusing, the assistant offers the nearest thing that works. Every test taps the real chips and checks what
 * was actually stored, so a chip that sends text the parser can't read (or does nothing) fails here.
 */
import { describe, expect, it } from "vitest";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getCustomerSnapshot } from "@/features/customers/customers";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { formatMinorAmount } from "@/features/inventory/inventory";
import { chip, confirmAction, ledgerCounts, row, useAssistantDb } from "./testKit";

const ghs = (minor: number) => formatMinorAmount(minor, "GHS");

const kit = useAssistantDb();
const stockOf = async (id: string) => (await getInventorySnapshot(kit.database)).products.find((product) => product.id === id)!.stockQuantity;

describe("not enough stock", () => {
  it("offers to sell what's there, instead of rejecting, and the chip really records that sale", async () => {
    const before = await ledgerCounts(kit.database);
    const reply = await kit.assistant.send("Sell 5 laundry soap to walk-in customer, paid cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain("only 1 Laundry soap");
    expect(reply.actions?.map((action) => action.label)).toEqual(["Sell the 1 I have", "Receive more Laundry soap", "Recount Laundry soap", "Cancel"]);
    expect(await ledgerCounts(kit.database)).toEqual(before);

    const preview = await kit.assistant.act(chip(reply, "Sell the 1 I have"));
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Quantity")).toContain("1");
    expect(row(preview, "Total")).toContain("12.50");
    await kit.assistant.act(confirmAction(preview));
    expect(await stockOf(kit.products.soap.id)).toBe(0);
    expect((await ledgerCounts(kit.database)).sales).toBe(before.sales + 1);
  });

  it("a typed smaller quantity works too", async () => {
    await kit.assistant.send("Sell 5 laundry soap to walk-in customer, paid cash");
    const preview = await kit.assistant.send("1");
    expect(preview.kind).toBe("preview");
  });

  it("out of stock: no 'sell 0' chip; recounting finds the stock and the sale then goes through", async () => {
    await kit.assistant.act(confirmAction(await kit.assistant.send("I counted 0 laundry soap")));
    const reply = await kit.assistant.send("Sell 1 laundry soap to walk-in customer, paid cash");
    expect(reply.text).toContain("out of stock");
    expect(reply.actions?.some((action) => /Sell the/.test(action.label))).toBe(false);

    const ask = await kit.assistant.act(chip(reply, "Recount Laundry soap"));
    expect(ask.text).toContain("How many");
    await kit.assistant.act(confirmAction(await kit.assistant.send("4")));
    expect(await stockOf(kit.products.soap.id)).toBe(4);

    const sale = await kit.assistant.send("Sell 2 laundry soap to walk-in customer, paid cash");
    expect(sale.kind).toBe("preview");
  });

  it("'Receive more' starts a real stock receipt for that product", async () => {
    const reply = await kit.assistant.send("Sell 5 laundry soap to walk-in customer, paid cash");
    const next = await kit.assistant.act(chip(reply, "Receive more Laundry soap"));
    expect(next.kind).toBe("question");
    expect(next.text.toLowerCase()).toMatch(/how many|supplier/);
  });
});

describe("customer, product or supplier not found", () => {
  it("offers to add the customer, then carries on with the sale using them", async () => {
    const miss = await kit.assistant.send("Sell 1 eggs to Kama, paid cash");
    expect(miss.kind).toBe("error");
    const phone = await kit.assistant.act(chip(miss, /Add “Kama” as a new customer/));
    expect(phone.text).toContain("phone number");
    const addPreview = await kit.assistant.send("0241112222");
    expect(row(addPreview, "Name")).toBe("Kama");

    const resumed = await kit.assistant.act(confirmAction(addPreview));
    expect(resumed.kind).toBe("preview");
    expect(resumed.notice).toContain("Customer added: Kama");
    expect(row(resumed, "Customer")).toContain("Kama");
    await kit.assistant.act(confirmAction(resumed));
    const kama = (await getCustomerSnapshot(kit.database)).customers.find((customer) => customer.name === "Kama")!;
    expect((await kit.database.sales.toArray()).some((sale) => sale.customerId === kama.id)).toBe(true);
    expect(await stockOf(kit.products.eggs.id)).toBe(36);
  });

  it("typing a corrected name also works", async () => {
    const miss = await kit.assistant.send("Sell 1 eggs to Zed, paid cash");
    expect(miss.kind).toBe("error");
    const preview = await kit.assistant.send("Kwame");
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Customer")).toContain("Kwame Boateng");
  });

  it("offers to add an unknown product and then continues the sale", async () => {
    const miss = await kit.assistant.send("Sell 2 mangoes to walk-in customer, paid cash");
    expect(miss.kind).toBe("error");
    await kit.assistant.act(chip(miss, /Add “Mangoes” as a new product/));
    const addPreview = await kit.assistant.send("5");
    const resumed = await kit.assistant.act(confirmAction(addPreview));
    expect(resumed.notice).toContain("Product added: Mangoes");
    expect(resumed.text).toContain("out of stock"); // it exists now, with no stock yet — and the owner is offered a way forward
    expect(chip(resumed, "Recount Mangoes")).toBeDefined();
  });

  it("offers to add a customer when asking about someone unknown", async () => {
    const miss = await kit.assistant.send("How much does Zainab owe?");
    expect(miss.kind).toBe("error");
    expect(chip(miss, /Add “Zainab” as a new customer/)).toBeDefined();
  });

  it("an unrelated request after the offer doesn't resurrect the old sale", async () => {
    const miss = await kit.assistant.send("Sell 1 eggs to Kama, paid cash");
    await kit.assistant.send("How many eggs are left?");
    const preview = await kit.assistant.send("Add customer Kama 0241112222");
    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("success");
    expect(done.notice).toBeUndefined();
    expect(miss.actions).toBeDefined();
  });
});

describe("amounts and quantities that can't be recorded", () => {
  it("whole numbers only: offers the whole numbers either side", async () => {
    const reply = await kit.assistant.send("Sell 2.5 crates of eggs to walk-in customer, paid cash");
    expect(reply.kind).toBe("question");
    expect(reply.actions?.map((action) => action.label)).toEqual(["Record 2", "Record 3", "Cancel"]);
    const preview = await kit.assistant.act(chip(reply, "Record 3"));
    expect(row(preview, "Total")).toContain("180.00");
  });

  it("a payment larger than the debt: offers the full amount owed", async () => {
    const reply = await kit.assistant.send("Adwoa paid 600 cedis cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain(`owes ${ghs(45000)}`);
    const preview = await kit.assistant.act(chip(reply, /Record the full/));
    expect(row(preview, "Amount")).toContain("450.00");
    await kit.assistant.act(confirmAction(preview));
    expect((await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database)).outstandingMinor).toBe(0);
  });

  it("a discount can't be applied: offers the full price instead of refusing", async () => {
    const reply = await kit.assistant.send("Sell 2 eggs to Kwame with a 10% discount, paid cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain("discount");
    const preview = await kit.assistant.act(chip(reply, "Record at full price"));
    expect(preview.kind).toBe("preview");
    expect(row(preview, "Total")).toContain("120.00");
  });

  it("a payment received that is more than the sale total: offers 'paid in full'", async () => {
    const reply = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid 100 cash");
    expect(reply.kind).toBe("question");
    expect(reply.text).toContain(`only totals ${ghs(6000)}`);
    const preview = await kit.assistant.act(chip(reply, /Paid in full/));
    expect(preview.kind).toBe("preview");
  });
});

describe("cancelling during recovery", () => {
  it("leaves everything as it was", async () => {
    const before = await ledgerCounts(kit.database);
    const reply = await kit.assistant.send("Sell 5 laundry soap to walk-in customer, paid cash");
    expect((await kit.assistant.act(chip(reply, "Cancel"))).text).toContain("Nothing was recorded");
    expect(await ledgerCounts(kit.database)).toEqual(before);
    expect(await stockOf(kit.products.soap.id)).toBe(1);
  });
});
