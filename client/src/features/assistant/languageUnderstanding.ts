import { prepareText, similarity, tokenize } from "./text";

export type VocabularyKind = "action" | "entity" | "modifier";
export interface VocabularyConcept {
  canonical: string;
  kind: VocabularyKind;
  variants: readonly string[];
}
export interface TokenInterpretation {
  input: string;
  canonical?: string;
  kind?: VocabularyKind;
  score: number;
  method: "exact" | "alias" | "fuzzy" | "none";
}
export interface LanguageInterpretation {
  originalText: string;
  preparedText: string;
  normalizedText: string;
  tokens: TokenInterpretation[];
  confidence: number;
  diagnostics: {
    matched: TokenInterpretation[];
    unmatched: string[];
  };
}

/**
 * Small, domain-focused vocabulary. It is intentionally concept-based rather
 * than sentence-based so unseen combinations can be interpreted compositionally.
 * Additional language packs can export the same VocabularyConcept shape later.
 */
export const ENGLISH_TALLYBOOK_VOCABULARY: readonly VocabularyConcept[] = [
  { canonical: "open", kind: "action", variants: ["open", "opn", "opin", "bring up"] },
  { canonical: "show", kind: "action", variants: ["show", "see", "view", "display", "list", "find", "check"] },
  { canonical: "add", kind: "action", variants: ["add", "new", "create", "register", "save"] },
  { canonical: "record", kind: "action", variants: ["record", "log", "enter", "put"] },
  { canonical: "sell", kind: "action", variants: ["sell", "sold", "selling"] },
  { canonical: "buy", kind: "action", variants: ["buy", "bought", "purchase", "purchases", "purchased"] },
  { canonical: "pay", kind: "action", variants: ["pay", "paid", "payment", "pmt", "pament", "repay"] },
  { canonical: "receive", kind: "action", variants: ["receive", "received", "recieve", "got", "brought", "delivery"] },
  { canonical: "stock", kind: "entity", variants: ["stock", "stocks", "stk", "sto", "inv", "inventory", "inventry", "inventori", "goods", "items"] },
  { canonical: "product", kind: "entity", variants: ["product", "products", "prod", "item"] },
  { canonical: "customer", kind: "entity", variants: ["customer", "customers", "cust", "custmr", "custmer", "client", "buyer"] },
  { canonical: "supplier", kind: "entity", variants: ["supplier", "suppliers", "suplier", "supplir", "vendor", "vendors"] },
  { canonical: "sale", kind: "entity", variants: ["sale", "sales", "selling", "receipt", "reciept"] },
  { canonical: "expense", kind: "entity", variants: ["expense", "expenses", "expence", "spending", "costs"] },
  { canonical: "report", kind: "entity", variants: ["report", "reports", "rpt", "rpts", "summary", "numbers", "figures"] },
  { canonical: "backup", kind: "entity", variants: ["backup", "back-up", "restore"] },
  { canonical: "balance", kind: "entity", variants: ["balance", "debt", "debts", "owing", "owe", "owed", "arrears"] },
  { canonical: "low", kind: "modifier", variants: ["low", "running-low", "finishing", "finish"] },
];

const CONCEPTS_BY_VARIANT = new Map<string, VocabularyConcept>();
for (const concept of ENGLISH_TALLYBOOK_VOCABULARY) {
  for (const variant of concept.variants) CONCEPTS_BY_VARIANT.set(variant, concept);
}
const ACTION_PHRASES: readonly [string, string][] = [["bring up", "open"], ["take me to", "open"], ["go to", "open"]];
const FUZZY_MIN_LENGTH = 4;
const FUZZY_THRESHOLD = 0.72;
const FUZZY_MARGIN = 0.08;
const REWRITE_VARIANTS = new Set([
  "opn", "opin", "stk", "sto", "inv", "inventry", "inventori", "cust", "custmr", "custmer",
  "suplier", "supplir", "rpt", "rpts", "reciept", "pament", "recieve", "expence",
]);

function resolveToken(input: string): TokenInterpretation {
  const exact = CONCEPTS_BY_VARIANT.get(input);
  if (exact) return { input, canonical: exact.canonical, kind: exact.kind, score: 1, method: exact.canonical === input ? "exact" : "alias" };
  if (input.length < FUZZY_MIN_LENGTH) return { input, score: 0, method: "none" };
  const candidates = ENGLISH_TALLYBOOK_VOCABULARY.flatMap((concept) => concept.variants.map((variant) => ({ concept, variant, score: similarity(input, variant) })))
    .filter((candidate) => candidate.score >= FUZZY_THRESHOLD)
    .sort((left, right) => right.score - left.score);
  const best = candidates[0];
  if (!best || (candidates[1] && best.score - candidates[1].score < FUZZY_MARGIN && candidates[1].concept.canonical !== best.concept.canonical)) return { input, score: 0, method: "none" };
  return { input, canonical: best.concept.canonical, kind: best.concept.kind, score: best.score, method: "fuzzy" };
}

function applyPhraseConcepts(text: string): string {
  return ACTION_PHRASES.reduce((current, [phrase, replacement]) => current.replace(new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, "g"), replacement), text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Interprets only Tallybook vocabulary. Unknown words, names, products, and
 * amounts remain untouched, so this layer cannot invent ledger entities.
 */
export function interpretLanguage(rawText: string): LanguageInterpretation {
  const preparedText = prepareText(rawText);
  const phraseText = applyPhraseConcepts(preparedText);
  const inputTokens = tokenize(phraseText);
  const tokens = inputTokens.map(resolveToken);
  // Existing intent rules already understand normal words such as "paid",
  // "sales", "bought", and "customers". Rewrite only compact abbreviations
  // and domain typos so this layer augments rather than destabilizes them.
  let normalizedText = phraseText;
  for (const token of tokens) {
    if (token.canonical && REWRITE_VARIANTS.has(token.input)) normalizedText = normalizedText.replace(new RegExp(`\\b${escapeRegExp(token.input)}\\b`, "g"), token.canonical);
  }
  const matched = tokens.filter((token) => token.canonical);
  const confidence = matched.length ? matched.reduce((sum, token) => sum + token.score, 0) / matched.length : 0;
  return {
    originalText: rawText,
    preparedText,
    normalizedText,
    tokens,
    confidence,
    diagnostics: { matched, unmatched: tokens.filter((token) => !token.canonical).map((token) => token.input) },
  };
}

export function explainLanguage(rawText: string): LanguageInterpretation {
  return interpretLanguage(rawText);
}
