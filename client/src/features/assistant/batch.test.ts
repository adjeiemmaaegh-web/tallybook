/**
 * Several transactions in one message — end to end. These tests exist because the earlier batch feature reported
 * "saved" while saving nothing, dropped lines silently, and had a confirm button that did nothing.
 */
import { describe, expect, it } from "vitest";
import { getCustomerDebtSummary } from "@/features/credit/credit";
import { getInventorySnapshot } from "@/features/inventory/inventory";
import { setActiveBusinessProfileId } from "@/features/business/activeCompany";
import { completeSale } from "@/features/sales/sales";
import { chip, confirmAction, ledgerCounts, useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const stockOf = async (id: string) => (await getInventorySnapshot(kit.database)).products.find((product) => product.id === id)!.stockQuantity;
const rowValue = (reply: { preview?: { rows: Array<{ label: string; value: string }> }; details?: Array<{ label: string; value: string }> }, label: RegExp) =>
  (reply.preview?.rows ?? reply.details ?? []).find((item) => label.test(item.label))?.value;

describe("a list of transactions", () => {
  it("shows what each line will do, saves nothing yet, then really saves every line when confirmed", async () => {
    const before = await ledgerCounts(kit.database);
    const preview = await kit.assistant.send("- Sell 2 eggs to walk-in customer, paid cash\n- Sell 1 rice to Kwame, paid cash");
    expect(preview.kind).toBe("preview");
    expect(preview.preview?.kind).toBe("batch");
    expect(preview.preview?.confirmLabel).toBe("Confirm all 2");
    expect(rowValue(preview, /^\[1\]/)).toMatch(/Eggs/);
    expect(rowValue(preview, /^\[1\]/)).toMatch(/120\.00/);
    expect(rowValue(preview, /^\[2\]/)).toMatch(/Kwame Boateng/);
    expect(await ledgerCounts(kit.database)).toEqual(before);

    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("success");
    expect(done.text).toBe("2 transactions saved.");
    expect((await ledgerCounts(kit.database)).sales).toBe(before.sales + 2);
    expect(await stockOf(kit.products.eggs.id)).toBe(35);
    expect(await stockOf(kit.products.rice.id)).toBe(16); // 20, less 3 sold on credit by the seed, less 1
  });

  it("typing “yes” confirms it too", async () => {
    await kit.assistant.send("1. Sell 1 eggs to walk-in customer, paid cash\n2. Sell 1 rice to walk-in customer, paid cash");
    const done = await kit.assistant.send("yes");
    expect(done.text).toBe("2 transactions saved.");
  });

  it("mixes sales, stock receipts and payments", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nI received 5 eggs from Kofi Traders at 40 each\nAdwoa paid 100 cash");
    expect(preview.preview?.rows.map((item) => item.label)).toEqual(["[1] Sale", "[2] Stock received", "[3] Customer payment"]);
    await kit.assistant.act(confirmAction(preview));
    expect(await stockOf(kit.products.eggs.id)).toBe(41);
    expect((await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database)).outstandingMinor).toBe(35000);
  });

  it("separators and safe shared-terms compound sales prepare separate previews", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash; sell 1 rice to walk-in customer, paid cash");
    expect(preview.preview?.kind).toBe("batch");
    await kit.assistant.send("cancel");
    const single = await kit.assistant.send("Sell 2 eggs and 3 rice to Kwame, cash");
    expect(single.preview?.kind).toBe("batch");
    expect(single.preview?.rows).toHaveLength(2);
    expect(single.preview?.title).toMatch(/One sale/);
    expect(single.preview?.confirmLabel).toBe("Confirm one sale with 2 products");
    const before = await ledgerCounts(kit.database);
    const done = await kit.assistant.act(confirmAction(single));
    expect(done.kind).toBe("success");
    expect(done.text).toMatch(/one receipt/i);
    const after = await ledgerCounts(kit.database);
    expect(after.sales).toBe(before.sales + 1);
    expect(after.saleLines).toBe(before.saleLines + 2);
    const audit = await kit.database.assistantAudit.toArray();
    const matching = audit.filter((entry) => entry.recordId === done.recordId || (entry.outcome === "saved" && entry.summary === done.text));
    expect(matching).toHaveLength(1); // one combined sale, one audit event
    expect(matching[0].recordId).toBeDefined();
  });

  it("compound sale fails atomically if a product becomes unavailable after preview", async () => {
    const preview = await kit.assistant.send("Sell 2 eggs and 1 rice to Kwame, cash");
    expect(preview.kind).toBe("preview");
    const before = await ledgerCounts(kit.database);
    const eggsBefore = await stockOf(kit.products.eggs.id);
    await kit.database.products.update(kit.products.rice.id, { archivedAt: new Date().toISOString() });
    const outcome = await kit.assistant.act(confirmAction(preview));
    expect(outcome.kind).toBe("error");
    expect(outcome.text).toContain("Nothing was saved");
    expect(await ledgerCounts(kit.database)).toEqual(before);
    expect(await stockOf(kit.products.eggs.id)).toBe(eggsBefore);
  });

  it("each line is saved exactly once", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash");
    const confirm = confirmAction(preview);
    await kit.assistant.act(confirm);
    const second = await kit.assistant.act(confirm);
    expect(second.text).toContain("no longer active");
    expect(await stockOf(kit.products.eggs.id)).toBe(36);
  });
});

