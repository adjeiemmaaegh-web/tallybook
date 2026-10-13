/**
 * Aggregate queries with a period — "Best-sellers THIS MONTH", "Top debtors last month", "Which customers bought this year".
 * The clock is fixed at 15 Oct 2026 and sales are placed in known months, so every expected ranking is exact.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { formatMinorAmount } from "@/features/inventory/inventory";
import type { AssistantReply } from "./index";
import { useAssistantDb } from "./testKit";

const kit = useAssistantDb();
const NOW = new Date(2026, 9, 15, 12, 0, 0);
const ghs = (minor: number) => formatMinorAmount(minor, "GHS");
let ask: (text: string) => Promise<AssistantReply>;
const primaries = (reply: AssistantReply) => reply.rows?.map((item) => item.primary.replace(/^\d+\.\s*/, "")) ?? [];

let saleNumber = 0;
async function sale(when: Date, customerId: string | undefined, lines: Array<{ productId: string; name: string; quantity: number; unit: number }>, paid?: number) {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unit, 0);
  const paidMinor = paid ?? total;
  const id = `sale-${++saleNumber}`;
  await kit.database.sales.add({
    id, businessProfileId: "primary", customerId, receiptNumber: `T-${saleNumber}`, status: "completed", subtotalMinor: total, discountMinor: 0, totalMinor: total,
    amountPaidMinor: paidMinor, outstandingMinor: total - paidMinor, paymentMethod: paidMinor < total ? "credit" : "cash", submissionKey: id, createdAt: when.toISOString(),
  });
  for (const [index, line] of lines.entries()) {
    await kit.database.saleLines.add({ id: `${id}-${index}`, saleId: id, productId: line.productId, businessProfileId: "primary", productName: line.name, quantity: line.quantity, unitPriceMinor: line.unit, lineTotalMinor: line.quantity * line.unit });
  }
}

beforeEach(async () => {
  // Replace the seed's sale (which carries the real wall-clock date) with a known history.
  await kit.database.sales.clear(); await kit.database.saleLines.clear();
  const { eggs, rice, soap } = kit.products; const { adwoa, kwame } = kit.customers;
  const E = (quantity: number) => ({ productId: eggs.id, name: "Eggs", quantity, unit: 6000 });
  const R = (quantity: number) => ({ productId: rice.id, name: "Rice", quantity, unit: 15000 });
  const S = (quantity: number) => ({ productId: soap.id, name: "Laundry soap", quantity, unit: 1250 });
  await sale(new Date(2026, 9, 3, 9), kwame.id, [E(10)]);                    // this month: Kwame, 600.00
  await sale(new Date(2026, 9, 10, 9), adwoa.id, [R(2), S(4)], 0);           // this month: Adwoa on credit, 350.00 unpaid
  await sale(new Date(2026, 9, 12, 9), undefined, [E(3)]);                   // this month: walk-in, 180.00
  await sale(new Date(2026, 8, 20, 9), kwame.id, [R(8)]);                    // last month: Kwame, 1,200.00
  await sale(new Date(2026, 8, 5, 9), adwoa.id, [S(30)], 17500);             // last month: Adwoa, 375.00 with 200.00 unpaid
  await sale(new Date(2026, 7, 15, 9), kwame.id, [E(50)]);                   // August
  await sale(new Date(2026, 0, 8, 9), undefined, [R(1)]);                    // January
  await sale(new Date(2025, 11, 20, 9), kwame.id, [R(100)]);                 // last year
  ask = (text) => kit.assistantAt(NOW).send(text);
});

