import type { ParsedEntities, AssistantIntent } from "../types";

export interface EvalCase { text: string; intent: AssistantIntent; expect?: Partial<ParsedEntities>; known?: string }

const group = (intent: AssistantIntent, texts: string[], known?: string): EvalCase[] => texts.map((text) => ({ text, intent, ...(known ? { known } : {}) }));

export const evaluationCases: EvalCase[] = [
  ...group("CUSTOMER_BALANCE", ["how much does Kwame owe", "what is Kwame's balance", "does Kwame owe me anything", "show me Kwame debt", "how much money is Kwame owing", "check Adwoa outstanding", "what does Kwame still owe", "tell me Adwoa's arrears", "is Kwame unpaid" ]),
  ...group("INVENTORY_QUERY", ["show me my inventory", "show me stock", "how many eggs do we have", "what is the rice stock", "how much soap is left", "check stock for eggs", "what do we have on hand", "show current inventory", "how many units of rice are available" ]),
  ...group("TODAY_SALES", ["what are my sales today", "what did we sell today", "show sales today", "how much did we sell today", "today's sales", "sales today", "what are today's takings", "how much have we sold so far today", "show me today's revenue"]),
  ...group("SALES_QUERY", ["how much did we sell this month", "show sales last month", "what were our sales this year", "sales for the last 7 days", "how much did we sell in the last 30 days", "show revenue yesterday", "what are sales all time", "show sales this week", "how much did the shop earn last year"]),
  ...group("RECORD_SALE", ["sell 2 eggs to Kwame cash", "Kwame bought two eggs cash", "record a sale of 3 rice", "sell one soap to Adwoa on credit", "I sold 4 eggs cash", "log 2 units of rice to Kwame", "make a sale: 3 eggs cash", "record new sale of one soap", "Kwame bought five eggs"]),
  ...group("RECEIVE_STOCK", ["receive 10 eggs from Kofi", "we got 5 bags of rice", "record stock received from ABC Suppliers", "add 20 soap received", "we purchased 4 eggs from Kofi", "restock 3 rice", "Kofi delivered 8 eggs", "log a new stock purchase", "we bought 10 soaps from ABC Suppliers"]),
  ...group("RECORD_CUSTOMER_PAYMENT", ["Kwame paid 50", "record payment from Adwoa", "Adwoa repaid 100", "log Kwame's payment of 40", "receive 25 from Kwame", "customer payment from Adwoa", "Kwame settled 60 cash", "enter payment for Kwame", "Adwoa paid me 75"]),
  ...group("SUPPLIER_PURCHASES", ["what did Kofi supply", "which supplier delivered last month", "what did ABC Suppliers purchase", "show Kofi purchase history", "what has Kofi supplied", "which vendor delivered", "tell me supplier purchases", "what did the wholesaler bring", "show purchases from Kofi"]),
  ...group("SUPPLIER_BALANCE", ["how much do I owe Kofi", "what do we owe Kofi", "show debt owed to ABC Suppliers", "how much is owed to Kofi", "does the shop owe Kofi", "check supplier balance for Kofi", "what is our outstanding with Kofi", "tell me what we owe the vendor", "supplier Kofi is owed how much"]),
  ...group("UNSUPPORTED_ACTION", ["delete a sale", "remove a payment", "cancel a transaction", "edit customer balance", "change product price", "undo inventory adjustment", "refund the sale", "what expenses did we spend", "waive Kwame debt"]),
  ...group("HELP", ["help", "commands", "examples", "what can you do", "what can I ask", "how do I use this", "what do you do", "instructions", "menu"]),
  ...group("TOP_DEBTORS", ["who owes us the most", "which customers owe most", "top debtors", "biggest debtors this month", "show highest outstanding customers", "who are the biggest debtors", "top 3 debtors", "which people owe", "what customers owe the most"]),
  ...group("LOW_STOCK", ["what is running low", "which stock is low", "show low stock", "what needs reorder", "which products need restocking", "are we short on anything", "tell me low inventory", "show products short on stock", "show products running low"]),
  ...group("BEST_SELLING", ["what is best-selling", "show best sellers", "top selling products", "what sells most", "best-selling this month", "which products are fastest selling", "show top products", "highest selling items", "what were our biggest sellers"]),
  ...group("CUSTOMERS_WHO_BOUGHT", ["which customers bought today", "who bought this month", "show customers who purchased", "what customers bought last month", "who shopped today", "top customers this year", "which people ordered", "who spent the most", "customers who bought eggs"]),
  ...group("CREATE_CUSTOMER", ["add customer Ama Mensah", "create a customer called Kojo", "register new customer Abena", "new customer Yaw", "save Ama as a customer", "add client Kofi", "create buyer Esi", "open a customer named Adjoa", "record customer Nana"]),
  ...group("CREATE_PRODUCT", ["add product Palm oil", "create a new product Sugar", "register item Bread", "new product Milk", "save product Eggs", "add item Rice", "create product Soap", "open a product called Flour", "record new item Biscuits"]),
  ...group("CREATE_CATEGORY", ["add category Drinks", "create product category Snacks", "register category Grocery", "new category Toiletries", "save category Household", "add categories Beverages", "create a product category Food", "open category Cleaning", "record category Staples"]),
  ...group("CREATE_SUPPLIER", ["add supplier Kofi Traders", "create a supplier called ABC Suppliers", "register vendor Ama Foods", "new supplier Yaw Trading", "save wholesaler Kofi", "add vendor Esi Stores", "create supplier Nana Ltd", "open supplier called Accra Goods", "record new vendor Kumasi Supply"]),
  ...group("ADJUST_INVENTORY", ["I counted 25 eggs but the system says 30", "recount rice 12", "stock count: laundry soap = 3", "we have 7 eggs but the system says 9", "the system says 20 rice but we have 18", "adjust stock of soap to 4", "I found 6 eggs", "counted 10 units of rice", "set inventory of soap to 2"]),
  ...group("INSIGHTS_QUERY", ["are sales up this month", "how are sales compared with last month", "sales increase this month", "show sales comparison", "what should I reorder", "give me reorder suggestions", "what are the slow movers", "show slow-moving products"]),
  ...group("UNKNOWN", ["what is the weather", "tell me a joke", "who is the president", "what is the capital of Ghana", "help me write an email", "play some music", "what time is it", "translate this sentence", "how do I cook rice", "tell me a football score", "write a birthday message", "what is two plus two"]),

  // Added with the memory / batch / activity-log / phrasing update: newer intents, and messier everyday phrasing.
  ...group("ACTIVITY_QUERY", ["what did the assistant record today", "show assistant activity", "what have you done today", "what did you save this month", "show the activity log", "what did you record yesterday"]),
  ...group("INSIGHTS_QUERY", ["what should I reorder this week"]),
  ...group("CUSTOMERS_WHO_BOUGHT", ["which customers bought eggs this month", "who bought rice last month"]),
  ...group("CUSTOMER_BALANCE", ["is Adwoa still owing", "what does Kwame owe me", "Adwoa debt", "whats the balance for adwoa"]),
  ...group("INVENTORY_QUERY", ["eggs left?", "rice remaining", "do we still have rice", "any soap left"]),
  ...group("TODAY_SALES", ["sales today pls", "how much money did we make today", "what did i sell today", "todays total"]),
  ...group("RECORD_SALE", ["sell two eggs kwame cash", "sold 5 eggs"]),
  ...group("RECEIVE_STOCK", ["i got 10 eggs from kofi", "bought 5 bags of rice from ABC Suppliers", "Kofi brought 8 eggs"]),
  ...group("RECORD_CUSTOMER_PAYMENT", ["Kwame gave me 50", "Adwoa has paid 100 cash"]),
  ...group("LOW_STOCK", ["whats low", "anything finishing", "what is running out"]),
  ...group("TOP_DEBTORS", ["who owes me money", "top 5 debtors this year"]),
  ...group("BEST_SELLING", ["best sellers this week", "which product sells best"]),
  ...group("UNSUPPORTED_ACTION", ["refund Kwame", "give Kwame a discount"]),
  ...group("CREATE_CUSTOMER", ["add customer kojo mensah 0551234567"]),
  ...group("CREATE_PRODUCT", ["new product bread price 3"]),
  ...group("UNKNOWN", ["sing me a song", "whats 20 percent of 150", "send a message to Kwame", "call Kwame"]),
  // Real phrasing the parser does not handle yet. Listed so the gap is visible, not hidden.
  ...group("INSIGHTS_QUERY", ["are we making more than last month", "sales vs last month", "which products are not selling"], "The insights scorer does not recognise these wordings yet (left unchanged; broaden its patterns if you want them)."),
  ...group("CUSTOMER_BALANCE", ["how much dey Kwame owe", "wetin Kwame owe me", "hw much does kwame ow"], "Pidgin and typos are not supported; the languages shop owners use should decide what to add."),
  ...group("RECORD_SALE", ["Kwame took 3 rice on credit", "give Kwame 2 eggs cash"], "Sale phrasings without a sell/record verb are not recognised yet."),
  ...group("RECORD_CUSTOMER_PAYMENT", ["got 40 from Adwoa"], "Ambiguous on purpose: money from a customer or stock from a supplier. Left to ask rather than guess."),
];

