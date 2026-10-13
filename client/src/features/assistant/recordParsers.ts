/**
 * Tallybook Assistant — parsers for "add a customer/supplier/category/product" and for stock counts ("I counted 25 but we have 37").
 *
 * Names of NEW records are read from the owner's original text so capitalisation survives ("Ama Mensah", not "ama mensah").
 * Everything else works on the prepared (lower-case, number-words-as-digits) text, like the rest of the parser.
 */
import { CURRENCY_WORD_PATTERN, MONEY_NUMBER, UNIT_ALTERNATION, prepareText, sanitizeInput, toDecimalString } from "./text";
import type { ParsedEntities } from "./types";

const HAS_LETTER = new RegExp("\\p{L}", "u");
const WORD_START = new RegExp("(^|[\\s'-])(\\p{L})", "gu");

export type CreateKind = "customer" | "supplier" | "category" | "product";
export interface CreateParse { kind: CreateKind; entities: ParsedEntities }

const NOUNS: Record<CreateKind, string> = {
  customer: "customers?|clients?|buyers?",
  supplier: "suppliers?|vendors?|wholesalers?",
  category: "(?:product\\s+)?categor(?:y|ies)",
  product: "products?|items?",
};
const KIND_PATTERNS = (Object.keys(NOUNS) as CreateKind[]).map((kind) => [kind, NOUNS[kind]] as const);
const VERB = String.raw`(?:add|create|register|save|set\s+up|make|open|enter|record)`;
const CUR = String.raw`(?:${CURRENCY_WORD_PATTERN})`;

function kindOf(noun: string): CreateKind | undefined {
  return KIND_PATTERNS.find(([, pattern]) => new RegExp(`^(?:${pattern})$`, "i").test(noun.trim()))?.[0];
}

/** Tidies a name the owner typed. All-lower-case names are Title Cased; names with their own capitals are left alone. */
export function tidyName(value: string): string | undefined {
  let name = value.replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i++) name = name.replace(/^(?:(?:a|an|the|new|named|called|name is|is)\s+|[:\-–]\s*)/i, "");
  name = name.replace(/[\s,;.]+$/g, "").replace(/\s+(?:please|pls|thanks|thank you)$/i, "").replace(/[\s,;.]+$/g, "").trim();
  if (!name || !HAS_LETTER.test(name) || name.length > 80 || name.split(" ").length > 6) return undefined;
  if (/^(?:it|him|her|them|this|that|someone|somebody|one|new|me|us)$/i.test(name)) return undefined;
  return name === name.toLowerCase() ? name.replace(WORD_START, (_, lead: string, letter: string) => lead + letter.toUpperCase()) : name;
}

function takeMatch(source: string, pattern: RegExp): { value?: RegExpExecArray; rest: string } {
  const match = pattern.exec(source);
  return match ? { value: match, rest: (source.slice(0, match.index) + " " + source.slice(match.index + match[0].length)).replace(/\s+/g, " ").trim() } : { rest: source };
}

function money(value: string | undefined): string | undefined { return value ? toDecimalString(value) ?? undefined : undefined; }

/** A phone number inside free text: 7 to 15 digits, with optional + and separators. */
function takePhone(source: string): { phone?: string; rest: string } {
  const match = /(?:\b(?:phone|tel|telephone|mobile|contact|whatsapp|number|no\.?)\s*(?:is|:|=)?\s*)?(\+?\d[\d\s\-().]{5,}\d)/i.exec(source);
  if (!match) return { rest: source };
  const digits = match[1].replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return { rest: source };
  return { phone: match[1].replace(/\s+/g, " ").trim(), rest: (source.slice(0, match.index) + " " + source.slice(match.index + match[0].length)).replace(/\s+/g, " ").trim() };
}

const PERSON_CUT = /\s*(?:,|;|\b(?:phone|tel|telephone|mobile|contact|whatsapp|number|email|address|located|based|on|with|who|that|and|at)\b).*$/i;

function parsePerson(rest: string, kind: "customer" | "supplier"): ParsedEntities {
  const withPhone = takePhone(rest);
  const name = tidyName(withPhone.rest.replace(PERSON_CUT, ""));
  return { ...(kind === "customer" ? { customerText: name } : { supplierText: name }), ...(withPhone.phone ? { phone: withPhone.phone } : {}) };
}

