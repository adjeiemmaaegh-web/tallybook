/** Tallybook Assistant: the offline parser must classify the supported phrasings, extract only what was said, and never guess. */
import { describe, expect, it } from "vitest";
import { parseCommand, parseCostAnswer, parseCustomerAnswer, parsePaymentAnswer } from "./intentParser";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM } from "./types";

// Monday, 21 September 2026 (local noon) keeps weekday/yesterday expectations stable.
const NOW = new Date(2026, 8, 21, 12, 0, 0);
const parse = (text: string) => parseCommand(text, { now: NOW });

describe("customer balance", () => {
  it.each([
    ["How much does Adwoa owe?", "adwoa"],
    ["Adwoa owes how much?", "adwoa"],
    ["What is Adwoa's balance?", "adwoa"],
    ["What's Adwoa's balance?", "adwoa"],
    ["How much does Adwoa still owe us?", "adwoa"],
    ["Show Adwoa's outstanding balance.", "adwoa"],
    ["Adwoa owe how much?", "adwoa"],
    ["What's Adwoa's debt?", "adwoa"],
    ["How much is Adwoa owing us?", "adwoa"],
    ["Show Adwoa balance.", "adwoa"],
    ["How much does Adwoa Mensah owe?", "adwoa mensah"],
    ["ADWOA owes how much", "adwoa"],
  ])("%s", (text, name) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe("CUSTOMER_BALANCE");
    expect(parsed.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(parsed.entities.customerText).toBe(name);
  });

  it("does not treat 'we owe' as a customer balance", () => {
    expect(parse("How much do we owe Kofi Traders?").intent).toBe("SUPPLIER_BALANCE");
  });
});

describe("inventory", () => {
  it.each([
    ["How many crates of eggs are left?", "eggs", "crate"],
    ["How much eggs do we have?", "eggs", undefined],
    ["How many eggs are in stock?", "eggs", undefined],
    ["What's the current stock of eggs?", "eggs", undefined],
    ["Egg stock?", "egg", undefined],
    ["How many eggs left?", "eggs", undefined],
    ["What's our egg inventory?", "egg", undefined],
    ["How many crates of eggs?", "eggs", "crate"],
    ["Do we have eggs?", "eggs", undefined],
  ])("%s", (text, product, unit) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe("INVENTORY_QUERY");
    expect(parsed.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(parsed.entities.productText).toBe(product);
    expect(parsed.entities.unit).toBe(unit);
  });
});

describe("sales questions", () => {
  it.each(["Show today's sales.", "How much did we sell today?", "What are today's sales?", "Show sales for today."])("%s → today", (text) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe("TODAY_SALES");
    expect(parsed.period).toEqual({ kind: "today" });
    expect(parsed.qualifier).toBeUndefined();
    expect(parsed.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
  });

  it("resolves yesterday, weekdays, last 7 days and this week", () => {
    expect(parse("How much did we sell yesterday?").period).toMatchObject({ kind: "day", year: 2026, month: 9, day: 20, source: "yesterday" });
    expect(parse("Show sales for Monday").period).toMatchObject({ kind: "day", day: 21 });
    expect(parse("Show sales for Friday").period).toMatchObject({ kind: "day", month: 9, day: 18 });
    expect(parse("Show sales last Monday").period).toMatchObject({ kind: "day", day: 14 });
    expect(parse("Show sales for the last 7 days").period).toEqual({ kind: "last7", approximatesWeek: false });
    expect(parse("What did we sell this week?").period).toEqual({ kind: "range", id: "thisWeek" });
    expect(parse("Show sales for 2026-09-15").period).toMatchObject({ kind: "day", month: 9, day: 15, source: "date" });
    expect(parse("Show sales for 15/09/2026").period).toMatchObject({ kind: "day", month: 9, day: 15 });
  });

  it("flags periods and filters it cannot honour instead of answering something else", () => {
    expect(parse("Show sales for last month").period).toEqual({ kind: "range", id: "lastMonth" });
    expect(parse("Show sales for last quarter").period).toEqual({ kind: "range", id: "lastQuarter" });
    expect(parse("Show sales for 31/02/2026").period?.kind).toBe("unsupported");
    expect(parse("Show sales for 2027-01-01").period?.kind).toBe("unsupported");
    expect(parse("How many eggs did we sell today?").qualifier).toBe("eggs");
    expect(parse("How much did we sell to Adwoa today?").qualifier).toBe("to adwoa");
  });

  it("asks for a period when none is given", () => {
    expect(parse("Show sales").period).toEqual({ kind: "unspecified" });
  });
});

