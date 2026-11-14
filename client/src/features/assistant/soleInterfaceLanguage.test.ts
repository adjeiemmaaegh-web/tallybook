import {describe,expect,it} from "vitest";
import {normalizeSoleInterfaceRequest as normalize} from "./soleInterfaceLanguage";

describe("Clementia natural-language wrappers do not change business intent",()=>{
  it.each([
    ["Can you add supplier Accra Wholesalers?","add supplier Accra Wholesalers"],
    ["Could you add customer Ama Serwaa?","add customer Ama Serwaa"],
    ["I need you to add category Drinks.","add category Drinks."],
    ["Please record a sale.","record a sale."],
    ["As a new user, please add product Palm oil, price 12.","add product Palm oil, price 12."],
    ["Clementia, add supplier Accra Wholesalers.","add supplier Accra Wholesalers."],
    ["Without browsing screens, add category Drinks.","add category Drinks."],
    ["I do not want to open menus. Show today's sales.","Show today's sales."],
    ["For my shop, add supplier Accra Wholesalers.","add supplier Accra Wholesalers."],
    ["Help me: add supplier Accra Wholesalers.","add supplier Accra Wholesalers."],
    ["Now please add category Drinks.","add category Drinks."],
    ["When you can, add category Drinks.","add category Drinks."],
    ["Quick request: Show today's sales.","Show today's sales."],
    ["Please answer clearly: How much does Adwoa owe?","How much does Adwoa owe"],
    ["I am relying only on Clementia. Open Stock page.","Open Stock page."],
    ["What I need is this: Sell 2 eggs to Kwame on credit.","Sell 2 eggs to Kwame on credit."],
    ["For my business today, show low stock.","show low stock."],
  ])("normalizes %s", (raw,expected)=>{
    expect(normalize(raw)).toBe(expected);
  });
  it.each([
    "How do I add supplier Accra Wholesalers?",
    "Can you show me how to add supplier Accra Wholesalers?",
    "Can I sell 2 eggs on credit?",
    "What steps should I follow to delete a product?",
    "I will sell 2 eggs tomorrow",
    "I am planning to send 100 cedis next week",
    "Tell me why I should issue a receipt",
    "Can you walk me through how to refund a sale?",
    "Could you explain how to restore a backup?",
    "Do you know how to collect real MoMo?",
  ])("never converts a genuine question or future statement into an imperative: %s", raw=>{
    expect(normalize(raw)).toBe(raw);
  });
  it("preserves the full entity and amount, not a generic alias",()=>{
    expect(normalize("Could you add product Aloe Soap, selling price 12.50?")).toBe("add product Aloe Soap, selling price 12.50");
  });
});