const knownGapReasons: Record<string, string> = {
  "receive 25 from Kwame": "Ambiguous 'receive from' wording is classified as stock receipt at medium confidence.",
};
for (const testCase of evaluationCases) if (knownGapReasons[testCase.text]) testCase.known = knownGapReasons[testCase.text];

const entityExpectations: Record<string, Partial<ParsedEntities>> = {
  "which customers bought eggs this month": { productText: "eggs" },
  "Kwame gave me 50": { customerText: "kwame", amount: "50" },
  "Kofi brought 8 eggs": { productText: "eggs", quantity: 8 },
  "how much does Kwame owe": { customerText: "kwame" },
  "how many eggs do we have": { productText: "eggs" },
  "sell 2 eggs to Kwame cash": { productText: "eggs", quantity: 2, customerText: "kwame", paymentMethod: "cash" },
  "receive 10 eggs from Kofi": { productText: "eggs", quantity: 10, supplierText: "kofi" },
  "Kwame paid 50": { customerText: "kwame", amount: "50" },
  "create a customer called Kojo": { customerText: "Kojo" },
  "I counted 25 eggs but the system says 30": { counted: 25, productText: "eggs", statedRecorded: 30 },
};
for (const testCase of evaluationCases) if (entityExpectations[testCase.text]) testCase.expect = entityExpectations[testCase.text];

export const evaluationCaseCount = evaluationCases.length;
export const transactionIntents = new Set<AssistantIntent>(["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"]);
/** Baseline guard: parser changes must not silently fall below this measured accuracy. */
export const BASELINE_MIN_ACCURACY = 0.75;
