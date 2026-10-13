import { appRoutes, type AppRouteDefinition } from "@/lib/routes";
import { prepareText, similarity, singularize, tokenize } from "./text";
import { interpretLanguage } from "./languageUnderstanding";
import type { AssistantAction, AssistantReply, AppIntent } from "./types";

export interface AppCapability {
  id: string;
  route: AppRouteDefinition["key"];
  aliases: string[];
  description: string;
  actions: Array<{ id: string; label: string; prompt?: string }>;
}

/** The application itself is the source of truth; route links are derived from lib/routes.ts. */
export const appCapabilities: readonly AppCapability[] = [
  { id: "home", route: "today", aliases: ["home", "today", "dashboard", "main page", "start"], description: "A local summary of today’s work.", actions: [{ id: "open", label: "Open Home" }] },
  { id: "business", route: "business", aliases: ["business", "business profile", "business settings", "shop settings", "store settings"], description: "Your business profile and local settings.", actions: [{ id: "open", label: "Open Business settings" }] },
  { id: "stock", route: "inventory", aliases: ["stock", "stocks", "inventory", "inventry", "inventori", "products", "product", "items", "goods"], description: "Products and traceable inventory movements.", actions: [{ id: "open", label: "Open Stock" }, { id: "low-stock", label: "Check low stock", prompt: "What is running low?" }, { id: "add-product", label: "Add a product", prompt: "Add product" }] },
  { id: "customers", route: "customers", aliases: ["customer", "customers", "client", "clients", "custmer", "people who buy"], description: "Customer records, balances, and repayments.", actions: [{ id: "open", label: "Open Customers" }, { id: "add-customer", label: "Add a customer", prompt: "Add customer" }, { id: "balance", label: "Check a customer balance", prompt: "How much does a customer owe?" }] },
  { id: "sales", route: "sales", aliases: ["sale", "sales", "selling", "sell", "receipts", "receipt", "reciept"], description: "Sales, payments, stock updates, and receipts.", actions: [{ id: "open", label: "Open Sales" }, { id: "record", label: "Record a sale", prompt: "Record a sale" }, { id: "today", label: "See today’s sales", prompt: "Show today’s sales" }] },
  { id: "reports", route: "reports", aliases: ["report", "reports", "numbers", "summary", "business figures"], description: "Read-only local summaries from saved records.", actions: [{ id: "open", label: "Open Reports" }, { id: "show", label: "Show my reports", prompt: "Show my reports" }] },
  { id: "end-of-day", route: "endOfDay", aliases: ["end of day", "end day", "day summary", "daily review", "close of day"], description: "An optional read-only review of today’s saved work; it does not close or lock the day.", actions: [{ id: "open", label: "Open End of day" }] },
  { id: "purchases", route: "purchases", aliases: ["purchase", "purchases", "buying", "buy stock", "supplier", "suppliers", "suplier", "supplir", "vendor", "vendors"], description: "Suppliers, stock purchases, and replenishment history.", actions: [{ id: "open", label: "Open Purchases and Suppliers" }, { id: "add-supplier", label: "Add a supplier", prompt: "Add supplier" }, { id: "record-purchase", label: "Record a stock purchase", prompt: "Record a purchase" }] },
  { id: "expenses", route: "expenses", aliases: ["expense", "expenses", "spending", "spent", "costs", "expence", "money spent"], description: "Local business spending records.", actions: [{ id: "open", label: "Open Expenses" }, { id: "record-expense", label: "Record an expense", prompt: "Record an expense" }] },
  { id: "business-health", route: "businessHealth", aliases: ["business health", "health", "attention points", "how is business doing"], description: "A plain-language local view of activity and attention points.", actions: [{ id: "open", label: "Open Business Health" }] },
  { id: "backup", route: "backup", aliases: ["backup", "back up", "restore", "copy of my records", "save a copy"], description: "Owner-controlled local backup and restore files.", actions: [{ id: "open", label: "Open Backup" }] },
  { id: "assistant", route: "assistant", aliases: ["assistant", "help", "ask tallybook", "chat"], description: "Ask about saved records or prepare supported entries for confirmation.", actions: [{ id: "open", label: "Open Assistant" }] },
];

export type AppRequestKind = "navigate" | "discover" | "help" | "explain";
export interface AppRequest { kind: AppRequestKind; capability: AppCapability; confidence: number; phrase: string; }

const NAV_WORDS = /\b(?:where|find|open|go|take|bring|show|see|view|display|check|page|screen|section|take me|navigate|how do i get to)\b/;
const HELP_WORDS = /\b(?:how do i|how can i|what can i do|how to|where can i|what is|what does|explain|teach me|help me)\b/;
const EXPLAIN_WORDS = /\b(?:what is|what does|what can i do with|why use|explain)\b/;
const ACTION_WORDS = /\b(?:add|create|record|enter|save|manage|find|check|see|view|show)\b/;

function capabilityScore(text: string, capability: AppCapability): number {
  // "store" may mean the business, not inventory. Never turn it into Stock
  // from fuzzy similarity alone.
  if (capability.id === "stock" && /\bstore\b/.test(text) && !/\b(?:stock|inventory|goods|items?)\b/.test(text)) return 0;
  const words = tokenize(text);
  let score = 0;
  for (const alias of capability.aliases) {
    const aliasWords = tokenize(alias);
    const joined = aliasWords.join(" ");
    if (text.includes(joined)) score = Math.max(score, 1);
    else if (aliasWords.length === 1) {
      const best = Math.max(...words.map((word) => similarity(singularize(word), singularize(aliasWords[0]))), 0);
      if (best >= 0.78) score = Math.max(score, best * 0.88);
    } else {
      const overlap = aliasWords.filter((word) => words.some((candidate) => similarity(singularize(candidate), singularize(word)) >= 0.82)).length;
      if (overlap === aliasWords.length) score = Math.max(score, 0.84);
    }
  }
  return score;
}

