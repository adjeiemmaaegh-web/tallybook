import { describe, expect, it, vi } from "vitest";
import { answerShopQuestion, type Answer, findProducts, parsePeriod, parseShopQuestion, type AskContext, type AskProduct } from "./shopAssistant";
import { parseDailyReport } from "./dailyReport";
import { parseProfitReport } from "./profitReport";

const p = (id: string, name: string, over: Partial<AskProduct> = {}): AskProduct => ({ id, name, active: true, unitPriceMinor: 1000, lowStockThreshold: null, ...over });
const products = [
  p("eggs", "Eggs (crate)", { unitPriceMinor: 4500, lowStockThreshold: 10 }), p("bread", "Bread", { lowStockThreshold: 20 }),
  p("rice", "Rice 5kg", { unitPriceMinor: 9000, lowStockThreshold: 5 }), p("milk", "Milk", {}), p("haircut", "Haircut", { trackStock: false, unitPriceMinor: 5000 }),
  p("old", "Old stock", { active: false }),
];
const stores = [{ id: "n", name: "North", status: "active" }, { id: "s", name: "South", status: "active" }];
const stock = [
  { storeId: "n", productId: "eggs", quantity: 4 }, { storeId: "s", productId: "eggs", quantity: 30 },
  { storeId: "n", productId: "bread", quantity: 0 }, { storeId: "s", productId: "bread", quantity: 50 },
  { storeId: "n", productId: "rice", quantity: 40 }, { storeId: "n", productId: "milk", quantity: 0 },
];
const report = (role: "owner" | "attendant" = "owner") => parseDailyReport({
  role, from: "a", to: "b", storeId: null, sales: { count: 3, grossMinor: "14200", discountMinor: "500" },
  byMethod: { cash: "9000", mobile: "5200", card: "0", credit: "0" }, refunds: { count: 1, totalMinor: "4500", cash: "4500", mobile: "0", card: "0", creditReducedMinor: "0" },
  repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" }, supplierPayments: { cash: "0", mobile: "0", card: "0", bank: "0" },
  topProducts: [{ name: "Eggs (crate)", quantity: 3, revenueMinor: "13000" }, { name: "Bread", quantity: 1, revenueMinor: "1200" }],
  byCashier: [], cashTakenMinor: "0", cashPaidOutMinor: "0", cashExpectedMinor: "0", customerCreditOutstandingMinor: null });
const profit = () => parseProfitReport({ from: "a", to: "b", storeId: null, netRevenueMinor: "14200", coveredRevenueMinor: "13000", uncoveredRevenueMinor: "1200", costOfGoodsMinor: "9000",
  grossProfitMinor: "4000", marginBps: 3077, expenses: { count: 1, totalMinor: "700" }, netProfitMinor: "3300", saleLines: { total: 3, withCost: 2 }, topByProfit: [] });
const customers = [{ id: "c1", name: "Ama Boateng", phone: null, creditLimitMinor: 1, balanceMinor: 4500 }, { id: "c2", name: "Kofi", phone: null, creditLimitMinor: 1, balanceMinor: 0 }, { id: "c3", name: "Esi Mensah", phone: null, creditLimitMinor: 1, balanceMinor: 1500 }];
const ctx = (over: Partial<AskContext> = {}): AskContext => ({ role: "owner", currency: "GHS", products, stores, stock, customers,
  loadReport: vi.fn(async () => report()), loadProfit: vi.fn(async () => profit()), ...over });
// The currency formatter uses a no-break space; tests read it as a normal one.
const plain = (a: Answer): Answer => ({ ...a, text: a.text.replaceAll("\u00a0", " "), rows: a.rows?.map(r => r.replaceAll("\u00a0", " ")) });
const ask = async (text: string, c = ctx()) => plain(await answerShopQuestion(parseShopQuestion(text), c));

