/**
 * "Ask" for the shared shop: plain questions answered from the shop's own
 * numbers. It is read-only. It never records, changes or sends anything; the
 * only thing it can produce besides words is a purchase-order DRAFT that the
 * owner reviews and posts (or not) on the Purchasing tab.
 *
 * Every figure comes from data the screen already has or from the server's own
 * reports. Nothing here recalculates money. What a person may ask follows what
 * they may see: an attendant cannot ask about profit, and only sees customers'
 * balances if the owner lets them handle credit.
 */
import { formatMinorAmount } from "@/features/inventory/inventory";
import { levenshtein } from "@/features/assistant/text";
import { stockStatus } from "./inventoryStats";
import { tracksStock } from "./productTracking";
import type { DailyReport } from "./dailyReport";
import type { ProfitReport } from "./profitReport";
import { formatMargin, hasPartialCost } from "./profitReport";
import type { ShopCustomer } from "./shopClient";

export type Period = "today" | "yesterday" | "week" | "month";
export type ShopQuestion =
  | { kind: "reorder" } | { kind: "lowStock" } | { kind: "outOfStock" }
  | { kind: "stockOf"; query: string } | { kind: "priceOf"; query: string }
  | { kind: "sales"; period: Period } | { kind: "topSellers"; period: Period } | { kind: "profit"; period: Period }
  | { kind: "owed"; query?: string }
  | { kind: "help" };

export const PERIOD_LABEL: Record<Period, string> = { today: "today", yesterday: "yesterday", week: "in the last 7 days", month: "this month" };

const clean = (raw: string) => raw.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const has = (text: string, ...words: string[]) => words.some(w => new RegExp(`\\b${w}\\b`).test(text));

export function parsePeriod(text: string): Period {
  const t = clean(text);
  if (has(t, "yesterday")) return "yesterday";
  if (/\b(this month|month)\b/.test(t)) return "month";
  if (/\b(this week|last week|past week|last 7 days|7 days|seven days|week)\b/.test(t)) return "week";
  return "today";
}

/** What the person is asking about, in plain English and a little Ghanaian pidgin. Anything else is "help". */
export function parseShopQuestion(raw: string): ShopQuestion {
  const t = clean(raw);
  if (!t) return { kind: "help" };
  const period = parsePeriod(t);
  if (has(t, "reorder", "restock", "replenish") || (has(t, "draft", "make", "prepare", "write", "create") && has(t, "order", "purchase")) || /\bwhat (should|must|do) i (buy|order)\b/.test(t) || /\bshopping list\b/.test(t))
    return { kind: "reorder" };
  if (has(t, "profit", "margin", "gain", "earn", "earned")) return { kind: "profit", period };
  if (has(t, "top", "best", "popular") || /\bselling (most|best|well|fast)\b/.test(t) || /\bsells? (most|best|well|fast)\b/.test(t) || /\bmost sold\b/.test(t)) return { kind: "topSellers", period };
  if (has(t, "owe", "owes", "debt", "debts", "debtor", "debtors", "receivable", "receivables") || /\bwho dey owe\b/.test(t) || /\bon credit\b/.test(t) || /\boutstanding\b/.test(t)) {
    const who = t.match(/\b(?:does|do|did|is)\s+([a-z ]+?)\s+(?:owe|owes)\b/) ?? t.match(/\b([a-z ]+?)\s+owes?\b/);
    const skip = new Set(["who", "which", "what", "how", "customers", "customer", "people", "anyone", "everyone", "i", "me", "dey", "much"]);
    const name = who?.[1]?.split(" ").filter(w => !skip.has(w) && !["does", "do", "did", "is", "the"].includes(w)).join(" ").trim();
    return name ? { kind: "owed", query: name } : { kind: "owed" };
  }
  if (/\b(out of stock|sold out|no stock|none left|finished|finish|wetin finish|ran out|run out|zero)\b/.test(t)) return { kind: "outOfStock" };
  if (/\b(low|running low|running out|almost|nearly|short|dey low|getting low|reorder level)\b/.test(t)) return { kind: "lowStock" };
  // "How much did we make / sell yesterday" is about sales, not a product called "did we make".
  if (!/\bhow many\b/.test(t) && has(t, "sold", "sell", "sale", "sales", "revenue", "takings", "turnover", "make", "made", "sellings")) return { kind: "sales", period };
  const price = t.match(/\b(?:price of|cost of|how much (?:is|are|does|do)|how much for|what is the price of|whats the price of)\s+(?:the |a |an )?(.+?)(?: cost| sell for| go for)?$/);
  if (price?.[1]) return { kind: "priceOf", query: price[1].trim() };
  const stock = t.match(/\b(?:how many|how much|stock of|stock for|do i have|have i got|is there|are there|left of|quantity of)\s+(?:the |any |some )?(.+?)(?: do i have| have i| left| in stock| remaining| in the shop| do we have)?$/);
  if (stock?.[1] && !has(stock[1], "sales", "sold", "sell")) return { kind: "stockOf", query: stock[1].replace(/\b(left|remaining|stock|in stock)\b/g, "").trim() };
  if (has(t, "sold", "sell", "sale", "sales", "revenue", "takings", "turnover", "made", "sellings")) return { kind: "sales", period };
  return { kind: "help" };
}

