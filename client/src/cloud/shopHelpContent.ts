/** Plain-language help for the shared shop. Each answer describes what the app does today; keep it that way. */
export type HelpAudience = "everyone" | "owner" | "attendant";
export interface HelpTopic { id: string; section: string; audience: HelpAudience; question: string; answer: string[] }

export const HELP_TOPICS: HelpTopic[] = [
  { id: "setup", section: "Getting started", audience: "owner", question: "How do I set up my shop?",
    answer: ["Open the Dashboard or Sell tab: the Get started list shows what is left. In order: choose your currency, add a store under Team, add your products and their stock under Stock, then make a first sale.",
      "You can add many products at once from a spreadsheet: Stock, then Import products from a file."] },
  { id: "join", section: "Getting started", audience: "attendant", question: "How do I join my employer's shop?",
    answer: ["Create a Tallybook account, then choose Join your employer's shop. Type the 8-character join code your employer gave you (like K7QM-2XPD), or the longer invitation code if they invited your email.",
      "Each code works once and expires after 24 hours. After you join, the owner chooses which store you work in and what you may do. Until then you cannot sell."] },
  { id: "sell", section: "Selling", audience: "everyone", question: "How do I make a sale?",
    answer: ["On the Sell tab tap products to add them, or search or scan a barcode. Choose how the customer pays (cash, mobile money, card, or part on credit), then record the sale. A receipt appears that you can share, send on WhatsApp or print.",
      "You can pay one sale in up to 5 parts. Mobile money needs its reference number."] },
  { id: "park", section: "Selling", audience: "everyone", question: "A customer has not decided. Can I hold their cart?",
    answer: ["Yes. Park the cart, serve the next customer, and resume the parked cart later. Parked carts stay on this phone only."] },
  { id: "discount", section: "Selling", audience: "everyone", question: "Why can't I give a discount or sell on credit?",
    answer: ["The owner decides, for each attendant, whether they may give discounts (and up to what percentage) and whether they may sell on credit. Ask the owner to change it under Team. Every discount needs a reason."] },
  { id: "offline", section: "Selling", audience: "everyone", question: "What works without internet?",
    answer: ["The till keeps working: sales made offline are saved on this phone and sent to the shop when you are back online. Treat a sale as final only after it has been sent.",
      "Everything else (stock, reports, customers' balances, refunds, team changes) needs a connection, because the shop's books are kept on the server so every phone sees the same numbers."] },
  { id: "stock", section: "Stock", audience: "owner", question: "How do I add or correct stock?",
    answer: ["Stock tab: pick the store and product and add stock, or fix a wrong number. To check the shelf properly, use Stock counts: start a count, count the product, then apply it. If a sale happened while you were counting, Tallybook asks you to start again so the count stays right.",
      "Services and items you do not count can be switched to not track stock, so they sell without needing any."] },
  { id: "stock-staff", section: "Stock", audience: "owner", question: "Can an attendant count stock or receive deliveries?",
    answer: ["Yes, if you switch on Can count stock and receive goods for that person under Team. They can then count and receive goods for their own store only. They never see what things cost, and they cannot create orders, pay suppliers or move stock between stores."] },
  { id: "transfer", section: "Stock", audience: "owner", question: "How do I move stock between stores?",
    answer: ["Under Stock, Inter-store transfers: request the transfer, dispatch it from the first store, then confirm receipt at the second. Stock leaves the first store when you dispatch and arrives at the second when you confirm receipt."] },
  { id: "purchasing", section: "Buying stock", audience: "owner", question: "How do purchase orders and supplier payments work?",
    answer: ["Purchasing tab: add a supplier, create an order, and record goods when they arrive (partial deliveries are fine). Stock goes up only when goods are received.",
      "Paying a supplier is something you do outside Tallybook (cash, mobile money, bank). Tallybook only records that you paid and checks you do not record more than you owe."] },
  { id: "quotes", section: "Selling", audience: "everyone", question: "How do I give a customer a quotation?",
    answer: ["Quotes tab: say who it is for, choose the items and quantities, and how many days it is good for. Tallybook fills in today's prices. Then share it, send it on WhatsApp or print it.",
      "A quotation is not a sale: no stock is held and no money moves. When the customer is ready, open it and choose Start a sale from this; the items are loaded at the till and it is marked Sold once that sale is recorded. The prices you quoted are kept on the quotation, but the sale is charged at the shop's prices on the day."] },
  { id: "credit", section: "Customers", audience: "everyone", question: "How does selling on credit work?",
    answer: ["Add the customer under Customers (the owner sets how much they may owe). When the customer takes goods on credit, choose Credit as part of the payment and pick them. When they pay, record the payment on their page. Their history can be shared, sent on WhatsApp or printed as a statement.",
      "The owner can archive a customer who owes nothing, to tidy the list. Their history is kept."] },
  { id: "refunds", section: "Refunds", audience: "everyone", question: "How do refunds work?",
    answer: ["Refunds are off until the owner turns them on under Team, Refund policy (with a time limit). The owner refunds from the sale under Sales: the whole sale or some items, and whether goods go back in stock. The money goes back the way it was paid.",
      "If you are an attendant, open your sale under My sales and ask the owner for a refund. Nothing is refunded until the owner approves it under Refund requests. You can see their decision under My refund requests."] },
  { id: "reports", section: "Reports and money", audience: "everyone", question: "What does Cash expected in the till mean?",
    answer: ["It is the cash that should be in the drawer for the period: cash taken from sales and customers' payments, minus cash paid out for refunds, supplier payments and cash expenses. Count the drawer and compare."] },
  { id: "profit", section: "Reports and money", audience: "owner", question: "Why does profit say some sales have no cost?",
    answer: ["Profit needs to know what each item cost you at the time you sold it. Enter each product's cost under Stock. From then on, sales are counted in profit; earlier sales have no cost recorded and are shown separately instead of guessed.",
      "Net profit is gross profit minus the expenses you recorded. Buying stock is not an expense until the stock is sold."] },
  { id: "expenses", section: "Reports and money", audience: "owner", question: "How do I record shop expenses?",
    answer: ["Expenses tab: choose what it was for, the amount, how it was paid and the date. An expense can't be edited; if it was a mistake, cancel it with a reason and it stops counting, but stays on record."] },
  { id: "team", section: "Your team", audience: "owner", question: "How do I add and manage staff?",
    answer: ["Team tab. Invite by email (they get a one-time code), or make a join code and give it to someone who already has an account. Then tick the stores they work in and set what they may do. You can remove someone at any time; they lose access immediately."] },
  { id: "ask", section: "Reports and money", audience: "everyone", question: "What can I ask on the Ask tab?",
    answer: ["Plain questions about your shop: what is low or out of stock, how many of something you have, a price, what was sold today or this week, the best sellers, and (if you may see them) who owes money or the profit. Examples are shown as buttons.",
      "It only reads your shop's numbers; it never changes anything. The owner can also ask it to draft an order for what is running low. That only fills in the Purchasing form for you to check and post; nothing is ordered until you do."] },
  { id: "trust", section: "Your team", audience: "everyone", question: "Does Tallybook move money?",
    answer: ["No. Tallybook keeps records. Customers pay you, and you pay suppliers, by cash, mobile money, card or bank outside the app. Tallybook records that it happened and keeps the books consistent."] },
  { id: "problem", section: "Problems", audience: "everyone", question: "Something looks wrong. What should I do?",
    answer: ["Tap Report a problem at the bottom of the page. It sends a short description with what the app was doing, never your sales, customers or amounts. If you see a message that your sign-in expired, sign in again and retry."] },
];

/** Topics for a role plus the ones everyone needs, filtered by a search that must match every word. */
export function filterHelp(topics: HelpTopic[], query: string, role: "owner" | "attendant" | "all" = "all"): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return topics.filter(t => (role === "all" || t.audience === "everyone" || t.audience === role)
    && words.every(w => `${t.question} ${t.answer.join(" ")} ${t.section}`.toLowerCase().includes(w)));
}
