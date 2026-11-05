/**
 * Held-out phrasing set: sentences the parser was NOT tuned on, written the way
 * Ghanaian shop owners plausibly type or dictate: Ghanaian English, pidgin,
 * "cedis/ghc", local products, voice-typing style (no punctuation, numbers as
 * words), typos, and requests that must NOT be acted on.
 *
 * Written by the team (2026-11-05), not collected from real users. Replace or
 * extend with consented real phrases as they become available. Used only to
 * measure understanding; it is not a regression gate.
 */
import type { AssistantIntent, ParsedEntities } from "../types";

export interface HeldoutCase {
  text: string;
  intent: AssistantIntent;
  /** Only the fields that matter for safety: quantity and money must match exactly; names must be contained. */
  expect?: Pick<Partial<ParsedEntities>, "quantity" | "amount" | "productText" | "customerText" | "supplierText" | "paymentMethod">;
  style: "ghanaian-english" | "pidgin" | "voice" | "typo" | "standard";
}

const c = (intent: AssistantIntent, style: HeldoutCase["style"], text: string, expect?: HeldoutCase["expect"]): HeldoutCase =>
  ({ text, intent, style, ...(expect ? { expect } : {}) });

export const heldoutCases: HeldoutCase[] = [
  // ---- customer balance
  c("CUSTOMER_BALANCE", "pidgin", "how much kwame dey owe", { customerText: "kwame" }),
  c("CUSTOMER_BALANCE", "ghanaian-english", "Kwame owe me how much", { customerText: "kwame" }),
  c("CUSTOMER_BALANCE", "standard", "Kwame balance", { customerText: "kwame" }),
  c("CUSTOMER_BALANCE", "ghanaian-english", "check Ama account", { customerText: "ama" }),
  c("CUSTOMER_BALANCE", "ghanaian-english", "how much is remaining on Ama's credit", { customerText: "ama" }),
  c("CUSTOMER_BALANCE", "ghanaian-english", "Ama still get balance?", { customerText: "ama" }),
  c("CUSTOMER_BALANCE", "ghanaian-english", "Auntie Esi owes how much"),
  c("CUSTOMER_BALANCE", "pidgin", "wetin Yaw owe me", { customerText: "yaw" }),
  c("CUSTOMER_BALANCE", "standard", "what is left for Abena to pay", { customerText: "abena" }),
  c("CUSTOMER_BALANCE", "voice", "how much does kwame owe me now", { customerText: "kwame" }),
  c("CUSTOMER_BALANCE", "typo", "how much dose kwame owe", { customerText: "kwame" }),

  // ---- stock on hand
  c("INVENTORY_QUERY", "ghanaian-english", "how many milo remain", { productText: "milo" }),
  c("INVENTORY_QUERY", "ghanaian-english", "eggs remain how many", { productText: "eggs" }),
  c("INVENTORY_QUERY", "pidgin", "check how much gari i get", { productText: "gari" }),
  c("INVENTORY_QUERY", "standard", "do we still have indomie", { productText: "indomie" }),
  c("INVENTORY_QUERY", "standard", "stock of rice pls", { productText: "rice" }),
  c("INVENTORY_QUERY", "pidgin", "milo dey?", { productText: "milo" }),
  c("INVENTORY_QUERY", "ghanaian-english", "how many crates of eggs left"),
  c("INVENTORY_QUERY", "standard", "is there sugar left", { productText: "sugar" }),
  c("INVENTORY_QUERY", "voice", "how much sachet water do we have"),
  c("INVENTORY_QUERY", "typo", "how many egs do we have"),
  c("INVENTORY_QUERY", "ghanaian-english", "sugar remaining in the shop", { productText: "sugar" }),

  // ---- today's sales
  c("TODAY_SALES", "ghanaian-english", "how much I make today"),
  c("TODAY_SALES", "pidgin", "today market how"),
  c("TODAY_SALES", "ghanaian-english", "how much we sell so far"),
  c("TODAY_SALES", "standard", "today's total"),
  c("TODAY_SALES", "standard", "what's the day's sales"),
  c("TODAY_SALES", "ghanaian-english", "how much money came in today"),
  c("TODAY_SALES", "ghanaian-english", "today sales how much"),
  c("TODAY_SALES", "pidgin", "how far today sales"),
  c("TODAY_SALES", "voice", "how much have i sold today"),
  c("TODAY_SALES", "typo", "todays sales pls"),

  // ---- other periods
  c("SALES_QUERY", "standard", "last week sales"),
  c("SALES_QUERY", "ghanaian-english", "how much we make last month"),
  c("SALES_QUERY", "standard", "this month how much did we make"),
  c("SALES_QUERY", "standard", "what did we make yesterday"),
  c("SALES_QUERY", "standard", "revenue for the past 2 weeks"),
  c("SALES_QUERY", "ghanaian-english", "how much we sell last 3 days"),
  c("SALES_QUERY", "standard", "total sales this year so far"),
  c("SALES_QUERY", "voice", "how much did we sell yesterday"),
  c("SALES_QUERY", "typo", "sales for yestarday"),

  // ---- record a sale (write: needs owner confirmation)
  c("RECORD_SALE", "standard", "sold 2 milo", { quantity: 2, productText: "milo" }),
  c("RECORD_SALE", "ghanaian-english", "Kwame took 3 eggs, he paid cash", { quantity: 3, productText: "eggs", customerText: "kwame" }),
  c("RECORD_SALE", "ghanaian-english", "2 gari for Ama, momo", { quantity: 2, productText: "gari", customerText: "ama" }),
  c("RECORD_SALE", "pidgin", "i sell 5 sachet water cash", { quantity: 5 }),
  c("RECORD_SALE", "ghanaian-english", "give Kwame 2 rice on credit", { quantity: 2, productText: "rice", customerText: "kwame" }),
  c("RECORD_SALE", "pidgin", "Ama buy 1 sugar", { quantity: 1, productText: "sugar", customerText: "ama" }),
  c("RECORD_SALE", "standard", "sold three crates of eggs to Auntie Esi", { quantity: 3 }),
  c("RECORD_SALE", "standard", "record 2 indomie sold", { quantity: 2, productText: "indomie" }),
  c("RECORD_SALE", "ghanaian-english", "Kwame collected 4 eggs, he will pay later", { quantity: 4, productText: "eggs", customerText: "kwame" }),
  c("RECORD_SALE", "standard", "just sold 6 pure water", { quantity: 6 }),
  c("RECORD_SALE", "standard", "2 milo to Yaw paid with mobile money", { quantity: 2, productText: "milo", customerText: "yaw" }),
  c("RECORD_SALE", "voice", "sell two eggs to kwame cash", { quantity: 2, productText: "eggs", customerText: "kwame" }),
  c("RECORD_SALE", "voice", "i just sold ten sachet water", { quantity: 10 }),
  c("RECORD_SALE", "typo", "sel 2 egss to kwame", { quantity: 2, customerText: "kwame" }),
  c("RECORD_SALE", "pidgin", "Yaw don buy 3 milo", { quantity: 3, productText: "milo", customerText: "yaw" }),
  c("RECORD_SALE", "ghanaian-english", "Ama has taken 2 bread on credit", { quantity: 2, productText: "bread", customerText: "ama" }),

  // ---- receive stock (write)
  c("RECEIVE_STOCK", "standard", "Kofi brought 20 eggs", { quantity: 20, productText: "eggs", supplierText: "kofi" }),
  c("RECEIVE_STOCK", "standard", "received 3 bags of rice from Kofi", { quantity: 3, supplierText: "kofi" }),
  c("RECEIVE_STOCK", "ghanaian-english", "new stock 12 milo", { quantity: 12, productText: "milo" }),
  c("RECEIVE_STOCK", "ghanaian-english", "just got 10 gari from the market", { quantity: 10, productText: "gari" }),
  c("RECEIVE_STOCK", "standard", "add 24 sachet water to stock", { quantity: 24 }),
  c("RECEIVE_STOCK", "standard", "supplier delivered 5 sugar", { quantity: 5, productText: "sugar" }),
  c("RECEIVE_STOCK", "standard", "bought 10 indomie for the shop", { quantity: 10, productText: "indomie" }),
  c("RECEIVE_STOCK", "pidgin", "Kofi supply 30 eggs", { quantity: 30, productText: "eggs", supplierText: "kofi" }),
  c("RECEIVE_STOCK", "voice", "kofi delivered twenty eggs", { quantity: 20, productText: "eggs", supplierText: "kofi" }),
  c("RECEIVE_STOCK", "typo", "recieve 10 eggs from kofi", { quantity: 10, productText: "eggs", supplierText: "kofi" }),
  c("RECEIVE_STOCK", "ghanaian-english", "Kofi has brought 6 crates of eggs", { quantity: 6, supplierText: "kofi" }),

  // ---- customer pays (write)
  c("RECORD_CUSTOMER_PAYMENT", "ghanaian-english", "Kwame brought 50 cedis", { amount: "50", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "pidgin", "Ama pay 20", { amount: "20", customerText: "ama" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "Kwame paid his debt 100 ghc", { amount: "100", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "receive 30 from Yaw momo", { amount: "30", customerText: "yaw" }),
  c("RECORD_CUSTOMER_PAYMENT", "ghanaian-english", "Auntie Esi gave me 40 for her credit", { amount: "40" }),
  c("RECORD_CUSTOMER_PAYMENT", "pidgin", "Kwame settle 25", { amount: "25", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "Ama has paid 15 cedis", { amount: "15", customerText: "ama" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "Yaw paid back 60", { amount: "60", customerText: "yaw" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "collected 50 from Kwame", { amount: "50", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "voice", "kwame paid fifty cedis", { amount: "50", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "typo", "kwame payed 50", { amount: "50", customerText: "kwame" }),
  c("RECORD_CUSTOMER_PAYMENT", "standard", "Kwame paid 12.50", { amount: "12.50", customerText: "kwame" }),

  // ---- what we owe suppliers / what they supplied
  c("SUPPLIER_BALANCE", "ghanaian-english", "how much I owe Kofi", { supplierText: "kofi" }),
  c("SUPPLIER_BALANCE", "pidgin", "wetin I dey owe Kofi", { supplierText: "kofi" }),
  c("SUPPLIER_BALANCE", "standard", "my debt to Kofi", { supplierText: "kofi" }),
  c("SUPPLIER_BALANCE", "standard", "how much do we still owe the supplier"),
  c("SUPPLIER_BALANCE", "voice", "how much do i owe kofi now", { supplierText: "kofi" }),
  c("SUPPLIER_PURCHASES", "ghanaian-english", "what Kofi brought last month", { supplierText: "kofi" }),
  c("SUPPLIER_PURCHASES", "standard", "Kofi deliveries", { supplierText: "kofi" }),
  c("SUPPLIER_PURCHASES", "standard", "what did i buy from Kofi", { supplierText: "kofi" }),
  c("SUPPLIER_PURCHASES", "standard", "show me supplies from Kofi", { supplierText: "kofi" }),

  // ---- aggregates
  c("TOP_DEBTORS", "pidgin", "who owe me pass"),
  c("TOP_DEBTORS", "standard", "list of people owing me"),
  c("TOP_DEBTORS", "standard", "debtors list"),
  c("TOP_DEBTORS", "standard", "who still owe"),
  c("TOP_DEBTORS", "pidgin", "customers wey dey owe"),
  c("TOP_DEBTORS", "standard", "who has the highest debt"),
  c("TOP_DEBTORS", "voice", "who are the people owing me money"),
  c("LOW_STOCK", "ghanaian-english", "what is finishing"),
  c("LOW_STOCK", "ghanaian-english", "things finishing in the shop"),
  c("LOW_STOCK", "standard", "what should i buy again"),
  c("LOW_STOCK", "standard", "items almost finished"),
  c("LOW_STOCK", "standard", "what do i need to restock"),
  c("LOW_STOCK", "standard", "what's about to run out"),
  c("LOW_STOCK", "pidgin", "wetin dey finish for shop"),
  c("BEST_SELLING", "standard", "what sells fast"),
  c("BEST_SELLING", "standard", "which item people buy most"),
  c("BEST_SELLING", "standard", "my best product"),
  c("BEST_SELLING", "standard", "what moves fastest"),
  c("BEST_SELLING", "standard", "top items this week"),
  c("BEST_SELLING", "pidgin", "what product dey sell pass"),
  c("CUSTOMERS_WHO_BOUGHT", "standard", "who bought milo", { productText: "milo" }),
  c("CUSTOMERS_WHO_BOUGHT", "standard", "which customers bought eggs this week", { productText: "eggs" }),
  c("CUSTOMERS_WHO_BOUGHT", "standard", "who came to buy today"),
  c("CUSTOMERS_WHO_BOUGHT", "standard", "people who bought rice", { productText: "rice" }),

  // ---- creating records (write)
  c("CREATE_CUSTOMER", "standard", "add new customer Auntie Esi"),
  c("CREATE_CUSTOMER", "standard", "register Yaw as customer"),
  c("CREATE_CUSTOMER", "ghanaian-english", "Kwesi is a new customer"),
  c("CREATE_CUSTOMER", "standard", "create customer Mama Ama"),
  c("CREATE_PRODUCT", "standard", "add milo to products"),
  c("CREATE_PRODUCT", "standard", "new item gari"),
  c("CREATE_PRODUCT", "ghanaian-english", "put sachet water in my products"),
  c("CREATE_PRODUCT", "standard", "create product indomie"),

  // ---- things the Assistant must not do directly
  c("UNSUPPORTED_ACTION", "standard", "delete yesterday sale"),
  c("UNSUPPORTED_ACTION", "standard", "cancel the last sale"),
  c("UNSUPPORTED_ACTION", "standard", "change price of milo"),
  c("UNSUPPORTED_ACTION", "ghanaian-english", "make sugar 12 cedis now"),
  c("UNSUPPORTED_ACTION", "standard", "clear Kwame debt"),

  // ---- help
  c("HELP", "standard", "how do i use you"),
  c("HELP", "standard", "what can you help me with"),
  c("HELP", "standard", "help me"),

  // ---- must NOT become a sale, stock receipt or payment
  c("UNKNOWN", "standard", "hello"),
  c("UNKNOWN", "ghanaian-english", "good morning"),
  c("UNKNOWN", "standard", "how much is milo"),
  c("UNKNOWN", "standard", "what is the price of eggs"),
  c("UNKNOWN", "standard", "is it going to rain"),
  c("UNKNOWN", "standard", "Kwame"),
  c("UNKNOWN", "standard", "2 eggs"),
  c("UNKNOWN", "standard", "tell me a joke"),
  c("UNKNOWN", "ghanaian-english", "Kwame wants to buy 2 eggs tomorrow"),
  c("UNKNOWN", "ghanaian-english", "Kwame said he will pay 50 next week"),
  c("UNKNOWN", "standard", "should I buy more rice"),
  c("UNKNOWN", "ghanaian-english", "Kofi is coming with eggs tomorrow"),
  c("UNKNOWN", "standard", "how much profit if i sell 10 milo"),
  c("UNKNOWN", "voice", "um wait"),
  c("UNKNOWN", "pidgin", "abeg"),
];