export interface AskProduct { id: string; name: string; active: boolean; trackStock?: boolean; lowStockThreshold?: number | null; unitPriceMinor: number; costMinor?: number | null }
export interface AskStore { id: string; name: string; status: string }
export interface AskContext {
  role: "owner" | "attendant";
  currency: string;
  products: readonly AskProduct[];
  stores: readonly AskStore[];
  stock: ReadonlyArray<{ storeId: string; productId: string; quantity: number }>;
  /** Present only when this person may see customers' balances. */
  customers?: readonly ShopCustomer[];
  loadReport: (period: Period) => Promise<DailyReport>;
  loadProfit: (period: Period) => Promise<ProfitReport>;
}
export interface PurchaseDraft { storeId: string; storeName: string; lines: Array<{ productId: string; name: string; quantity: number }> }
export interface Answer { text: string; rows?: string[]; draft?: PurchaseDraft; suggestions?: string[] }

export const EXAMPLES = ["What is low on stock?", "What did I sell today?", "Top sellers this week", "Who owes me?", "How many Eggs do I have?", "Draft an order for what is low"];

/** The products a phrase could mean: best matches only. Empty when nothing is close. */
export function findProducts(products: readonly AskProduct[], phrase: string): AskProduct[] {
  const q = clean(phrase);
  if (!q) return [];
  const active = products.filter(p => p.active);
  const exact = active.filter(p => clean(p.name) === q);
  if (exact.length) return exact;
  const words = q.split(" ").filter(w => w.length > 1);
  const score = (p: AskProduct) => {
    const name = clean(p.name), tokens = name.split(" ");
    if (name.includes(q)) return 100 - Math.min(40, name.length - q.length);
    if (!words.length) return 0;
    let hit = 0;
    for (const w of words) {
      if (tokens.some(tk => tk === w || (w.length > 3 && tk.startsWith(w)) || (tk.length > 3 && w.startsWith(tk)))) hit += 2;
      else if (w.length > 3 && tokens.some(tk => tk.length > 3 && levenshtein(tk, w) <= 1)) hit += 1;
    }
    return hit === words.length * 2 || hit >= words.length ? 10 * hit : 0;
  };
  const scored = active.map(p => ({ p, s: score(p) })).filter(x => x.s > 0);
  const best = Math.max(0, ...scored.map(x => x.s));
  return scored.filter(x => x.s === best).map(x => x.p);
}

const quantityAt = (ctx: AskContext, productId: string, storeId: string) =>
  ctx.stock.find(s => s.productId === productId && s.storeId === storeId)?.quantity ?? 0;

interface Shortage { product: AskProduct; store: AskStore; quantity: number; status: "out" | "low" }
function shortages(ctx: AskContext): Shortage[] {
  const found: Shortage[] = [];
  for (const store of ctx.stores.filter(s => s.status === "active"))
    for (const product of ctx.products) {
      if (!product.active || !tracksStock(product)) continue;
      const quantity = quantityAt(ctx, product.id, store.id);
      const status = stockStatus(product, quantity);
      if (status === "out" || status === "low") found.push({ product, store, quantity, status });
    }
  return found.sort((a, b) => a.store.name.localeCompare(b.store.name) || a.product.name.localeCompare(b.product.name));
}