describe("lines that can't be recorded are never hidden or guessed", () => {
  it("a line that isn't understood is shown and excluded; the button says exactly what it will record", async () => {
    const before = await ledgerCounts(kit.database);
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash\nblah blah blah");
    expect(preview.text).toContain("Only 2 of 3 lines are ready");
    expect(rowValue(preview, /Not understood/)).toContain("blah blah blah");
    expect(preview.preview?.confirmLabel).toBe("Record the 2 ready lines");
    await kit.assistant.act(confirmAction(preview));
    expect((await ledgerCounts(kit.database)).sales).toBe(before.sales + 2);
  });

  it("a line that fails validation is excluded with the reason", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 mangoes to walk-in customer, paid cash");
    expect(preview.kind).toBe("preview");
    expect(preview.text).toContain("Only 1 of 2 lines are ready");
    expect(rowValue(preview, /^\[2\]/)).toMatch(/^Not included\./);
    expect(rowValue(preview, /^\[2\]/)).toMatch(/mangoes/i);
    expect(preview.preview?.confirmLabel).toBe("Record the 1 ready line");
  });

  it("two sales of the same product can't both use the same stock", async () => {
    const preview = await kit.assistant.send("Sell 20 eggs to walk-in customer, paid cash\nSell 20 eggs to walk-in customer, paid cash");
    expect(rowValue(preview, /^\[2\]/)).toMatch(/Not included\. Not enough Eggs after the lines above: only 17 would be left/);
    expect(preview.preview?.confirmLabel).toBe("Record the 1 ready line");
    await kit.assistant.act(confirmAction(preview));
    expect(await stockOf(kit.products.eggs.id)).toBe(17);
  });

  it("two payments can't together exceed what the customer owes", async () => {
    const preview = await kit.assistant.send("Adwoa paid 300 cash\nAdwoa paid 300 cash");
    expect(rowValue(preview, /^\[2\]/)).toContain("more than the customer would still owe");
    await kit.assistant.act(confirmAction(preview));
    expect((await getCustomerDebtSummary(kit.customers.adwoa.id, "GHS", kit.database)).outstandingMinor).toBe(15000);
  });

  it("nothing ready means nothing to confirm", async () => {
    const reply = await kit.assistant.send("Sell 1 mangoes to walk-in customer, paid cash\nSell 1 plums to walk-in customer, paid cash");
    expect(reply.kind).toBe("error");
    expect(reply.actions?.some((action) => action.type === "confirm")).toBeFalsy();
    expect(await kit.database.sales.count()).toBe(1);
  });
});

describe("what happens when saving goes wrong halfway", () => {
  it("stops at the first failure and says exactly what was and wasn't saved", async () => {
    const preview = await kit.assistant.send("Sell 1 rice to walk-in customer, paid cash\nSell 37 eggs to walk-in customer, paid cash\nSell 1 laundry soap to walk-in customer, paid cash");
    // Meanwhile, someone sells eggs elsewhere, so line 2 no longer has enough stock.
    await completeSale({ lines: [{ productId: kit.products.eggs.id, quantity: 5 }], discount: "0", paymentMethod: "cash", amountPaid: "300", currency: "GHS" }, kit.database);
    const done = await kit.assistant.act(confirmAction(preview));
    expect(done.kind).toBe("error");
    expect(done.text).toMatch(/Saved 1, then line 2 failed/);
    expect(done.text).toContain("not attempted");
    expect(rowValue(done, /^\[1\]/)).toMatch(/Sale recorded/);
    expect(rowValue(done, /^\[2\]/)).toMatch(/^Failed/);
    expect(rowValue(done, /^\[3\]/)).toBe("Not attempted");
    expect(await stockOf(kit.products.rice.id)).toBe(16);
    expect(await stockOf(kit.products.eggs.id)).toBe(32);
    expect(await stockOf(kit.products.soap.id)).toBe(1);
  });

  it("does not save into another business if the owner switched before confirming", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash");
    setActiveBusinessProfileId("someone-else");
    const done = await kit.assistant.act(confirmAction(preview));
    setActiveBusinessProfileId("primary");
    expect(done.kind).toBe("error");
    expect(done.text).toContain("switched business");
    expect(await kit.database.sales.count()).toBe(1);
  });
});

describe("cancelling and stale previews", () => {
  it("cancel (button or typed) saves nothing, and the old confirm button is dead", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash");
    expect((await kit.assistant.act(chip(preview, "Cancel"))).text).toContain("Nothing was recorded");
    expect((await kit.assistant.act(confirmAction(preview))).text).toContain("no longer active");
    const again = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash");
    expect((await kit.assistant.send("cancel")).text).toContain("Nothing was recorded");
    expect(again.kind).toBe("preview");
    expect(await kit.database.sales.count()).toBe(1);
  });

  it("a new message replaces the waiting batch", async () => {
    const preview = await kit.assistant.send("Sell 1 eggs to walk-in customer, paid cash\nSell 1 rice to walk-in customer, paid cash");
    await kit.assistant.send("How many eggs are left?");
    expect((await kit.assistant.act(confirmAction(preview))).text).toContain("no longer active");
    expect(await kit.database.sales.count()).toBe(1);
  });
});

describe("multi-line messages are never half-recorded", () => {
  it("one understood request plus other lines: nothing is recorded, and the owner is told", async () => {
    const before = await ledgerCounts(kit.database);
    const reply = await kit.assistant.send("Sell 2 eggs to walk-in customer, paid cash\nHow much does Kwame owe?");
    expect(reply.kind).toBe("info");
    expect(reply.text).toContain("nothing was recorded");
    expect(await ledgerCounts(kit.database)).toEqual(before);
  });

  it("too many lines", async () => {
    const reply = await kit.assistant.send(Array.from({ length: 21 }, () => "Sell 1 eggs to walk-in customer, paid cash").join("\n"));
    expect(reply.text).toContain("more than 20 lines");
    expect(await kit.database.sales.count()).toBe(1);
  });

  it("a plain single request is unaffected", async () => {
    expect((await kit.assistant.send("Sell 2 eggs to walk-in customer, paid cash")).preview?.kind).toBe("sale");
  });
});