export function findAppCapability(rawText: string): { capability: AppCapability; score: number } | null {
  const text = interpretLanguage(rawText).normalizedText;
  const specificity = (capability: AppCapability) => Math.max(...capability.aliases.filter((alias) => text.includes(prepareText(alias))).map((alias) => tokenize(alias).length), 0);
  const ranked = appCapabilities.map((capability) => ({ capability, score: capabilityScore(text, capability), specificity: specificity(capability) })).filter((entry) => entry.score >= 0.78).sort((a, b) => b.score - a.score || b.specificity - a.specificity);
  if (!ranked[0]) return null;
  if (ranked[1] && ranked[0].score - ranked[1].score < 0.08 && ranked[0].specificity === ranked[1].specificity) return null;
  return ranked[0];
}

export function parseApplicationRequest(rawText: string): AppRequest | null {
  const text = interpretLanguage(rawText).normalizedText;
  if (!text) return null;
  if (/^(?:help|assistant|what can you do)$/.test(text)) return null;
  const found = findAppCapability(text);
  if (!found) return null;
  // Preserve established business queries, activity queries, and explicit writes.
  if (/\b(?:activity|audit|what did (?:i|we|you)|what have (?:i|we|you))\b/.test(text)) return null;
  if (/^(?:record|sell|add|create|receive|enter|save|adjust|count)\b/.test(text) && !/\b(?:how do i|how can i|where can i|what is|what does)\b/.test(text)) return null;
  if (found.capability.id === "sales" && (!/\b(?:where|open|go|take me|page|screen|section|navigate)\b/.test(text) || /\b(?:today|yesterday|last|this|month|year|week|day|quarter|\d+\s+days?)\b/.test(text))) return null;
  if (found.capability.id === "stock" && /\b(?:how many|how much|left|remaining|in stock|running low|low stock)\b/.test(text) && !/\b(?:where|open|page|screen|section|take me)\b/.test(text)) return null;
  const hasNav = NAV_WORDS.test(text);
  const hasHelp = HELP_WORDS.test(text);
  const hasExplain = EXPLAIN_WORDS.test(text);
  const hasAction = ACTION_WORDS.test(text);
  const bare = tokenize(text).length <= 3 && found.capability.aliases.some((alias) => prepareText(alias) === text || (tokenize(alias).length === 1 && similarity(text, alias) >= 0.78));
  if (bare) return { kind: "discover", capability: found.capability, confidence: found.score >= 0.95 ? 0.93 : 0.82, phrase: text };
  if (hasExplain && !hasAction) return { kind: "explain", capability: found.capability, confidence: Math.min(0.94, found.score), phrase: text };
  if (hasHelp && hasAction && !hasNav) return { kind: "help", capability: found.capability, confidence: Math.min(0.94, found.score), phrase: text };
  if (hasNav || /\b(?:page|screen|section)\b/.test(text)) return { kind: "navigate", capability: found.capability, confidence: Math.min(0.96, found.score), phrase: text };
  if (hasHelp) return { kind: "help", capability: found.capability, confidence: Math.min(0.92, found.score), phrase: text };
  return null;
}

export function routeAction(capability: AppCapability): AssistantAction {
  const route = appRoutes.find((item) => item.key === capability.route);
  if (!route) throw new Error(`No registered route for ${capability.id}`);
  return { type: "navigate", label: `Open ${route.label}`, href: route.href };
}

function capabilityActions(capability: AppCapability): AssistantAction[] {
  const route = routeAction(capability);
  return [route, ...capability.actions.filter((action) => action.id !== "open").slice(0, 4).map((action) => action.prompt ? { type: "say" as const, label: action.label, text: action.prompt } : route)];
}

export function applicationReply(request: AppRequest): AssistantReply {
  const { capability } = request;
  const route = appRoutes.find((item) => item.key === capability.route)!;
  const subject = capability.id === "purchases" && /\b(?:supplier|suppliers|suplier|supplir|vendor|vendors)\b/.test(request.phrase) ? "Suppliers" : route.label;
  const openLabel = capability.id === "purchases" && subject === "Suppliers" ? "Open Purchases and Suppliers" : `Open ${route.label}`;
  const actions = capabilityActions(capability).map((action) => action.type === "navigate" ? { ...action, label: openLabel } : action);
  if (request.kind === "navigate") return { kind: "answer", text: `${subject} is here. ${capability.description}`, link: { label: openLabel, href: route.href }, actions, intent: "NAVIGATE", confidence: request.confidence };
  if (request.kind === "explain") return { kind: "answer", text: `${subject} is for ${capability.description.toLowerCase()}`, link: { label: openLabel, href: route.href }, actions, intent: "APP_EXPLANATION", confidence: request.confidence };
  if (request.kind === "help") return { kind: "answer", text: `You can use ${subject.toLowerCase()} to ${capability.description.toLowerCase()} Choose an option below, or open the section directly.`, link: { label: openLabel, href: route.href }, actions, intent: "APP_HELP", confidence: request.confidence };
  return { kind: "question", text: `What would you like to do with ${subject.toLowerCase()}?`, details: [{ label: "This section", value: capability.description }], actions, intent: "FEATURE_DISCOVERY", confidence: request.confidence };
}

export function appClarificationForBare(text: string): AssistantReply | null {
  const request = parseApplicationRequest(text);
  return request?.kind === "discover" ? applicationReply(request) : null;
}