const storeTag = (ctx: AskContext, store: AskStore) => ctx.stores.filter(s => s.status === "active").length > 1 ? ` (${store.name})` : "";
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

export async function answerShopQuestion(question: ShopQuestion, ctx: AskContext): Promise<Answer> {
  const m = (v: number) => formatMinorAmount(v, ctx.currency);
  const owner = ctx.role === "owner";
  switch (question.kind) {
    case "lowStock": case "outOfStock": {
      const want = question.kind === "lowStock" ? "low" : "out";
      const list = shortages(ctx).filter(s => s.status === want);
      if (!list.length) return { text: want === "low" ? "Nothing is below its low-stock level." + (ctx.products.some(p => p.lowStockThreshold != null) ? "" : " No product has a low-stock level yet; set one under Stock and I can warn you.") : "Nothing is out of stock." };
      return { text: want === "low" ? `${plural(list.length, "item")} running low:` : `${plural(list.length, "item")} out of stock:`,
        rows: list.map(s => want === "low" ? `${s.product.name}${storeTag(ctx, s.store)}: ${s.quantity} left (level ${s.product.lowStockThreshold})` : `${s.product.name}${storeTag(ctx, s.store)}`),
        suggestions: owner ? ["Draft an order for what is low"] : undefined };
    }
    case "stockOf": case "priceOf": {
      const matches = findProducts(ctx.products, question.query);
      if (!matches.length) return { text: `I couldn't find a product like “${question.query}”. Check the spelling, or look under Stock.` };
      if (matches.length > 3) return { text: `That could be several products. Which one?`, rows: matches.slice(0, 6).map(p => p.name) };
      if (question.kind === "priceOf")
        return { text: matches.length === 1 ? `${matches[0].name} sells for ${m(matches[0].unitPriceMinor)}.` : "These match:", rows: matches.length === 1 ? undefined : matches.map(p => `${p.name}: ${m(p.unitPriceMinor)}`) };
      const rows = matches.flatMap(p => {
        if (!tracksStock(p)) return [`${p.name}: stock isn't counted for this item.`];
        const stores = ctx.stores.filter(s => s.status === "active");
        const per = stores.map(s => ({ s, q: quantityAt(ctx, p.id, s.id) }));
        const total = per.reduce((n, x) => n + x.q, 0);
        return [stores.length > 1 ? `${p.name}: ${total} in total (${per.map(x => `${x.s.name} ${x.q}`).join(", ")})` : `${p.name}: ${total} in stock`];
      });
      return matches.length === 1 ? { text: rows[0] } : { text: "These match:", rows };
    }
    case "sales": {
      const r = await ctx.loadReport(question.period);
      if (r.sales.count === 0) return { text: owner ? `Nothing was sold ${PERIOD_LABEL[question.period]}.` : `You made no sales ${PERIOD_LABEL[question.period]}.` };
      const rows = [`Sales: ${m(r.sales.grossMinor)} (${plural(r.sales.count, "sale")})`];
      if (r.refunds.count > 0) rows.push(`Refunds: −${m(r.refunds.totalMinor)} (${plural(r.refunds.count, "refund")})`);
      rows.push(`Net: ${m(r.netSalesMinor)}`);
      return { text: `${owner ? "The shop" : "You"} sold ${m(r.sales.grossMinor)} ${PERIOD_LABEL[question.period]}.`, rows };
    }
    case "topSellers": {
      const r = await ctx.loadReport(question.period);
      if (!r.topProducts.length) return { text: `Nothing was sold ${PERIOD_LABEL[question.period]}.` };
      return { text: `Best sellers ${PERIOD_LABEL[question.period]}${owner ? "" : " (your sales)"}:`, rows: r.topProducts.map((p, i) => `${i + 1}. ${p.name} × ${p.quantity} · ${m(p.revenueMinor)}`) };
    }
    case "profit": {
      if (!owner) return { text: "Only the owner can see profit." };
      let p: ProfitReport;
      try { p = await ctx.loadProfit(question.period); } catch { return { text: "I can't read profit yet: the shop needs its latest update." }; }
      const rows = [`Gross profit: ${m(p.grossProfitMinor)} (margin ${formatMargin(p.marginBps)})`, `Cost of goods: ${m(p.costOfGoodsMinor)}`];
      if (p.expenses.count > 0) rows.push(`Expenses: ${m(p.expenses.totalMinor)}`);
      rows.push(`Net profit: ${m(p.netProfitMinor)}`);
      if (hasPartialCost(p)) rows.push(`Note: ${m(p.uncoveredRevenueMinor)} of sales have no cost recorded and are not in the profit.`);
      return { text: `Profit ${PERIOD_LABEL[question.period]}:`, rows };
    }
    case "owed": {
      if (!ctx.customers) return { text: owner ? "There are no customers yet." : "You can't see customers' balances. Ask the owner." };
      const all = ctx.customers;
      if (question.query) {
        const q = clean(question.query);
        const hit = all.filter(c => clean(c.name).includes(q) || q.includes(clean(c.name)));
        if (!hit.length) return { text: `I couldn't find a customer called “${question.query}”.` };
        return { text: hit.length === 1 ? (hit[0].balanceMinor > 0 ? `${hit[0].name} owes ${m(hit[0].balanceMinor)}.` : `${hit[0].name} owes nothing.`) : "These match:",
          rows: hit.length === 1 ? undefined : hit.map(c => `${c.name}: ${c.balanceMinor > 0 ? `owes ${m(c.balanceMinor)}` : "owes nothing"}`) };
      }
      const owing = all.filter(c => c.balanceMinor > 0).sort((a, b) => b.balanceMinor - a.balanceMinor || a.name.localeCompare(b.name));
      if (!owing.length) return { text: "Nobody owes anything." };
      const total = owing.reduce((n, c) => n + c.balanceMinor, 0);
      return { text: `${plural(owing.length, "customer")} owe${owing.length === 1 ? "s" : ""} ${m(total)} in total:`, rows: owing.slice(0, 10).map(c => `${c.name}: ${m(c.balanceMinor)}`) };
    }
    case "reorder": {
      if (!owner) return { text: "Only the owner can draft purchase orders. You can ask “What is low on stock?”." };
      const list = shortages(ctx);
      if (!list.length) return { text: "Nothing is low or out of stock, so there is nothing to order." };
      const byStore = new Map<string, Shortage[]>();
      for (const s of list) byStore.set(s.store.id, [...(byStore.get(s.store.id) ?? []), s]);
      const orderable = (s: Shortage) => s.product.lowStockThreshold != null;
      const [storeId, items] = [...byStore.entries()].sort((a, b) => b[1].filter(orderable).length - a[1].filter(orderable).length)[0];
      const lines = items.filter(orderable).map(s => ({ productId: s.product.id, name: s.product.name, quantity: Math.max(1, 2 * (s.product.lowStockThreshold as number) - s.quantity) }));
      const skipped = list.filter(s => !orderable(s) && s.store.id === storeId);
      const store = ctx.stores.find(s => s.id === storeId)!;
      const elsewhere = list.filter(s => s.store.id !== storeId);
      if (!lines.length) return { text: `${plural(list.length, "item")} out of stock, but none has a low-stock level, so I can't suggest amounts. Set levels under Stock, or build the order by hand on Purchasing.`, rows: list.map(s => `${s.product.name}${storeTag(ctx, s.store)}`) };
      const rows = lines.map(l => `${l.name}: order ${l.quantity}`);
      if (skipped.length) rows.push(`Not included (no low-stock level): ${skipped.map(s => s.product.name).join(", ")}`);
      if (elsewhere.length) rows.push(`Other stores also need stock: ${[...new Set(elsewhere.map(s => s.store.name))].join(", ")}. Ask again after this order.`);
      return { text: `Draft order for ${store.name}: top each item up to twice its low-stock level. Check the amounts, then add costs on Purchasing; nothing is ordered yet.`, rows, draft: { storeId, storeName: store.name, lines } };
    }
    case "help":
      return { text: "I can answer questions about your shop. Try one of these:", rows: owner ? EXAMPLES : EXAMPLES.filter(e => !/order|owes/i.test(e)) };
  }
}