function parseProductFields(rest: string): ParsedEntities {
  let work = rest;
  const entities: ParsedEntities = {};
  const stockWord = String.raw`(?:low[\s-]?stock(?:\s+(?:level|alert|warning|limit))?|reorder(?:\s+(?:level|point))?|alert(?:\s+me)?|warn(?:\s+me)?|low\s+at)`;
  const low = takeMatch(work, new RegExp(String.raw`\b${stockWord}\s*(?:at|of|is|when|below|:|=)?\s*(\d{1,7})\b`, "i"));
  if (low.value) { entities.lowStockLevel = Number(low.value[1]); work = low.rest; }
  const opening = takeMatch(work, /\b(?:opening|initial|starting|current)\s+stock\s*(?:of|is|:|=)?\s*(\d{1,7})\b|\b(?:stock|quantity|qty|with|having)\s*(?:of|is|:|=)?\s*(\d{1,7})(?:\s*(?:units?|pieces?|pcs|in stock|on hand))?\b|\b(\d{1,7})\s*(?:units?|pieces?|pcs)?\s+(?:in stock|on hand|available)\b/i);
  if (opening.value) { entities.openingStock = Number(opening.value[1] ?? opening.value[2] ?? opening.value[3]); work = opening.rest; }
  const cost = takeMatch(work, new RegExp(String.raw`\b(?:cost\s+price|buying\s+price|cost|costs|bought\s+(?:at|for))\s*(?:is|of|:|=)?\s*(?:${CUR}\s*)?(${MONEY_NUMBER})\s*(?:${CUR})?(?:\s*(?:each|apiece|per\s+\p{L}+))?`, "iu"));
  if (cost.value) { entities.costPrice = money(cost.value[1]); work = cost.rest; }
  const category = takeMatch(work, /\b(?:in|under|into|to|of)?\s*(?:the\s+)?categor(?:y|ies)\s*[:\-=]?\s*(?:called\s+|named\s+)?([^,;]+?)(?=\s+(?:price|priced|selling|sells?|cost|costs|stock|opening|low|reorder|with|at|for|@)\b|[,;]|$)/i);
  if (category.value) { const name = tidyName(category.value[1]); if (name) entities.categoryText = name; work = category.rest; }
  const price = takeMatch(work, new RegExp(String.raw`\b(?:selling\s+price|sell(?:s|ing)?\s+(?:for|at)|sold\s+(?:for|at)|priced?\s*(?:at|of|is)?|price|for|at|@)\s*(?:is|of|:|=)?\s*(?:${CUR}\s*)?(${MONEY_NUMBER})\s*(?:${CUR})?(?:\s*(?:each|apiece|per\s+\p{L}+))?`, "iu"));
  if (price.value) { entities.price = money(price.value[1]); work = price.rest; }
  const name = tidyName(work.replace(/\s+(?:with|and|at|for|in|,|;)\s*$/i, ""));
  if (name) entities.productText = name;
  return entities;
}

/** "Add customer Ama Mensah 0241234567", "new product Palm oil at 12 each, 20 in stock", "add Ama as a customer"… */
export function parseCreateCommand(rawText: string): CreateParse | null {
  const text = sanitizeInput(rawText).replace(/^(?:hey|hi|hello|ok|okay|so|please|pls|kindly|can you|could you|would you|will you|i want to|i'd like to|i would like to|i need to|let's|lets|help me|go ahead and)\s+/gi, "").replace(/\s+(?:please|pls)\s*[.!]*$/i, "").trim();
  if (!text || /\?\s*$/.test(text) || /^(?:how|what|why|where|when|which|who|can i|is it|do you|does)\b/i.test(text)) return null;

  const asNoun = new RegExp(String.raw`^${VERB}\s+(.+?)\s+as\s+(?:a\s+|an\s+|my\s+)?(?:new\s+)?(${Object.values(NOUNS).join("|")})\b\s*(.*)$`, "i").exec(text);
  if (asNoun) {
    const kind = kindOf(asNoun[2]);
    if (kind === "customer" || kind === "supplier") return { kind, entities: parsePerson(`${asNoun[1]} ${asNoun[3]}`, kind) };
    if (kind === "category") return { kind, entities: { categoryText: tidyName(asNoun[1]) } };
    if (kind === "product") return { kind, entities: parseProductFields(`${asNoun[1]} ${asNoun[3]}`) };
  }

  for (const [kind, pattern] of KIND_PATTERNS) {
    const lead = new RegExp(String.raw`^(?:${VERB}\s+(?:a\s+|an\s+|the\s+|another\s+)?(?:new\s+)?|new\s+)(?:${pattern})\b[\s:,\-–]*(.*)$`, "i").exec(text);
    if (!lead) continue;
    const rest = lead[1].replace(/^(?:named|called|name is|for|:)\s*/i, "");
    if (kind === "customer" || kind === "supplier") return { kind, entities: parsePerson(rest, kind) };
    if (kind === "category") return { kind, entities: { categoryText: tidyName(rest) } };
    return { kind, entities: parseProductFields(rest) };
  }
  return null;
}

