import type { LexicalConcept } from "./lexicalCandidates";

export const TINY_NLU_LANGUAGE_PACK: readonly LexicalConcept[] = [
  { kind: "action", concept: "OPEN", variants: ["open", "opn", "opin", "bring", "bring up", "go", "take"] },
  { kind: "action", concept: "SHOW", variants: ["show", "see", "view", "display", "list", "check", "look"] },
  { kind: "action", concept: "CREATE", variants: ["create", "add", "new", "register"] },
  { kind: "action", concept: "RECORD", variants: ["record", "log", "enter", "put", "save"] },
  { kind: "action", concept: "PAY", variants: ["pay", "paid", "owe", "owes", "repay", "settle"] },
  { kind: "action", concept: "RECEIVE", variants: ["receive", "received", "recieve", "brought", "bring", "got"] },
  { kind: "action", concept: "DELETE", variants: ["delete", "remove", "cancel", "refund", "reverse", "undo", "erase", "clear", "change", "edit"] },
  { kind: "action", concept: "COMPARE", variants: ["compare", "versus", "versus", "up", "down"] },
  { kind: "object", concept: "STOCK", variants: ["stock", "stk", "sto", "inventory", "inventry", "inventori", "goods", "items", "left", "remain"] },
  { kind: "object", concept: "PRODUCT", variants: ["product", "products", "prod", "item", "items"] },
  { kind: "object", concept: "CUSTOMER", variants: ["customer", "customers", "cust", "custmr", "custmer", "client", "buyer"] },
  { kind: "object", concept: "SUPPLIER", variants: ["supplier", "suplier", "supplir", "vendor", "vendors"] },
  { kind: "object", concept: "SALE", variants: ["sale", "sales", "selling", "receipt", "receipts"] },
  { kind: "object", concept: "PAYMENT", variants: ["payment", "payments", "paid", "repayment"] },
  { kind: "object", concept: "PURCHASE", variants: ["purchase", "purchases", "buy", "bought", "buying"] },
  { kind: "object", concept: "EXPENSE", variants: ["expense", "expenses", "expence", "spending", "costs"] },
  { kind: "object", concept: "REPORT", variants: ["report", "reports", "rpt", "rpts", "summary", "figures"] },
  { kind: "object", concept: "BALANCE", variants: ["balance", "debt", "debts", "owing", "owe", "owed", "arrears"] },
  { kind: "object", concept: "INSIGHT", variants: ["insight", "slow", "moving", "best", "top", "trend"] },
  { kind: "object", concept: "FEATURE", variants: ["feature", "features", "section", "page", "screen"] },
  { kind: "object", concept: "ACTIVITY", variants: ["activity", "history", "audit", "did"] },
  { kind: "modifier", concept: "TODAY", variants: ["today", "now"] },
  { kind: "modifier", concept: "YESTERDAY", variants: ["yesterday"] },
  { kind: "modifier", concept: "LAST_MONTH", variants: ["last month", "previous month"] },
  { kind: "modifier", concept: "REMAINING", variants: ["remaining", "remain", "left", "available", "wetin dey left", "dey left"] },
  { kind: "modifier", concept: "LOW_STOCK", variants: ["low", "running low", "finish", "finishing"] },
  { kind: "modifier", concept: "BEST", variants: ["best", "top", "most"] },
  { kind: "modifier", concept: "SLOW_MOVING", variants: ["slow", "slow moving", "no dey move", "not moving"] },
  { kind: "modifier", concept: "OUTSTANDING", variants: ["outstanding", "still owe", "owe", "owing", "how much dey"] },
  { kind: "modifier", concept: "BOUGHT", variants: ["bought", "buy", "purchased"] },
  { kind: "modifier", concept: "PAID", variants: ["paid", "don pay", "settled"] },
];

export const INFORMAL_CONCEPTS: Readonly<Record<string, string>> = {
  wetin: "WHAT", dey: "IS_OR_HAS", don: "COMPLETED", owe: "OUTSTANDING", wey: "THAT", "no dey move": "SLOW_MOVING", "how much dey": "OUTSTANDING", abeg: "PLEASE", fit: "CAN", make: "LET",
};