describe("understanding the question", () => {
  const cases: Array<[string, unknown]> = [
    ["What is low on stock?", { kind: "lowStock" }], ["wetin dey low", { kind: "lowStock" }], ["what is running out", { kind: "lowStock" }],
    ["What is out of stock", { kind: "outOfStock" }], ["wetin finish?", { kind: "outOfStock" }], ["what is sold out", { kind: "outOfStock" }],
    ["What did I sell today?", { kind: "sales", period: "today" }], ["how much did we make yesterday", { kind: "sales", period: "yesterday" }],
    ["sales this month", { kind: "sales", period: "month" }], ["revenue last 7 days", { kind: "sales", period: "week" }],
    ["Top sellers this week", { kind: "topSellers", period: "week" }], ["best selling products", { kind: "topSellers", period: "today" }], ["what sells most this month", { kind: "topSellers", period: "month" }],
    ["Who owes me?", { kind: "owed" }], ["who dey owe me", { kind: "owed" }], ["list my debtors", { kind: "owed" }], ["Does Ama owe me anything", { kind: "owed", query: "ama" }],
    ["profit today", { kind: "profit", period: "today" }], ["what is my margin this week", { kind: "profit", period: "week" }],
    ["Draft an order for what is low", { kind: "reorder" }], ["restock list", { kind: "reorder" }], ["what should I buy", { kind: "reorder" }], ["make a purchase order", { kind: "reorder" }],
    ["How many Eggs do I have?", { kind: "stockOf", query: "eggs" }], ["stock of bread", { kind: "stockOf", query: "bread" }], ["do I have rice", { kind: "stockOf", query: "rice" }],
    ["price of rice", { kind: "priceOf", query: "rice" }], ["how much is the haircut", { kind: "priceOf", query: "haircut" }],
    ["", { kind: "help" }], ["tell me a joke", { kind: "help" }], ["hello", { kind: "help" }],
  ];
  for (const [text, expected] of cases) it(`“${text}”`, () => expect(parseShopQuestion(text)).toEqual(expected));
  it("periods", () => { expect(parsePeriod("")).toBe("today"); expect(parsePeriod("yesterday please")).toBe("yesterday"); expect(parsePeriod("past week")).toBe("week"); });
  it("a long or odd input never throws", () => { expect(parseShopQuestion("x".repeat(5000)).kind).toBe("help"); expect(parseShopQuestion("😀 ??? ###").kind).toBe("help"); });
});

describe("finding products", () => {
  it("matches by words, prefix and small typos; skips archived products", () => {
    expect(findProducts(products, "eggs").map(x => x.id)).toEqual(["eggs"]);
    expect(findProducts(products, "egg").map(x => x.id)).toEqual(["eggs"]);
    expect(findProducts(products, "rice").map(x => x.id)).toEqual(["rice"]);
    expect(findProducts(products, "breed").map(x => x.id)).toEqual(["bread"]);
    expect(findProducts(products, "old stock")).toEqual([]);
    expect(findProducts(products, "zzz")).toEqual([]);
    expect(findProducts(products, "")).toEqual([]);
  });
});