/* ───────────── stock counts (reconciliation) ───────────── */

export interface CountParse { counted?: number; productText?: string; statedRecorded?: number }

const SYSTEM = String.raw`(?:the\s+)?(?:system|app|tallybook|tally\s?book|records?|books?|computer|ledger)`;
const SAYS = String.raw`(?:says?|shows?|has|have|had|recorded|reads?|is|are|lists?|thinks?\s+(?:we\s+)?(?:have|had))`;
const CLAUSE_SPLIT = String.raw`\s*(?:,|;|\b(?:but|and|while|though|however|yet|whereas)\b)\s*`;
const STOCK_TAIL = /\s+(?:in stock|on (?:the )?shelf|on (?:the )?shelves|on hand|left|available|physically|today|now|here|actually)\s*$/;
const PRODUCT_BLOCKERS = /\b(?:price|cost|name|phone|address|email|threshold|category|sold|sale|sales|paid|owes?|owe)\b/;

function cleanCountProduct(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let product = value.replace(/[,;:!?"()]/g, " ").replace(/\s+/g, " ").trim();
  product = product.replace(new RegExp(String.raw`^(?:(?:${UNIT_ALTERNATION})\s+of\s+|(?:units?|pieces?|pcs)\s+(?:of\s+)?|of\s+|the\s+|only\s+|just\s+|about\s+)`), "");
  product = product.replace(new RegExp(String.raw`^(?:(?:${UNIT_ALTERNATION})\s+of\s+|of\s+|the\s+)`), "");
  for (let i = 0; i < 3; i++) product = product.replace(STOCK_TAIL, "").trim();
  product = product.replace(/^(?:stock of|stock for|stock)\s+/, "").replace(/\s+stock$/, "").trim();
  if (!product || !HAS_LETTER.test(product) || product.split(" ").length > 5 || PRODUCT_BLOCKERS.test(product) || /^(?:it|them|that|this|but|and|we|i)$/.test(product)) return undefined;
  return product;
}

function recordedFrom(clause: string | undefined): number | undefined {
  if (!clause) return undefined;
  const match = /(?:we\s+have|we\s+had|i\s+have|have|has|had|says?|shows?|recorded|reads?|system|app|tallybook|records?|expected|supposed\s+to\s+be)\D{0,30}?(\d{1,7})\b/.exec(clause) ?? /^\D*(\d{1,7})\D*$/.exec(clause);
  return match ? Number(match[1]) : undefined;
}

/** Recognises an owner reporting a physical count. Returns null for anything else, so ordinary questions are never mistaken for counts. */
export function parseCountCommand(rawText: string): CountParse | null {
  const text = prepareText(rawText);
  if (!text || /^(?:how|what|which|who|when|where|why|is|are|do|does|did)\b/.test(text) || /\?$/.test(rawText.trim())) return null;
  const NUM = String.raw`(\d{1,7})`;

  // 0. "recount eggs" — the owner wants to count but hasn't said the number yet.
  const recount = /^(?:(?:i|we)\s+)?(?:want\s+to\s+|need\s+to\s+|would\s+like\s+to\s+|should\s+)?(?:recount|stock\s?take(?:\s+(?:of|for))?|stock\s+count(?:\s+(?:of|for))?)\s+(?:of\s+|the\s+)?([^\d]+)$/.exec(text);
  if (recount) { const product = cleanCountProduct(recount[1]); if (product) return { productText: product }; }

  // 1. "I counted 25 eggs but we have 37" / "counted 25 crates of eggs, system says 37" / "I counted 25 but we have 37"
  const counted = new RegExp(String.raw`^(?:(?:i|we)\s+)?(?:just\s+|have\s+|had\s+|only\s+|physically\s+)*(?:counted|recounted|found)\s+(?:only\s+|just\s+|about\s+|exactly\s+)?${NUM}\b\s*(.*)$`).exec(text);
  if (counted) {
    const [productPart = "", ...clauses] = counted[2].split(new RegExp(CLAUSE_SPLIT));
    const recorded = recordedFrom(clauses.join(" "));
    const product = cleanCountProduct(productPart);
    if (product || recorded !== undefined || !counted[2].trim()) return { counted: Number(counted[1]), productText: product, statedRecorded: recorded };
    if (/^(?:in|on|of)\b/.test(counted[2])) return { counted: Number(counted[1]), productText: cleanCountProduct(counted[2].replace(/^(?:in|on|of)\s+(?:stock\s+(?:of\s+)?|the\s+)?/, "")) };
  }

  // 2. "recount eggs 25", "stock count: laundry soap = 3", "counted eggs and found 25"
  const verbFirst = new RegExp(String.raw`^(?:(?:i|we)\s+)?(?:just\s+|have\s+|had\s+)*(?:counted|recounted|recount|count|stock\s?take(?:\s+(?:of|for))?|stock\s+count(?:\s+(?:of|for))?|physical\s+count(?:\s+(?:of|for))?)[\s:,\-–]+(?:of\s+|the\s+)?(.+?)\s*(?:[:=\-–]|\bis\b|\bare\b|\bwas\b|\bwere\b|\band found\b|\bfound\b|\bto\b)?\s*${NUM}\s*(?:units?|pieces?|pcs)?$`).exec(text);
  if (verbFirst) { const product = cleanCountProduct(verbFirst[1]); if (product) return { counted: Number(verbFirst[2]), productText: product }; }

  // 3. "we only have 25 eggs but the system says 37"
  const haveFirst = new RegExp(String.raw`^(?:(?:i|we)\s+)?(?:only\s+|actually\s+|really\s+|just\s+)*(?:have|has|got|see|found)\s+${NUM}\s+(.+?)${CLAUSE_SPLIT}${SYSTEM}\s+${SAYS}\s+${NUM}\b`).exec(text);
  if (haveFirst) return { counted: Number(haveFirst[1]), productText: cleanCountProduct(haveFirst[2]), statedRecorded: Number(haveFirst[3]) };

  // 4. "the system says 37 eggs but we have 25"
  const systemFirst = new RegExp(String.raw`^${SYSTEM}\s+${SAYS}\s+${NUM}\s*(?:(?:of\s+)?(.+?))?${CLAUSE_SPLIT}(?:(?:i|we)\s+)?(?:only\s+|actually\s+|really\s+|just\s+)*(?:have|has|got|counted|found|see)\s+${NUM}\s*(.*)$`).exec(text);
  if (systemFirst) return { counted: Number(systemFirst[3]), productText: cleanCountProduct(systemFirst[2] ?? systemFirst[4]), statedRecorded: Number(systemFirst[1]) };

  // 5. "set eggs stock to 25", "adjust stock of eggs to 25" — a stock correction through the same reviewed flow.
  const setStock = new RegExp(String.raw`^(?:adjust|correct|fix|set|change|update|reset|make)\s+(?:the\s+)?(.+?)\s+to\s+${NUM}$`).exec(text);
  if (setStock && /\b(?:stock|quantity|qty|inventory|count)\b/.test(setStock[1])) {
    const product = cleanCountProduct(setStock[1].replace(/\b(?:stock|quantity|qty|inventory|count|level)\b\s*(?:of|for)?/g, " "));
    if (product) return { counted: Number(setStock[2]), productText: product };
  }
  return null;
}

/* ───────────── answers to questions asked while creating a record ───────────── */

export function parsePhoneAnswer(rawText: string): string | undefined {
  const text = sanitizeInput(rawText).replace(/^(?:it(?:'s| is)|their number is|number is|number|phone|tel|mobile|is|:)\s*/i, "");
  if (!/^\+?[\d\s\-().]+$/.test(text)) return undefined;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? text.replace(/\s+/g, " ").trim() : undefined;
}

/** A physical count: a whole number from 0 up. */
export function parseCountAnswer(rawText: string): number | undefined {
  const text = prepareText(rawText);
  if (/^(?:none|nothing|zero|no stock|nil)$/.test(text)) return 0;
  const match = /^\D*(\d{1,7})\D*$/.exec(text);
  return match ? Number(match[1]) : undefined;
}

export function parsePriceAnswer(rawText: string): string | undefined {
  const text = prepareText(rawText);
  const match = new RegExp(String.raw`^(?:(?:the\s+)?(?:selling\s+)?(?:price|cost)?\s*(?:is|of|:)?\s*)?(?:${CUR}\s*)?(${MONEY_NUMBER})\s*(?:${CUR})?(?:\s*(?:each|apiece|per\s+\p{L}+))?$`, "u").exec(text);
  return money(match?.[1]);
}

export function parseNewNameAnswer(rawText: string): string | undefined {
  return tidyName(sanitizeInput(rawText).replace(/^(?:it(?:'s| is| was)|its|the name is|name is|call (?:it|them|him|her)|his name is|her name is|their name is)\s+/i, ""));
}

/** An answer to "what's their name?" for a customer or supplier. The owner may also give the phone number in the same breath. */
export function parsePersonAnswer(rawText: string): { name?: string; phone?: string } {
  const cleaned = sanitizeInput(rawText).replace(/^(?:it(?:'s| is| was)|its|the name is|name is|call (?:it|them|him|her)|his name is|her name is|their name is)\s+/i, "");
  const withPhone = takePhone(cleaned);
  return { name: tidyName(withPhone.rest.replace(PERSON_CUT, "")), phone: withPhone.phone };
}
