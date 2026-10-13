/** Tallybook Assistant: builds the sentences, choices and warnings shown to the owner. Nothing here calls a business service or invents a figure. */
import { matchEntity, type MatchCandidate } from "./entityMatcher";
import { displayMention } from "./text";
import type { AssistantAction, AssistantReply } from "./types";

export const answer = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ kind: "answer", text, ...extra });
export const question = (text: string, actions: AssistantAction[] = [], extra: Partial<AssistantReply> = {}): AssistantReply => ({ kind: "question", text, actions, ...extra });
export const failure = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ kind: "error", text, ...extra });
export const unsupported = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ kind: "unsupported", text, ...extra });
export const info = (text: string, extra: Partial<AssistantReply> = {}): AssistantReply => ({ kind: "info", text, ...extra });

export const say = (label: string, text = label): AssistantAction => ({ type: "say", label, text });

export const EXAMPLE_ACTIONS: AssistantAction[] = [
  say("How much does Adwoa owe?"),
  say("How many crates of eggs are left?"),
  say("Show today's sales"),
  say("Record 2 crates of eggs sold to walk-in customer, paid cash"),
];

export const helpReply = (): AssistantReply => info(
  "I answer questions and prepare a few routine entries from your saved records — no internet needed. I never save anything until you confirm a preview.",
  {
    details: [
      { label: "Ask", value: "“How much does Adwoa owe?” · “How many eggs are left?” · “Show today’s sales” · “Best-sellers this month” · “Top debtors” · “What’s running low?” · “What did the assistant record today?”" },
      { label: "Record", value: "“Sell 3 crates of eggs to Adwoa, paid cash” · “I received 10 crates of eggs from Kofi Traders” · “Adwoa paid 100 cedis”" },
      { label: "Add", value: "“Add customer Ama Mensah” · “Add product Palm oil, price 12” · “Add supplier Kofi Traders” · “Add category Drinks”" },
      { label: "Count stock", value: "“I counted 25 eggs but we have 37” corrects TallyBook's stock to your count, with a preview first." },
      { label: "Not here", value: "Editing or deleting records, refunds, discounts. Use the app pages for those." },
    ],
    actions: EXAMPLE_ACTIONS,
  },
);

export const notUnderstood = (): AssistantReply => unsupported(
  "I couldn't identify a supported TallyBook action from that. I can answer questions about balances, stock and sales, add customers, products, suppliers and categories, correct stock after a count, and prepare sales, stock receipts and customer payments.",
  { actions: EXAMPLE_ACTIONS.slice(0, 3) },
);

export type RecordNoun = "customer" | "product" | "supplier";
const NOUNS: Record<RecordNoun, { plural: string; href: string; label: string }> = {
  customer: { plural: "customers", href: "/customers", label: "Open Customers" },
  product: { plural: "products", href: "/inventory", label: "Open Stock" },
  supplier: { plural: "suppliers", href: "/purchases", label: "Open Purchases" },
};

export interface ChoiceOption { id: string; name: string; label: string }

export type Resolution<T> =
  | { ok: true; record: T }
  | { ok: false; reply: AssistantReply; options?: ChoiceOption[]; suggestion?: boolean };

/**
 * Turns the owner's words into exactly one real record, or into a reply that asks. A record is only returned when the match is unambiguous;
 * near-spellings and duplicates always go back to the owner.
 */
export function resolveRecord<T extends MatchCandidate & { archivedAt?: string }>(
  noun: RecordNoun, mention: string, active: readonly T[], archived: readonly T[], slot: string, describe: (record: T) => string,
): Resolution<T> {
  const shown = displayMention(mention);
  const { plural, href, label } = NOUNS[noun];
  const result = matchEntity(mention, active);
  const asOptions = (records: readonly T[]): ChoiceOption[] => records.map((record) => ({ id: record.id, name: record.name, label: describe(record) }));
  const chips = (options: ChoiceOption[]): AssistantAction[] => [...options.slice(0, 6).map((option): AssistantAction => ({ type: "fill", label: option.label, slot, value: option.name, id: option.id })), { type: "cancel", label: "Cancel" }];

  if (result.status === "one") return { ok: true, record: result.match };
  if (result.status === "many") {
    const options = asOptions(result.matches);
    const text = noun === "customer" ? `I found ${options.length} customers matching “${shown}”. Please select the correct one.` : `I found more than one ${noun} matching “${shown}”. Which one did you mean?`;
    return { ok: false, reply: question(text, chips(options)), options };
  }
  if (result.status === "suggest") {
    const options = asOptions(result.matches);
    const names = options.map((option) => option.name).join(" or ");
    return { ok: false, suggestion: true, options, reply: question(`I couldn't find a ${noun} called “${shown}” exactly. Did you mean ${names}?`, chips(options)) };
  }
  if (matchEntity(mention, archived).status !== "none") return { ok: false, reply: failure(`“${shown}” is an archived ${noun}, and I only work with active ${plural}.`, { link: { label, href } }) };
  return { ok: false, reply: failure(`I couldn't find a ${noun} named “${shown}” in your ${noun} records.`, { link: { label, href } }) };
}

export const customerLabel = (customer: { name: string; phone: string }) => `${customer.name}${customer.phone ? ` · …${customer.phone.replace(/\D/g, "").slice(-4)}` : ""}`;