describe("answers from the shop's own numbers", () => {
  it("low stock is per store, uses each product's own level, and ignores services and untracked items", async () => {
    const a = await ask("what is low");
    expect(a.rows).toEqual(["Eggs (crate) (North): 4 left (level 10)"]);
    expect(a.suggestions).toEqual(["Draft an order for what is low"]);
  });
  it("out of stock lists the empty ones, and says when nothing is", async () => {
    const a = await ask("what is out of stock");
    // A product with no stock row at a store is out there: it cannot be sold from it.
    expect(a.rows).toEqual(["Bread (North)", "Milk (North)", "Milk (South)", "Rice 5kg (South)"]);
    expect((await ask("out of stock", ctx({ stock: [] }))).rows).toBeDefined();
    expect((await ask("what is out of stock", ctx({ products: [p("a", "A", { trackStock: false })] }))).text).toBe("Nothing is out of stock.");
  });
  it("says so when no low-stock level is set anywhere", async () => {
    expect((await ask("what is low", ctx({ products: [p("a", "A")], stock: [{ storeId: "n", productId: "a", quantity: 3 }] }))).text).toMatch(/No product has a low-stock level yet/);
  });
  it("stock of a product: total and per store; services are not counted; unknown names are admitted", async () => {
    expect((await ask("how many eggs do I have")).text).toBe("Eggs (crate): 34 in total (North 4, South 30)");
    expect((await ask("do i have haircut")).text).toMatch(/stock isn't counted/);
    expect((await ask("how many unicorns")).text).toMatch(/couldn't find a product like “unicorns”/);
    expect((await ask("stock of rice", ctx({ stores: [stores[0]] }))).text).toBe("Rice 5kg: 40 in stock");
  });
  it("price", async () => {
    expect((await ask("price of rice")).text).toBe("Rice 5kg sells for GHS 90.00.");
  });
  it("sales and top sellers come from the server's report", async () => {
    const c = ctx();
    const a = await ask("what did I sell today", c);
    expect(c.loadReport).toHaveBeenCalledWith("today");
    expect(a.text).toBe("The shop sold GHS 142.00 today.");
    expect(a.rows).toEqual(["Sales: GHS 142.00 (3 sales)", "Refunds: −GHS 45.00 (1 refund)", "Net: GHS 97.00"]);
    const top = await ask("top sellers this week", c);
    expect(c.loadReport).toHaveBeenCalledWith("week");
    expect(top.rows?.[0]).toBe("1. Eggs (crate) × 3 · GHS 130.00");
  });
  it("an attendant is told it is their own sales", async () => {
    const c = ctx({ role: "attendant", loadReport: vi.fn(async () => report("attendant")) });
    expect((await ask("what did I sell today", c)).text).toBe("You sold GHS 142.00 today.");
    expect((await ask("best sellers", c)).text).toMatch(/your sales/);
  });
  it("nothing sold is said plainly", async () => {
    const empty = parseDailyReport({ ...JSON.parse(JSON.stringify({ role: "owner", from: "a", to: "b", storeId: null, sales: { count: 0, grossMinor: "0", discountMinor: "0" },
      byMethod: { cash: "0", mobile: "0", card: "0", credit: "0" }, refunds: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0", creditReducedMinor: "0" },
      repayments: { count: 0, totalMinor: "0", cash: "0", mobile: "0", card: "0" }, supplierPayments: { cash: "0", mobile: "0", card: "0", bank: "0" },
      topProducts: [], byCashier: [], cashTakenMinor: "0", cashPaidOutMinor: "0", cashExpectedMinor: "0", customerCreditOutstandingMinor: null })) });
    const c = ctx({ loadReport: vi.fn(async () => empty) });
    expect((await ask("what did I sell yesterday", c)).text).toBe("Nothing was sold yesterday.");
    expect((await ask("top sellers", c)).text).toBe("Nothing was sold today.");
  });
  it("profit is the owner's alone, mentions missing costs, and survives an old server", async () => {
    const a = await ask("profit today");
    expect(a.rows).toEqual(["Gross profit: GHS 40.00 (margin 30.8%)", "Cost of goods: GHS 90.00", "Expenses: GHS 7.00", "Net profit: GHS 33.00", "Note: GHS 12.00 of sales have no cost recorded and are not in the profit."]);
    const attendant = ctx({ role: "attendant" });
    expect((await ask("profit today", attendant)).text).toBe("Only the owner can see profit.");
    expect(attendant.loadProfit).not.toHaveBeenCalled();
    expect((await ask("profit today", ctx({ loadProfit: vi.fn(async () => { throw new Error("Unknown shop operations action"); }) }))).text).toMatch(/latest update/);
  });
  it("who owes: biggest first with a total; one person by name; nobody; and no access", async () => {
    expect((await ask("who owes me")).text).toBe("2 customers owe GHS 60.00 in total:");
    expect((await ask("who owes me")).rows).toEqual(["Ama Boateng: GHS 45.00", "Esi Mensah: GHS 15.00"]);
    expect((await ask("does ama owe me")).text).toBe("Ama Boateng owes GHS 45.00.");
    expect((await ask("does kofi owe me")).text).toBe("Kofi owes nothing.");
    expect((await ask("does yaw owe me")).text).toMatch(/couldn't find a customer called “yaw”/);
    expect((await ask("who owes me", ctx({ customers: customers.map(c => ({ ...c, balanceMinor: 0 })) }))).text).toBe("Nobody owes anything.");
    expect((await ask("who owes me", ctx({ role: "attendant", customers: undefined }))).text).toMatch(/can't see customers' balances/);
  });
});

describe("draft purchase order", () => {
  it("tops each low item up to twice its level, for the store that needs most; never includes items with no level", async () => {
    const a = await ask("draft an order for what is low");
    // North: eggs 4 (level 10 -> 20-4 = 16), bread 0 (level 20 -> 40), milk 0 has no level -> left out. South has no shortages.
    expect(a.draft).toEqual({ storeId: "n", storeName: "North", lines: [{ productId: "bread", name: "Bread", quantity: 40 }, { productId: "eggs", name: "Eggs (crate)", quantity: 16 }] });
    expect(a.rows).toContain("Not included (no low-stock level): Milk");
    expect(a.text).toMatch(/nothing is ordered yet/);
  });
  it("mentions other stores that also need stock", async () => {
    const a = await ask("restock", ctx({ stock: [...stock.filter(s => !(s.storeId === "s" && s.productId === "bread")), { storeId: "s", productId: "bread", quantity: 2 }] }));
    expect(a.rows?.some(r => /Other stores also need stock: South/.test(r))).toBe(true);
  });
  it("nothing low, no levels set, and attendants are all handled without a draft", async () => {
    expect((await ask("restock", ctx({ stock: [{ storeId: "n", productId: "eggs", quantity: 99 }, { storeId: "s", productId: "eggs", quantity: 99 }], products: [products[0]] }))).draft).toBeUndefined();
    const noLevels = await ask("restock", ctx({ products: [p("a", "A")], stock: [] }));
    expect(noLevels.draft).toBeUndefined(); expect(noLevels.text).toMatch(/none has a low-stock level/);
    const att = await ask("restock", ctx({ role: "attendant" }));
    expect(att.draft).toBeUndefined(); expect(att.text).toMatch(/Only the owner can draft purchase orders/);
  });
});

describe("help", () => {
  it("offers examples, and an attendant is not offered owner-only ones", async () => {
    const owner = await ask("hello");
    expect(owner.rows).toContain("Draft an order for what is low");
    const att = await ask("hello", ctx({ role: "attendant" }));
    expect(att.rows?.some(r => /order|owes/i.test(r))).toBe(false);
  });
});