describe("best-selling products, grouped by product", () => {
  it.each([
    ["Best-sellers THIS MONTH", ["Eggs", "Laundry soap", "Rice"], ["13 sold", "4 sold", "2 sold"]],
    ["best selling products last month", ["Laundry soap", "Rice"], ["30 sold", "8 sold"]],
    ["What were the top selling products this year?", ["Eggs", "Laundry soap", "Rice"], ["63 sold", "34 sold", "11 sold"]],
    ["Best sellers last year", ["Rice"], ["100 sold"]],
    ["best-selling product in the last 30 days", ["Eggs", "Rice", "Laundry soap"], ["13 sold", "10 sold", "4 sold"]],
    ["Best-selling product all time", ["Rice", "Eggs", "Laundry soap"], ["111 sold", "63 sold", "34 sold"]],
  ])("%s", async (text, names, sold) => {
    const reply = await ask(text);
    expect(reply.kind).toBe("answer");
    expect(primaries(reply)).toEqual(names);
    expect(reply.rows?.map((item) => item.secondary)).toEqual(sold);
  });

  it("shows the revenue and names the period", async () => {
    const reply = await ask("Best-sellers THIS MONTH");
    expect(reply.text).toContain("This month (October 2026)");
    expect(reply.rows![0].amount).toBe(ghs(78000));
  });

  it("is not mistaken for recording a sale", async () => {
    const before = await kit.database.sales.count();
    await ask("Best-sellers THIS MONTH");
    expect(await kit.database.sales.count()).toBe(before);
  });

  it("with no period, covers all saved records and offers narrower periods that work", async () => {
    const reply = await ask("What is my best-selling product?");
    expect(reply.text).toContain("All saved records");
    const month = reply.actions!.find((action) => action.label === "This month")!;
    expect(month.type === "say" && month.text).toBe("Best-selling products this month");
    const narrowed = await ask((month as { text: string }).text);
    expect(primaries(narrowed)[0]).toBe("Eggs");
  });

  it("says so when the period has no sales", async () => {
    const reply = await ask("Best-selling products today");
    expect(reply.text).toContain("no sales recorded");
    expect(reply.rows).toBeUndefined();
  });

  it("answers last-quarter best sellers using the correct calendar quarter", async () => {
    const reply = await ask("Best-sellers last quarter");
    expect(reply.kind).toBe("answer");
    expect(reply.text).toContain("Last quarter (Q3 2026)");
    expect(primaries(reply)).toEqual(["Eggs", "Laundry soap", "Rice"]);
  });
});

describe("customers who bought", () => {
  it("this month: biggest spenders first, walk-ins counted separately", async () => {
    const reply = await ask("Which customers bought this month?");
    expect(primaries(reply)).toEqual(["Kwame Boateng", "Adwoa Mensah"]);
    expect(reply.rows![0].amount).toBe(ghs(60000));
    expect(reply.rows![1].amount).toBe(ghs(35000));
    expect(reply.text).toContain("2 customers bought");
    expect(reply.moreText).toContain("1 walk-in sale");
  });

  it("last month and all-time give different, correct answers", async () => {
    expect(primaries(await ask("Which customers bought last month?"))).toEqual(["Kwame Boateng", "Adwoa Mensah"]);
    expect((await ask("Which customers bought last month?")).rows![0].amount).toBe(ghs(120000));
    expect((await ask("Top customers this year")).rows![0].amount).toBe(ghs(120000 + 60000 + 300000));
  });

  it("'top customers' means biggest buyers, not biggest debtors", async () => {
    expect((await ask("Top customers this month")).text).toContain("biggest spenders");
  });
});

describe("top debtors", () => {
  it("without a period: current balances, as on the customer page", async () => {
    const reply = await ask("Which customers owe us the most?");
    expect(primaries(reply)).toEqual(["Adwoa Mensah"]);
    expect(reply.rows![0].amount).toBe(ghs(55000)); // 350.00 + 200.00 left unpaid across both months
    expect(reply.text).toContain("right now");
  });

  it("with a period: the credit given in that period, and what they owe in total today", async () => {
    const thisMonth = await ask("Top debtors this month");
    expect(primaries(thisMonth)).toEqual(["Adwoa Mensah"]);
    expect(thisMonth.rows![0].amount).toBe(ghs(35000));
    expect(thisMonth.rows![0].secondary).toContain(ghs(55000));
    expect(thisMonth.moreText).toContain("Payments made later are not subtracted");

    const lastMonth = await ask("Top debtors last month");
    expect(lastMonth.rows![0].amount).toBe(ghs(20000));
  });

  it("a period with no unpaid sales says so", async () => {
    expect((await ask("Top debtors last year")).text).toContain("no sales were left unpaid");
  });
});

describe("sales totals for calendar ranges", () => {
  it("this month", async () => {
    const reply = await ask("Show sales for this month");
    expect(reply.text).toContain("This month (October 2026): 3 sales totalling " + ghs(113000));
    expect(reply.details?.find((detail) => detail.label === "Left unpaid (credit)")?.value).toBe(ghs(35000));
  });

  it("last month and this year", async () => {
    expect((await ask("sales last month")).text).toContain(`2 sales totalling ${ghs(120000 + 37500)}`);
    expect((await ask("How much did we sell this year?")).text).toContain("sales totalling");
  });

  it("the last N days", async () => {
    expect((await ask("Show sales for the last 30 days")).text).toContain("The last 30 days: 4 sales");
  });

  it("the old periods still work", async () => {
    expect((await ask("Show sales for the last 7 days")).text).toContain("last 7 days");
  });
});

describe("low stock", () => {
  it("includes products that are completely out of stock, most urgent first", async () => {
    await kit.database.products.update(kit.products.eggs.id, { stockQuantity: 0 });
    const reply = await ask("What's running low?");
    expect(primaries(reply)).toEqual(["Eggs", "Laundry soap"]);
    expect(reply.rows![0].amount).toBe("Out of stock");
    expect(reply.rows![1].amount).toBe("1 left");
  });
});
