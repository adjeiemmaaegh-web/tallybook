/**
 * Tallybook Assistant — conversation memory and follow-ups.
 *
 * Lets the owner talk naturally: "How much does Adwoa owe?" … "she paid 100", "and last month?", "what about rice?".
 *
 * Safety rules (this is a ledger):
 *  - Only records the assistant really resolved are remembered, never a failed lookup.
 *  - Memory expires after 15 minutes, measured with the assistant's own clock.
 *  - A follow-up is only applied when the sentence can't stand on its own, or contains a pronoun. Complete sentences are never rewritten.
 *  - A remembered customer is NEVER added to a sale or payment that didn't mention them. Pronouns are expanded into the real name
 *    and sent through the normal flow, so the preview names the customer and nothing is saved without confirmation.
 *  - Every follow-up reply carries a notice saying what the assistant took it to mean.
 */
import { detectSalesPeriod } from "./dates";
import { parseCommand } from "./intentParser";
import { prepareText } from "./text";
import { CONFIDENCE_HIGH, type AssistantIntent, type ParsedCommand } from "./types";

export const MEMORY_TTL_MS = 15 * 60 * 1000;

export interface RememberedRecord { id: string; name: string }
type Stamped<T> = T & { at: number };

/** Aggregate questions where only the period changes. */
const PERIOD_INTENTS: readonly AssistantIntent[] = ["SALES_QUERY", "TODAY_SALES", "BEST_SELLING", "CUSTOMERS_WHO_BOUGHT", "TOP_DEBTORS"];
/** Questions about one record, where only the record changes. */
const ENTITY_FIELD = { CUSTOMER_BALANCE: "customerText", INVENTORY_QUERY: "productText", SUPPLIER_PURCHASES: "supplierText" } as const;
export const REMEMBERED_QUERIES: readonly AssistantIntent[] = [...PERIOD_INTENTS, ...(Object.keys(ENTITY_FIELD) as AssistantIntent[]), "INSIGHTS_QUERY"];

export function createConversationMemory(clock: () => Date) {
  let customer: Stamped<RememberedRecord> | undefined;
  let product: Stamped<RememberedRecord> | undefined;
  let supplier: Stamped<RememberedRecord> | undefined;
  let query: Stamped<{ intent: AssistantIntent }> | undefined;
  const fresh = <T extends { at: number }>(entry: T | undefined): T | undefined => (entry && clock().getTime() - entry.at < MEMORY_TTL_MS ? entry : undefined);
  const stamp = <T extends object>(value: T): Stamped<T> => ({ ...value, at: clock().getTime() });
  return {
    rememberCustomer: (record: RememberedRecord) => { customer = stamp(record); },
    rememberProduct: (record: RememberedRecord) => { product = stamp(record); },
    rememberSupplier: (record: RememberedRecord) => { supplier = stamp(record); },
    rememberQuery: (intent: AssistantIntent) => { if (REMEMBERED_QUERIES.includes(intent)) query = stamp({ intent: intent === "TODAY_SALES" ? "SALES_QUERY" : intent }); },
    customer: () => fresh(customer),
    product: () => fresh(product),
    supplier: () => fresh(supplier),
    query: () => fresh(query),
    forget: () => { customer = product = supplier = query = undefined; },
  };
}
export type ConversationMemory = ReturnType<typeof createConversationMemory>;

export type FollowUp = { kind: "parsed"; parsed: ParsedCommand; notice: string } | { kind: "ask"; text: string };

const PRONOUN = /\b(?:he|she|they|him|her|them|his|their|hers|theirs)\b/i;
const CUSTOMER_VERBS = /\b(?:paid|pay|pays|owes?|owed|owing|bought|buy|balance|debt|purchas\w*|spent|settled|repaid|brought|sell|sold|credit)\b/i;
/** A customer-related request that the owner can complete once a customer is known. */
const CUSTOMER_INTENTS: readonly AssistantIntent[] = ["CUSTOMER_BALANCE", "RECORD_CUSTOMER_PAYMENT", "RECORD_SALE"];
const BLOCKED_INTENTS: readonly AssistantIntent[] = ["CREATE_CUSTOMER", "CREATE_PRODUCT", "CREATE_CATEGORY", "CREATE_SUPPLIER", "ADJUST_INVENTORY"];
const FILLER = /^(?:and|what about|how about|same for|same but for|now|then|also|try|what if|for)\s+/;