describe("record sale", () => {
  it("parses the primary example", () => {
    const parsed = parse("Record 2 crates of eggs sold to walk-in customer, paid cash.");
    expect(parsed.intent).toBe("RECORD_SALE");
    expect(parsed.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(parsed.entities).toMatchObject({ productText: "eggs", quantity: 2, unit: "crate", walkIn: true, paymentMethod: "cash", paymentStatus: "paid" });
    expect(parsed.entities.customerText).toBeUndefined();
  });

  it("parses a named customer and a cash payment", () => {
    const parsed = parse("Sell 3 crates of eggs to Adwoa, paid cash.");
    expect(parsed.entities).toMatchObject({ productText: "eggs", quantity: 3, unit: "crate", customerText: "adwoa", paymentMethod: "cash", paymentStatus: "paid" });
    expect(parse("Sell 3 crates eggs to Adwoa, she paid cash.").entities).toMatchObject({ productText: "eggs", quantity: 3, customerText: "adwoa", paymentMethod: "cash" });
  });

  it("parses credit sales", () => {
    const parsed = parse("I sold 5 bags of rice to Kwame on credit.");
    expect(parsed.intent).toBe("RECORD_SALE");
    expect(parsed.entities).toMatchObject({ productText: "rice", quantity: 5, unit: "bag", customerText: "kwame", paymentMethod: "credit", paymentStatus: "unpaid" });
  });

  it("understands number words, articles, and customer-first phrasing", () => {
    expect(parse("Sold two crates of eggs to Kwame, paid cash").entities).toMatchObject({ quantity: 2, productText: "eggs" });
    expect(parse("I sold a bag of rice to Ama on credit").entities).toMatchObject({ quantity: 1, unit: "bag", productText: "rice" });
    const bought = parse("Kwame bought 5 bags of rice on credit");
    expect(bought.intent).toBe("RECORD_SALE");
    expect(bought.entities).toMatchObject({ customerText: "kwame", quantity: 5, paymentMethod: "credit" });
  });

  it("reads mobile money, card, part payments, and mentions of prices it will not use", () => {
    expect(parse("Sell 2 crates of eggs to Ama, paid momo").entities).toMatchObject({ paymentMethod: "mobile" });
    expect(parse("Sell 2 crates of eggs to Ama, paid with MTN mobile money").entities).toMatchObject({ paymentMethod: "mobile", providerHint: "mtn" });
    expect(parse("Sell 2 crates of eggs to Ama, paid by card").entities.paymentMethod).toBe("card");
    expect(parse("Sell 3 crates of eggs to Ama, paid 50 cedis cash").entities).toMatchObject({ amount: "50", paymentMethod: "cash" });
    expect(parse("Sell 3 crates of eggs to Ama at 50 each, cash").entities.priceMentioned).toBeTruthy();
    expect(parse("Sell 3 crates of eggs to Ama with a discount, cash").entities.discountMentioned).toBe(true);
    expect(parse("Sell 2 crates of eggs to Ama, paid cash on credit").entities.paymentConflict).toBe(true);
  });

  it("recognises a sale but leaves the missing details empty", () => {
    for (const text of ["sell something", "record a sale", "new sale"]) {
      const parsed = parse(text);
      expect(parsed.intent).toBe("RECORD_SALE");
      expect(parsed.entities.productText).toBeUndefined();
      expect(parsed.entities.quantity).toBeUndefined();
    }
  });

  it("does not accept fractional or absurd quantities as valid", () => {
    expect(parse("Sell 2.5 crates of eggs to Ama, cash").entities.quantity).toBeUndefined();
    expect(parse("Sell 2.5 crates of eggs to Ama, cash").entities.invalidQuantityText).toBe("2.5");
  });
});

describe("receive stock", () => {
  it("parses the primary examples", () => {
    const first = parse("I received 10 crates of eggs from Kofi Traders.");
    expect(first.intent).toBe("RECEIVE_STOCK");
    expect(first.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(first.entities).toMatchObject({ productText: "eggs", quantity: 10, unit: "crate", supplierText: "kofi traders" });
    expect(parse("Record 20 bags of rice received from ABC Suppliers.").entities).toMatchObject({ productText: "rice", quantity: 20, unit: "bag", supplierText: "abc suppliers" });
  });

  it("reads costs and dates only when they are stated", () => {
    expect(parse("I received 10 crates of eggs from Kofi Traders at 25 each").entities.unitCost).toBe("25");
    expect(parse("Received 10 crates of eggs from Kofi for 250 total").entities.totalCost).toBe("250");
    expect(parse("Received 10 crates of eggs from Kofi yesterday").entities.dateText).toBe("yesterday");
    const plain = parse("I received 10 crates of eggs from Kofi Traders");
    expect(plain.entities.unitCost).toBeUndefined();
    expect(plain.entities.totalCost).toBeUndefined();
    expect(plain.entities.dateText).toBeUndefined();
  });

  it("supports synonyms", () => {
    expect(parse("Bought 10 crates of eggs from Kofi Traders").intent).toBe("RECEIVE_STOCK");
    expect(parse("Kofi Traders delivered 10 crates of eggs").entities).toMatchObject({ supplierText: "kofi traders", quantity: 10 });
  });

  it("asks rather than guessing when a bare number is received from someone", () => {
    const parsed = parse("Received 100 from Adwoa");
    expect(parsed.confidence).toBeLessThan(CONFIDENCE_HIGH);
  });
});

describe("customer payment", () => {
  it.each([
    ["Adwoa paid 100 cedis.", "adwoa", "100"],
    ["Record 200 GHS payment from Adwoa.", "adwoa", "200"],
    ["Adwoa has paid GHS 1,250.50", "adwoa", "1250.50"],
    ["Received 100 cedis from Adwoa", "adwoa", "100"],
    ["Adwoa paid me fifty cedis", "adwoa", "50"],
  ])("%s", (text, name, amount) => {
    const parsed = parse(text);
    expect(parsed.intent).toBe("RECORD_CUSTOMER_PAYMENT");
    expect(parsed.confidence).toBeGreaterThanOrEqual(CONFIDENCE_HIGH);
    expect(parsed.entities).toMatchObject({ customerText: name, amount });
  });

  it("captures the method and currency when given", () => {
    expect(parse("Adwoa paid 100 cedis by momo").entities).toMatchObject({ paymentMethod: "mobile", currency: "GHS" });
    expect(parse("Adwoa paid 100 dollars").entities.currency).toBe("USD");
    expect(parse("Adwoa paid 100 shillings").entities.currencyAmbiguous).toBe(true);
  });

  it("a sale with 'paid cash' is a sale, never a customer payment", () => {
    expect(parse("Sell 3 crates of eggs to Adwoa, she paid cash.").intent).toBe("RECORD_SALE");
  });

  it("ignores pronouns as customer names", () => {
    expect(parse("She paid 100 cedis").entities.customerText).toBeUndefined();
  });
});

describe("supplier questions", () => {
  it("answers what was received, and recognises the unsupported balance question", () => {
    const received = parse("What did we receive from Kofi Traders?");
    expect(received.intent).toBe("SUPPLIER_PURCHASES");
    expect(received.entities.supplierText).toBe("kofi traders");
    expect(parse("Show purchases from Kofi Traders").intent).toBe("SUPPLIER_PURCHASES");
    const owed = parse("How much do we owe Kofi Traders?");
    expect(owed.intent).toBe("SUPPLIER_BALANCE");
    expect(owed.entities.supplierText).toBe("kofi traders");
  });
});

describe("unsupported, unknown and ambiguous input", () => {
  it("recognises destructive or unavailable actions and refuses them explicitly", () => {
    expect(parse("Delete the last sale").intent).toBe("UNSUPPORTED_ACTION");
    expect(parse("Cancel Adwoa's payment").intent).toBe("UNSUPPORTED_ACTION");
    expect(parse("Clear Adwoa's balance").intent).toBe("UNSUPPORTED_ACTION");
    expect(parse("Record an expense of 50 cedis").unsupportedTopic).toBe("expense");
  });

  it("does not classify unrelated requests", () => {
    for (const text of ["What is the capital of France?", "Tell me a joke", "asdf qwerty zxcv", "What's the weather like today?"]) {
      const parsed = parse(text);
      expect(parsed.confidence).toBeLessThan(CONFIDENCE_MEDIUM);
    }
  });

  it("keeps bare names as mentions for the router to offer choices, not as commands", () => {
    for (const text of ["Adwoa", "eggs"]) {
      const parsed = parse(text);
      expect(parsed.intent).toBe("UNKNOWN");
      expect(parsed.bareMention).toBe(text.toLowerCase());
    }
  });

  it("recognises help", () => {
    expect(parse("help").intent).toBe("HELP");
    expect(parse("What can you do?").intent).toBe("HELP");
  });

  it("handles empty and hostile input safely", () => {
    expect(parse("").intent).toBe("UNKNOWN");
    expect(parse("   ").intent).toBe("UNKNOWN");
    expect(parse("<script>alert(1)</script>").confidence).toBe(0);
    expect(parse("a".repeat(5000)).intent).toBe("UNKNOWN");
    expect(parse("sell ".repeat(200)).intent).toBe("RECORD_SALE");
  });
});

describe("answers to follow-up questions", () => {
  it("reads customer, payment and cost answers", () => {
    expect(parseCustomerAnswer("walk-in")).toEqual({ walkIn: true });
    expect(parseCustomerAnswer("it was Adwoa")).toEqual({ name: "adwoa" });
    expect(parseCustomerAnswer("to Kwame Boateng")).toEqual({ name: "kwame boateng" });
    expect(parsePaymentAnswer("cash").method).toBe("cash");
    expect(parsePaymentAnswer("on credit").method).toBe("credit");
    expect(parsePaymentAnswer("mobile money").method).toBe("mobile");
    expect(parseCostAnswer("28")).toEqual({ unitCost: "28" });
    expect(parseCostAnswer("cost 28 each")).toEqual({ unitCost: "28" });
    expect(parseCostAnswer("GHS 250 total")).toEqual({ totalCost: "250" });
    expect(parseCostAnswer("hello")).toBeNull();
  });
});
