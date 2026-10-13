import { describe, expect, it } from "vitest";
import { parseCountAnswer, parseCountCommand, parseCreateCommand, parseNewNameAnswer, parsePhoneAnswer, parsePriceAnswer, tidyName } from "./recordParsers";

describe("parseCreateCommand — customers and suppliers", () => {
  it.each([
    ["Add customer Ama Mensah", "Ama Mensah", undefined],
    ["add a new customer called ama", "Ama", undefined],
    ["Create customer Kofi Boateng phone 0241234567", "Kofi Boateng", "0241234567"],
    ["new customer Abena, 024 123 4567", "Abena", "024 123 4567"],
    ["Add Yaw Owusu as a customer", "Yaw Owusu", undefined],
    ["please register a client named Efua with number +233 24 111 2222", "Efua", "+233 24 111 2222"],
  ])("%s", (text, name, phone) => {
    const parsed = parseCreateCommand(text)!;
    expect(parsed.kind).toBe("customer");
    expect(parsed.entities.customerText).toBe(name);
    expect(parsed.entities.phone).toBe(phone);
  });

  it("keeps capitals the owner typed", () => expect(parseCreateCommand("add customer Nana Yaa McCarthy")!.entities.customerText).toBe("Nana Yaa McCarthy"));
  it("asks for the name when none is given", () => { const parsed = parseCreateCommand("add a customer")!; expect(parsed.kind).toBe("customer"); expect(parsed.entities.customerText).toBeUndefined(); });

  it.each([["Add supplier Kofi Traders", "Kofi Traders"], ["new vendor ABC Foods Ltd", "ABC Foods Ltd"], ["create a supplier called Mama Esi"," Mama Esi".trim()]])("%s", (text, name) => {
    const parsed = parseCreateCommand(text)!;
    expect(parsed.kind).toBe("supplier");
    expect(parsed.entities.supplierText).toBe(name);
  });
});

describe("parseCreateCommand — categories", () => {
  it.each([["Add category Drinks", "Drinks"], ["new category: dairy products", "Dairy Products"], ["create a product category called Cleaning", "Cleaning"], ["Add Beverages as a category", "Beverages"]])("%s", (text, name) => {
    const parsed = parseCreateCommand(text)!;
    expect(parsed.kind).toBe("category");
    expect(parsed.entities.categoryText).toBe(name);
  });
});

describe("parseCreateCommand — products", () => {
  it("name only", () => expect(parseCreateCommand("Add product Eggs")!.entities).toEqual({ productText: "Eggs" }));
  it("name and price", () => expect(parseCreateCommand("add product Palm oil at 12 each")!.entities).toEqual({ productText: "Palm oil", price: "12" }));
  it("price, stock and category in one sentence", () => {
    const e = parseCreateCommand("Create product Bread, price 3.50, 20 in stock, category Bakery")!.entities;
    expect(e).toMatchObject({ productText: "Bread", price: "3.50", openingStock: 20, categoryText: "Bakery" });
  });
  it("cost and low-stock level", () => {
    const e = parseCreateCommand("new item Rice 5kg selling price 150 cost 120 opening stock 30 low stock at 5")!.entities;
    expect(e).toMatchObject({ productText: "Rice 5kg", price: "150", costPrice: "120", openingStock: 30, lowStockLevel: 5 });
  });
  it("with currency words", () => expect(parseCreateCommand("add product Sugar for 8 cedis with 40 in stock")!.entities).toMatchObject({ productText: "Sugar", price: "8", openingStock: 40 }));
  it("as-product phrasing", () => expect(parseCreateCommand("add Milk as a product")!.entities.productText).toBe("Milk"));
});

describe("parseCreateCommand — things that must NOT be read as creating a record", () => {
  it.each([
    "How do I add a customer?", "Sell 2 eggs to Kwame", "How much does Adwoa owe?", "I received 10 crates of eggs from Kofi Traders",
    "Add 10 eggs to stock", "Kwame paid 50 cedis", "what products do I have", "show me new customers",
  ])("%s", (text) => expect(parseCreateCommand(text)).toBeNull());
});

describe("parseCountCommand", () => {
  it("the owner's own example", () => expect(parseCountCommand("I counted 25 but we have 37")).toEqual({ counted: 25, productText: undefined, statedRecorded: 37 }));
  it.each([
    ["I counted 25 eggs but we have 37", 25, "eggs", 37],
    ["counted 25 crates of eggs, system says 37", 25, "eggs", 37],
    ["I counted 3 laundry soap but the app shows 5", 3, "laundry soap", 5],
    ["We counted only 12 bags of rice and the system has 20", 12, "rice", 20],
    ["recount eggs 25", 25, "eggs", undefined],
    ["stock count: laundry soap = 3", 3, "laundry soap", undefined],
    ["we only have 25 eggs but the system says 37", 25, "eggs", 37],
    ["the system says 37 eggs but we have 25", 25, "eggs", 37],
    ["set eggs stock to 25", 25, "eggs", undefined],
    ["adjust stock of rice to 18", 18, "rice", undefined],
    ["I counted 0 eggs", 0, "eggs", undefined],
  ])("%s", (text, counted, product, recorded) => expect(parseCountCommand(text)).toEqual({ counted, productText: product, statedRecorded: recorded }));

  it("a recount with no number yet", () => expect(parseCountCommand("Recount laundry soap")).toEqual({ productText: "laundry soap" }));

  it.each([
    "How many eggs did we count?", "How many eggs are left?", "Sell 2 eggs to Kwame", "Show today's sales", "change eggs price to 5",
    "adjust the price of eggs to 5", "what is the system count", "Kwame paid 50 cedis",
  ])("ignores: %s", (text) => expect(parseCountCommand(text)).toBeNull());
});

describe("answers to questions asked mid-flow", () => {
  it("phone", () => {
    expect(parsePhoneAnswer("0241234567")).toBe("0241234567");
    expect(parsePhoneAnswer("it's +233 24 123 4567")).toBe("+233 24 123 4567");
    expect(parsePhoneAnswer("12345")).toBeUndefined();
    expect(parsePhoneAnswer("call me later")).toBeUndefined();
  });
  it("count", () => {
    expect(parseCountAnswer("25")).toBe(25);
    expect(parseCountAnswer("about 25")).toBe(25);
    expect(parseCountAnswer("none")).toBe(0);
    expect(parseCountAnswer("0")).toBe(0);
    expect(parseCountAnswer("lots")).toBeUndefined();
  });
  it("price", () => {
    expect(parsePriceAnswer("12")).toBe("12");
    expect(parsePriceAnswer("12.50 cedis")).toBe("12.50");
    expect(parsePriceAnswer("price is GHS 8")).toBe("8");
    expect(parsePriceAnswer("twelve")).toBe("12");
    expect(parsePriceAnswer("lots")).toBeUndefined();
  });
  it("new name", () => {
    expect(parseNewNameAnswer("it's ama mensah")).toBe("Ama Mensah");
    expect(parseNewNameAnswer("Kofi Traders")).toBe("Kofi Traders");
    expect(tidyName("???")).toBeUndefined();
  });
});