function expandPronouns(text: string, name: string): { text: string; pronoun: string } {
  let pronoun = "";
  const mark = (word: string) => { pronoun = pronoun || word.toLowerCase(); };
  const expanded = text
    .replace(/\b(his|their|hers|theirs)\b/gi, (word) => { mark(word); return `${name}'s`; })
    .replace(/\bher\b(?=\s+(?:balance|debt|payment|account|phone|total|bill|credit|purchases?)\b)/gi, (word) => { mark(word); return `${name}'s`; })
    .replace(/\b(he|she|they|him|her|them)\b/gi, (word) => { mark(word); return name; });
  return { text: expanded, pronoun };
}

function asParsed(intent: AssistantIntent, entities: ParsedCommand["entities"], extra: Partial<ParsedCommand> = {}): ParsedCommand {
  return { intent, confidence: 0.9, entities, ...extra } as ParsedCommand;
}

/**
 * Tries to make sense of `text` using what was said earlier. `original` is how the text parsed on its own.
 * Returns null when this isn't a follow-up, so the normal flow carries on untouched.
 */
export function resolveFollowUp(text: string, memory: ConversationMemory, now: Date, original: ParsedCommand): FollowUp | null {
  if (BLOCKED_INTENTS.includes(original.intent)) return null;

  // 1. "she paid 100", "how much does he owe", "sell 2 eggs to him" — a pronoun standing for the customer just discussed.
  if (PRONOUN.test(text) && CUSTOMER_VERBS.test(text)) {
    const named = original.entities.customerText;
    if (named && !PRONOUN.test(named) && original.confidence >= CONFIDENCE_HIGH) return null; // a real name is already in the sentence
    const remembered = memory.customer();
    if (!remembered) {
      // A request the normal flow already understands (for example a payment) asks "Which customer?" and keeps what was said, so leave it alone.
      if (original.confidence >= CONFIDENCE_HIGH) return null;
      return { kind: "ask", text: "I don't know who you mean yet. Say the customer's name, for example “How much does Adwoa owe?”." };
    }
    const { text: rewritten, pronoun } = expandPronouns(text, remembered.name);
    const parsed = parseCommand(rewritten, { now });
    if (parsed.confidence >= CONFIDENCE_HIGH && CUSTOMER_INTENTS.includes(parsed.intent)) {
      return { kind: "parsed", parsed, notice: `Taking “${pronoun}” to mean ${remembered.name}, from earlier. Check the name before you confirm.` };
    }
    return null;
  }

  // 2. "how many of those are left" — the product just discussed.
  const product = memory.product();
  const productIsPronoun = /^(?:it|that|those|them|these|this)$/.test(original.entities.productText ?? "");
  if (product && (original.confidence < CONFIDENCE_HIGH || productIsPronoun) && /\b(?:how\s+(?:many|much)|check|show)\b[^?]*\b(?:it|that|those|them|these)\b/i.test(text)) {
    const parsed = parseCommand(`How many ${product.name} are left?`, { now });
    if (parsed.intent === "INVENTORY_QUERY") return { kind: "parsed", parsed, notice: `Taking that to mean ${product.name}, from earlier.` };
  }

  if (original.confidence >= CONFIDENCE_HIGH) return null; // a complete sentence is never rewritten

  const last = memory.query();
  if (!last) return null;
  const prepared = prepareText(text).replace(/[?.!]+$/, "").trim();

  // 3. "and last month?", "what about this year", "yesterday?" — the same question for another period.
  if (PERIOD_INTENTS.includes(last.intent)) {
    const remainder = prepared.replace(FILLER, "").replace(/^(?:in|during|over|the)\s+/, "").trim();
    if (remainder && remainder.split(/\s+/).length <= 5) {
      const period = detectSalesPeriod(remainder, now);
      if (period.kind !== "unspecified") return { kind: "parsed", parsed: asParsed(last.intent, {}, { period }), notice: "Asking the same question as before, for the period you gave." };
    }
  }

  // 4. "and Adwoa?", "what about rice?" — the same question about another record.
  const field = ENTITY_FIELD[last.intent as keyof typeof ENTITY_FIELD];
  const another = /^(?:and|what about|how about|same for|now|then|also)\s+(.+)$/.exec(prepared);
  if (field && another) {
    const name = another[1].replace(/^(?:for|the)\s+/, "").trim();
    if (name && name.split(/\s+/).length <= 3 && !/\d/.test(name) && detectSalesPeriod(name, now).kind === "unspecified") {
      return { kind: "parsed", parsed: asParsed(last.intent, { [field]: name }), notice: "Asking the same question as before, about someone or something else." };
    }
  }
  return null;
}
