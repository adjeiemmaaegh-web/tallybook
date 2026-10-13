/**
 * Tallybook Assistant — offline intent parser.
 *
 * Pure and deterministic: text in, a structured `ParsedCommand` out. It never reads or writes business records and never invents
 * values. Every name it extracts is only the owner's own words; `entityMatcher` and the router check them against real records later.
 */
import { detectDay, detectSalesPeriod } from "./dates";
import { parseCountCommand, parseCreateCommand } from "./recordParsers";
import { CURRENCY_WORD_PATTERN, MONEY_NUMBER, UNIT_ALTERNATION, canonicalUnit, detectCurrency, prepareText, toDecimalString } from "./text";
import { interpretLanguage } from "./languageUnderstanding";
import { CONFIDENCE_MEDIUM, type AssistantIntent, type ParsedCommand, type ParsedEntities, type SalesPeriodRequest, type UnsupportedTopic } from "./types";
import type { PaymentMethod } from "@/features/sales/sales";

export interface ParseOptions { now?: Date }

interface Candidate {
  intent: AssistantIntent;
  confidence: number;
  entities: ParsedEntities;
  period?: SalesPeriodRequest;
  qualifier?: string;
  unsupportedTopic?: UnsupportedTopic;
}

const noisyOr = (weights: number[]) => Math.min(0.99, 1 - weights.reduce((product, weight) => product * (1 - weight), 1));
const NAME_TOKEN = String.raw`\p{L}[\p{L}\p{N}'\-]*`;
const NAME = String.raw`${NAME_TOKEN}(?:\s+${NAME_TOKEN}){0,3}?`;
const CUR = CURRENCY_WORD_PATTERN;
const PRONOUNS = new Set(["i", "we", "he", "she", "they", "it", "you", "someone", "somebody", "customer", "client", "a", "an", "the", "me", "us", "him", "her", "them", "who", "one"]);

/* ───────────── shared extractors ───────────── */

const ITEM_STOP = "sold|sell|selling|to|from|for|on|at|paid|pay|pays|paying|by|in|with|received|receive|bought|and|she|he|they|who|using|via|which|that|today|yesterday|each|per|costing|cost|supplied|delivered|because|but|then|as|is|was|has|had|owes|owing|credit|cash|momo|card|now|please|also|too|again|earlier|just";
const STOP_TOKEN = String.raw`(?!(?:${ITEM_STOP})\b)`;
const ITEM_RE = new RegExp(String.raw`(?<![\w.,/-])(\d+(?:\.\d+)?|an?)\s+(?:(${UNIT_ALTERNATION})\b(?:\s+of\b)?\s+)?${STOP_TOKEN}(\p{L}[\p{L}\p{N}'\-]*(?:\s+${STOP_TOKEN}\p{L}[\p{L}\p{N}'\-]*){0,4})`, "gu");
const MONEY_MARKER_BEFORE = new RegExp(String.raw`(?:paid|pay|pays|paying|at|@|for|cost|costs|costing|price|of|${CUR})\s*$`, "u");
const CURRENCY_WORD = new RegExp(`^(?:${CUR})$`, "u");
const MONTH_WORD = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/;
const GENERIC_ITEMS = new Set(["something", "anything", "stuff", "goods", "items", "products", "it", "sale", "sales", "some", "stock", "things", "one", "product", "item"]);

export interface ItemMatch { quantity?: number; invalidQuantityText?: string; unit?: string; product?: string; span: string }

/** Finds "2 crates of eggs", "3 crates eggs", "a bag of rice", or "5 Fanta bottles" in already-prepared text. */
export function extractItem(text: string): ItemMatch | null {
  for (const match of Array.from(text.matchAll(ITEM_RE))) {
    const [span, quantityToken, unitToken, productPhrase] = match;
    const before = text.slice(0, match.index);
    if (MONEY_MARKER_BEFORE.test(before)) continue;
    const words = productPhrase.trim().split(/\s+/);
    if (CURRENCY_WORD.test(words[0]) && !unitToken) continue;
    if (MONTH_WORD.test(words[0]) && Number(quantityToken) <= 31 && !unitToken) continue;
    const article = quantityToken === "a" || quantityToken === "an";
    let unit = unitToken ? canonicalUnit(unitToken) : undefined;
    let product: string | undefined = words.join(" ");
    if (!unit && words.length === 1 && canonicalUnit(words[0])) { unit = canonicalUnit(words[0]); product = undefined; }
    else if (!unit && words.length > 1 && canonicalUnit(words[words.length - 1])) { unit = canonicalUnit(words[words.length - 1]); product = words.slice(0, -1).join(" "); }
    if (article && !unit) continue;
    const numeric = article ? 1 : Number(quantityToken);
    const valid = Number.isInteger(numeric) && numeric >= 1 && numeric <= 9_999_999;
    return { quantity: valid ? numeric : undefined, invalidQuantityText: valid ? undefined : quantityToken, unit, product, span };
  }
  return null;
}

function fallbackProduct(text: string, verbs: string): string | undefined {
  const match = new RegExp(String.raw`\b(?:${verbs})\s+(?:some\s+|any\s+|more\s+)?${STOP_TOKEN}(\p{L}[\p{L}\p{N}'\-]*(?:\s+${STOP_TOKEN}\p{L}[\p{L}\p{N}'\-]*){0,4})`, "u").exec(text);
  if (!match) return undefined;
  const words = match[1].split(/\s+/).filter((word) => !GENERIC_ITEMS.has(word) && !/^(?:a|an|the|new)$/.test(word));
  return words.length ? words.join(" ") : undefined;
}

function isPronounOnly(name: string) { return name.split(/\s+/).every((word) => PRONOUNS.has(word)); }
function cleanName(name: string | undefined) { const cleaned = name?.trim().replace(/\s+/g, " "); return cleaned && !isPronounOnly(cleaned) ? cleaned : undefined; }

const WALK_IN_RE = /\bwalk[\s-]?ins?(?:\s+customers?)?\b|\bcash customers?\b|\banonymous(?:\s+customers?)?\b|\bunnamed(?:\s+customers?)?\b|\bno name\b|\bunknown customers?\b|\bto\s+(?:a|an|one|some)\s+customer\b/;
const CUSTOMER_STOP = String.raw`(?=\s*[,;.]|\s+(?:on|paid|pay|pays|paying|with|using|via|by|in|cash|credit|momo|mobile|card|she|he|they|who|and|at|today|yesterday|for|because|but|then|has|had|is|was|will|wants|owes|owing|after|before|the|later)\b|\s*$)`;

function extractWalkIn(text: string): { walkIn: boolean; cleaned: string } {
  return WALK_IN_RE.test(text) ? { walkIn: true, cleaned: text.replace(new RegExp(WALK_IN_RE.source, "g"), " ") } : { walkIn: false, cleaned: text };
}

function extractNamedCustomer(text: string): { name?: string; cleaned: string } {
  const toFor = new RegExp(String.raw`\b(?:to|for)\s+(?:customer\s+|client\s+)?(${NAME})${CUSTOMER_STOP}`, "u").exec(text);
  if (toFor && !/^(?:to|for)\s+\d/.test(toFor[0]) && !new RegExp(`^(?:to|for)\\s+${CUR}\\b`, "u").test(toFor[0])) {
    const name = cleanName(toFor[1]);
    if (name) return { name, cleaned: text.replace(toFor[0], " ") };
  }
  const bought = new RegExp(String.raw`^(?:record\s+)?(${NAME})\s+(?:also\s+|just\s+)?bought\b`, "u").exec(text);
  if (bought) { const name = cleanName(bought[1]); if (name) return { name, cleaned: text.replace(bought[1], " ") }; }
  return { cleaned: text };
}

const PAID_AMOUNT = new RegExp(String.raw`\b(?:paid|pays?|paying|deposit(?:ed)?)\s+(?:me\s+|us\s+)?(?:(?:${CUR})\s*)?(${MONEY_NUMBER})(?:\s*(?:${CUR})\b)?(?!\s*(?:${UNIT_ALTERNATION})\b)`, "u");

export interface PaymentInfo {
  method?: PaymentMethod;
  status?: "paid" | "unpaid";
  conflict: boolean;
  providerHint?: string;
  amount?: string;
  amountInvalid?: string;
  currency: ReturnType<typeof detectCurrency>;
  cleaned: string;
}

/** Reads how something was paid (cash, card, mobile money, or on credit) and removes those words so later steps see only names and items. */
export function extractPayment(text: string): PaymentInfo {
  let working = text;
  const methods = new Set<PaymentMethod>();
  let providerHint: string | undefined;
  let amount: string | undefined;
  let amountInvalid: string | undefined;
  let currency: PaymentInfo["currency"] = {};
  let paidWord = false;
  let unpaidWord = false;

  const paidAmount = PAID_AMOUNT.exec(working);
  if (paidAmount) {
    const decimal = toDecimalString(paidAmount[1]);
    if (decimal) amount = decimal; else amountInvalid = paidAmount[1];
    currency = detectCurrency(paidAmount[0]);
    working = working.replace(paidAmount[0], " paid ");
  }
  const take = (pattern: RegExp, onFound: (match: RegExpExecArray) => void) => { const match = pattern.exec(working); if (match) { onFound(match); working = working.replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`), " "); } };

  take(/\b(?:credit|debit)\s+card\b/, () => methods.add("card"));
  take(/\b(?:on\s+(?:credit|account|tab)|pay(?:s|ing)?\s+later|will\s+pay\s+later|to\s+pay\s+later|credit\s+sale|as\s+credit|unpaid|not\s+(?:yet\s+)?paid|(?:has|have)n'?t\s+paid|didn'?t\s+pay|owes?|owing|credit)\b/, () => { methods.add("credit"); unpaidWord = true; });
  take(/\b(?:mobile\s+money|momo|m-?pesa|mtn(?:\s+momo)?|vodafone(?:\s+cash)?|telecel(?:\s+cash)?|airtel(?:tigo)?(?:\s+money)?|tigo(?:\s+cash)?|orange\s+money|ecocash|mobile)\b/, (match) => {
    methods.add("mobile");
    const brand = /(?:mtn|vodafone|telecel|airtel|tigo|orange|ecocash|m-?pesa)/.exec(match[0]);
    if (brand) providerHint = brand[0].replace(/^m-?pesa$/, "m-pesa");
  });
  take(/\b(?:card|pos|visa|mastercard)\b/, () => methods.add("card"));
  take(/\b(?:in\s+)?cash\b/, () => methods.add("cash"));
  take(/\b(?:paid|pays?|paying|settled|in\s+full|fully)\b/, () => { paidWord = true; });

  const conflict = methods.size > 1;
  const method = methods.size === 1 ? Array.from(methods)[0] : undefined;
  const status = conflict ? undefined : method === "credit" || unpaidWord ? "unpaid" : paidWord || method ? "paid" : undefined;
  return { method, status, conflict, providerHint, amount, amountInvalid, currency, cleaned: working.replace(/\s+/g, " ").trim() };
}

const PRICE_PATTERNS = [
  new RegExp(String.raw`(?:\bat\b|@)\s*(?:(?:${CUR})\s*)?\d`, "u"),
  new RegExp(String.raw`\d\s*(?:${CUR})?\s*(?:each|apiece|per\s+\p{L}+)`, "u"),
  new RegExp(String.raw`\bfor\s+(?:(?:${CUR})\s*)?\d`, "u"),
  /\b(?:price|priced|costing|costs?)\b/,
];
function detectPriceMention(text: string): string | undefined {
  for (const pattern of PRICE_PATTERNS) { const match = pattern.exec(text); if (match) return text.slice(match.index, match.index + 40).trim(); }
  return undefined;
}

/** Extracts a unit cost or a total cost from words such as "at 25 each" or "for 250 total". */
export function extractCost(text: string): { unitCost?: string; totalCost?: string; invalid?: string; cleaned: string } {
  const match = new RegExp(String.raw`(?:(\bat\b|@|\bfor\b|\bcosting\b|\bcosts?\b|\bprice(?:\s+of)?\b|\bpaid\b|\bunit\s+cost\b)\s*(?:is\s+)?)?(?:(?:${CUR})\s*)(${MONEY_NUMBER})\s*(?:${CUR})?\s*(each|apiece|per\s+\p{L}+|a\s+(?:${UNIT_ALTERNATION})|in\s+total|total|altogether)?|(\bat\b|@|\bfor\b|\bcosting\b|\bcosts?\b|\bprice(?:\s+of)?\b|\bpaid\b|\bunit\s+cost\b)\s*(?:is\s+)?(${MONEY_NUMBER})\s*(?:${CUR})?\s*(each|apiece|per\s+\p{L}+|a\s+(?:${UNIT_ALTERNATION})|in\s+total|total|altogether)?`, "u").exec(text);
  if (!match) return { cleaned: text };
  const lead = (match[1] ?? match[4] ?? "").trim();
  const numeric = match[2] ?? match[5];
  const qualifier = (match[3] ?? match[6] ?? "").trim();
  const decimal = toDecimalString(numeric);
  const cleaned = text.replace(match[0], " ").replace(/\s+/g, " ").trim();
  if (!decimal) return { invalid: numeric, cleaned };
  const isTotal = /total|altogether/.test(qualifier) || (!qualifier && /^(?:for|paid|costs?|costing|price(?: of)?)$/.test(lead));
  return isTotal ? { totalCost: decimal, cleaned } : { unitCost: decimal, cleaned };
}

function extractCurrencyFlags(source: string): Pick<ParsedEntities, "currency" | "currencyAmbiguous"> {
  const detected = detectCurrency(source);
  return { ...(detected.code ? { currency: detected.code } : {}), ...(detected.ambiguousShilling ? { currencyAmbiguous: true } : {}) };
}

/* ───────────── question form ───────────── */

const QUESTION_START = /^(?:how|what|which|who|when|where|why|show|list|tell me|display|give me|check|see|view|do we|do you|does|did|is|are|any|can you tell|total)\b/;
const isQuestionForm = (raw: string, text: string) => raw.trim().endsWith("?") || QUESTION_START.test(text);

/* ───────────── customer balance ───────────── */

const SUPPLIER_DIRECTION = /\b(?:do|did|will|should|must|can|shall)\s+(?:we|i)\s+(?:still\s+)?owe\b|\bhow\s+much\s+(?:do|did|are|am|is|will)\s+(?:we|i)\s+(?:still\s+)?(?:owe|owing)\b|\b(?:we|i)\s+(?:still\s+)?owe\b|\bwe\s+are\s+owing\b|\bowed?\s+to\b|\bsupplier\s+(?:balance|debt)s?\b|\bpayables?\b|\bamount\s+due\s+to\b|\b(?:does|did|do|will)\s+(?:the\s+)?(?:shop|business|store|company)\s+(?:still\s+)?owe\b|\boutstanding\s+(?:with|to)\b|\b(?:is|are)\s+owed\b(?!\s+by)|\bsupplier\b[^?]*\b(?:owed|owe|owing)\b|\bour\s+(?:debts?|payables?|outstanding)\b/;
const BALANCE_WORDS = new Set("how much does do is are did has have will what show me us my our the a an of to for check get tell give still currently now right owe owes owing owed debt debts balance balances outstanding arrears amount total customer client account remaining unpaid pending in with by on it and or list see view display current she he her his they them their".split(" "));

function mentionFromRemainder(text: string, stopwords: Set<string>): string | undefined {
  const tokens = text.replace(/'s\b/g, "").replace(/[,;:!?"()]/g, " ").split(/\s+/).filter(Boolean);
  const remaining = tokens.filter((token) => !stopwords.has(token));
  if (!remaining.length || remaining.length > 4) return undefined;
  return remaining.join(" ");
}

function scoreCustomerBalance(text: string): Candidate | null {
  if (SUPPLIER_DIRECTION.test(text)) return null;
  if (/\b(?:stock|inventory)\b/.test(text)) return null;
  const weights: number[] = [];
  if (/\bhow much (?:does|is|do|did|has|will)\b[^?]*?\b(?:owe|owes|owing|owed)\b/.test(text)) weights.push(0.92);
  if (/\b(?:owe|owes|owing)\b[^?]*\bhow much\b/.test(text)) weights.push(0.92);
  if (/\b(?:balance|debt|debts|outstanding|arrears|owed)\b/.test(text)) weights.push(0.82);
  if (/\b(?:owe|owes|owing)\b/.test(text)) weights.push(0.6);
  if (/^how much\s+[a-z][a-z' -]+\s+owes?(?: me)?$/.test(text.trim())) weights.push(0.86);
  if (/\b(?:is|are)\b[^?]*\b(?:unpaid|in debt|in arrears|behind on payments?)\b/.test(text)) weights.push(0.8);
  if (/\bstill\s+(?:owing|owes?)\b/.test(text)) weights.push(0.82);
  if (/\bwhat\s+(?:does|do|did|is)\s+[a-z'-]+(?:\s+[a-z'-]+)?\s+(?:owe|owes|owing)\b/.test(text)) weights.push(0.88);
  if (!weights.length) return null;
  return { intent: "CUSTOMER_BALANCE", confidence: noisyOr(weights), entities: { customerText: mentionFromRemainder(text, BALANCE_WORDS) } };
}

/* ───────────── inventory ───────────── */

const INVENTORY_WORDS = new Set("how many much do does did we you have has had got are is there any left remaining remain remains stock stocks in on hand inventory current currently what our my the of still available show me check count level levels quantity qty total tell give a an for i now at number balance list see view display".split(" "));

function scoreInventory(text: string): Candidate | null {
  const explicitStock = /\b(?:in stock|on hand|stock levels?|stock count|stock left|stock remaining|stock balance|inventory)\b/.test(text);
  if (/\b(?:sell|sold|selling|sale|sales|owe|owes|owing|paid|payment|received?|bought|purchased?|purchases?|earn(?:ed|s)?|revenue|income|takings|profit|turnover|money|make|made|total)\b/.test(text) && !explicitStock) return null;
  if (LOW_STOCK_QUESTION.test(text)) return null;
  const weights: number[] = [];
  if (explicitStock) weights.push(0.86);
  else if (/\bstock\b/.test(text)) weights.push(0.78);
  if (/\bhow (?:many|much)\b/.test(text) && /\b(?:left|remain(?:ing|s)?|do we have|have we got|have we|we have|are there|is there|available|in stock)\b/.test(text)) weights.push(0.88);
  if (/^how (?:many|much)\b/.test(text)) weights.push(0.78);
  if (/\b(?:do|does|did)\s+(?:we|you)\s+(?:still\s+)?have\b|\bany\b[^?]*\bleft\b|\b(?:is|are)\s+there\b/.test(text)) weights.push(0.78);
  if (/\bleft\b|\bremaining\b/.test(text)) weights.push(0.5);
  if (/^[a-z'-]+(?:\s+[a-z'-]+){0,2}\s+(?:left|remaining)$/.test(text.replace(/[?.!]+$/, "").trim())) weights.push(0.8);
  if (!weights.length) return null;
  let working = text;
  let unit: string | undefined;
  const afterHowMany = new RegExp(String.raw`^how (?:many|much)\s+(${UNIT_ALTERNATION})\b(?:\s+of\b)?`).exec(working);
  if (afterHowMany) { unit = canonicalUnit(afterHowMany[1]); working = working.replace(afterHowMany[0], "how many"); }
  const ofUnit = new RegExp(String.raw`\b(${UNIT_ALTERNATION})\s+of\b`).exec(working);
  if (ofUnit) { unit ??= canonicalUnit(ofUnit[1]); working = working.replace(ofUnit[0], " "); }
  return { intent: "INVENTORY_QUERY", confidence: noisyOr(weights), entities: { productText: mentionFromRemainder(working, INVENTORY_WORDS), unit } };
}

/* ───────────── sales questions ───────────── */

const SALE_VERB = /\b(?:sell|sold|selling)\b/;
const RECORD_SALE_PHRASE = /\b(?:record|log|enter|add|make|create|register)\s+(?:a\s+|the\s+|new\s+|one\s+)?(?:cash\s+|credit\s+)?sales?\b|\bnew sale\b|\bmade a sale\b|\b(?:log|record|enter)\s+\d+\s+(?!(?:cedis?|ghs|naira|dollars?|shillings?|usd|ngn|kes)\b)(?:[a-z]+\s+){1,3}to\s+(?!stock\b|inventory\b|the\s+(?:stock|inventory)\b)[a-z]/;
const SALES_WORDS = new Set("how many much did do does we you i sell sold selling sale sales show me us my our the a an what are is for on in no of? today todays today's yesterday this last past week days day 7 seven so far total made make makes earn earned take took get got list see view display report summary revenue income takings turnover business shop overall ever all time records saved since beginning start weekly and".split(" "));

function scoreSales(text: string, raw: string, now: Date): Candidate | null {
  const salesWord = /\b(?:sales?|sell|sold|selling|takings|revenue|income|turnover)\b|\b(?:todays?|today's)\s+(?:total|figures?|numbers?)\b/.test(text);
  const howMuchMade = /\bhow much\s+(?:money\s+)?(?:did|have|do|does|has)\s+(?:we|i|you|the\s+(?:shop|business|store))\s+(?:sell|sold|make|made|earn|earned|take|took|get|got)\b/.test(text);
  if ((!salesWord && !howMuchMade) || SELLING_QUESTION.test(text)) return null;
  if (!isQuestionForm(raw, text) && !howMuchMade && !/\b(?:todays?|today's)\s+(?:sales|total|figures?|numbers?)\b|\bsales\s+(?:today|yesterday|for|this|last|past|in|on|during|so far)\b/.test(text)) return null;
  const period = detectSalesPeriod(text, now);
  const weights: number[] = [];
  if (isQuestionForm(raw, text) && salesWord) weights.push(0.86);
  if (howMuchMade) weights.push(0.9);
  if (period.kind !== "unspecified") weights.push(0.88);
  if (/\bsales\b/.test(text)) weights.push(0.55);
  let remainder = text;
  const day = detectDay(text, now);
  if (day.found) remainder = remainder.replace(day.text, " ");
  remainder = remainder.replace(/\b(?:this|last|past|previous)\s+(?:month|year|quarter|week)\b|\b(?:the\s+)?(?:last|past|previous)\s+\d{1,3}\s+days\b|\bmonth to date\b|\byear to date\b|\bso far today\b|\bright now\b|\ball[\s-]?time\b/g, " ");
  const leftover = remainder.replace(/[,;:!?"()]/g, " ").replace(/'s\b/g, "").split(/\s+/).filter((token) => token && !SALES_WORDS.has(token)).join(" ");
  return { intent: period.kind === "today" ? "TODAY_SALES" : "SALES_QUERY", confidence: noisyOr(weights), entities: {}, period, qualifier: leftover || undefined };
}

/* ───────────── record a sale ───────────── */

/** Questions about what sells, which look like sale verbs ("best-selling", "what sells most") but record nothing. */
const LOW_STOCK_QUESTION = /\bwhat(?:'?s|\s+is)\s+low\b|\bfinishing\b|\brunning\s+out\b|\blow\s+(?:on\s+)?(?:stock|inventory|supplies)\b|\b(?:stock|inventory)\s+(?:is\s+|are\s+)?(?:running\s+)?low\b|\brunning\s+low\b/;
const SELLING_QUESTION = /\bsells?\s+(?:the\s+)?best\b|\bsell\s+best\b|\b(?:best|top|fast(?:est)?|slow(?:est)?|worst)[\s-]?sell(?:ing|ers?)\b|\bwhat\s+sells?\b|\bmost\s+(?:sold|selling)\b/;

function scoreRecordSale(text: string, raw: string): Candidate | null {
  if (isQuestionForm(raw, text) || SELLING_QUESTION.test(text) || /\b(?:customers?|clients?|buyers?|people)\s+(?:who|that)\b|\bwho\s+(?:bought|purchased|ordered)\b/.test(text)) return null;
  const nameBought = new RegExp(String.raw`^(?:record\s+)?(?!(?:i|we|who|which|what|how)\s)(${NAME})\s+(?:also\s+|just\s+)?bought\b`, "u").test(text) && !/\bfrom\b/.test(text);
  if (!SALE_VERB.test(text) && !RECORD_SALE_PHRASE.test(text) && !nameBought) return null;

  const walkIn = extractWalkIn(text);
  const payment = extractPayment(walkIn.cleaned);
  const customer = extractNamedCustomer(payment.cleaned);
  const item = extractItem(customer.cleaned);
  const product = item?.product ?? (item ? undefined : fallbackProduct(customer.cleaned, "sell|sold|selling|bought"));
  const entities: ParsedEntities = {
    productText: product, unit: item?.unit, quantity: item?.quantity, invalidQuantityText: item?.invalidQuantityText,
    walkIn: walkIn.walkIn || undefined, customerText: customer.name,
    paymentMethod: payment.method, paymentStatus: payment.status, paymentConflict: payment.conflict || undefined, providerHint: payment.providerHint,
    amount: payment.amount, ...extractCurrencyFlags(payment.amount ? text : ""),
    priceMentioned: detectPriceMention(payment.cleaned), discountMentioned: /\bdiscount(?:ed)?\b|\bpercent\b|%/.test(text) || undefined,
  };
  if (payment.amountInvalid) entities.invalidQuantityText ??= undefined;
  const weights = [item ? 0.92 : RECORD_SALE_PHRASE.test(text) || SALE_VERB.test(text) ? 0.86 : 0.8];
  if (customer.name || walkIn.walkIn) weights.push(0.5);
  return { intent: "RECORD_SALE", confidence: noisyOr(weights), entities };
}

/* ───────────── receive stock ───────────── */

const RECEIVE_VERBS = "received|receive|receiving|got|bought|buy|purchased?|restocked?|delivered|delivery|deliveries|stocked up|brought in|brought|supplied|supplies";
const RECEIVE_RE = new RegExp(String.raw`\b(?:${RECEIVE_VERBS})\b`);
const SUPPLIER_STOP = String.raw`(?=\s*[,;.]|\s+(?:at|for|on|today|yesterday|costing|cost|costs|@|each|paid|and|with|by|last|this|per|total)\b|\s*$)`;
const MONEY_RECEIPT = new RegExp(String.raw`\b(?:received?|got|collected|took)\s+(?:(?:${CUR})\s*)?(${MONEY_NUMBER})\s*(?:${CUR})?\s+from\b`, "u");

function extractSupplier(text: string): { name?: string; cleaned: string } {
  const from = new RegExp(String.raw`\b(?:from|by)\s+(${NAME})${SUPPLIER_STOP}`, "u").exec(text);
  if (from) { const name = cleanName(from[1]); if (name) return { name, cleaned: text.replace(from[0], " ") }; }
  const first = new RegExp(String.raw`^(?:record\s+)?(${NAME})\s+(?:delivered|supplied|brought|sent|gave)\b`, "u").exec(text);
  if (first) { const name = cleanName(first[1]); if (name) return { name, cleaned: text.replace(first[1], " ") }; }
  return { cleaned: text };
}

function scoreReceiveStock(text: string, raw: string): Candidate | null {
  if (isQuestionForm(raw, text)) return null;
  const moneyReceipt = MONEY_RECEIPT.exec(text);
  const recordPurchase = /\b(?:record|log|enter|add|new)\s+(?:a\s+|new\s+)?(?:stock\s+)?(?:purchase|delivery|restock)\b|\breceive\s+stock\b|\bstock\s+(?:received|delivery)\b/.test(text);
  const restockCommand = /^restock\s+\d/.test(text);
  if (!RECEIVE_RE.test(text) && !recordPurchase && !restockCommand) return null;
  const nameBought = new RegExp(String.raw`^(?:record\s+)?(?!(?:i|we)\s)(${NAME})\s+(?:also\s+|just\s+)?bought\b`, "u").test(text) && !/\bfrom\b/.test(text);
  if (nameBought) return null;
  if (moneyReceipt && (detectCurrency(moneyReceipt[0]).code || detectCurrency(moneyReceipt[0]).ambiguousShilling)) return null;

  const supplier = extractSupplier(text);
  const cost = extractCost(supplier.cleaned);
  const day = detectDay(cost.cleaned, new Date());
  const withoutDate = day.found ? cost.cleaned.replace(day.text, " ") : cost.cleaned;
  const item = extractItem(withoutDate);
  const product = (item?.product ?? (item ? undefined : fallbackProduct(withoutDate, "received|receive|bought|buy|purchased|purchase|restocked|restock|got")))?.replace(/^(?:of|the)\s+/, "");
  if (!item && !recordPurchase && !moneyReceipt && (!product || /\b(?:goods?|stuff|things?|items?|products?|stock)\b/.test(withoutDate))) return null;
  const entities: ParsedEntities = {
    productText: product, unit: item?.unit, quantity: item?.quantity, invalidQuantityText: item?.invalidQuantityText,
    supplierText: supplier.name, unitCost: cost.unitCost, totalCost: cost.totalCost,
    ...(cost.invalid ? { invalidQuantityText: item?.invalidQuantityText } : {}),
    dateText: day.found ? day.text : undefined,
    ambiguousReceipt: !item && !!moneyReceipt ? true : undefined,
  };
  if (!item && moneyReceipt) return { intent: "RECEIVE_STOCK", confidence: 0.6, entities: { ...entities, amount: toDecimalString(moneyReceipt[1]) ?? undefined, customerText: cleanName(text.split(/\bfrom\b/)[1]) } };
  const weights = [item ? 0.92 : recordPurchase ? 0.86 : 0.7];
  if (supplier.name) weights.push(0.5);
  return { intent: "RECEIVE_STOCK", confidence: noisyOr(weights), entities };
}

/* ───────────── customer payment ───────────── */

const PAY_VERB = /\b(?:paid|pays|paying|repaid|repays|repayment|settled|cleared|deposited|payment)\b/;
const PAY_STOP = String.raw`(?=\s*[,;.]|\s+(?:for|on|by|via|using|in|with|cash|momo|mobile|card|today|yesterday|of|to|and|towards|as)\b|\s*$)`;
const AMOUNT_AFTER_CUE = new RegExp(String.raw`\b(?:paid|pays?|paying|repaid|settled|deposited|payment\s+of|received?|got|collected|gave|brought|sent)\s+(?:me\s+|us\s+)?(?:back\s+)?(?:(?:${CUR})\s*)?(${MONEY_NUMBER})(?:\s*(?:${CUR})\b)?(?!\s*(?:${UNIT_ALTERNATION})\b)`, "u");
const AMOUNT_WITH_CURRENCY = new RegExp(String.raw`(?:(?:${CUR})\s*(${MONEY_NUMBER})|(${MONEY_NUMBER})\s*(?:${CUR})\b)`, "u");

function scorePayment(text: string, raw: string): Candidate | null {
  if (isQuestionForm(raw, text)) return null;
  if (SALE_VERB.test(text) || RECORD_SALE_PHRASE.test(text)) return null;
  const directPay = new RegExp(String.raw`^pay\s+(${NAME})\s+(?:${CUR}\s*)?(${MONEY_NUMBER})(?:\s*(?:${CUR})\b)?$`, "u").exec(text);
  if (directPay) {
    const amount = toDecimalString(directPay[2]);
    return { intent: "RECORD_CUSTOMER_PAYMENT", confidence: 0.6, entities: { customerText: cleanName(directPay[1]), amount: amount ?? undefined, ...(amount ? {} : { invalidQuantityText: directPay[2] }) } };
  }
  const hasCue = PAY_VERB.test(text) || /\b[a-z'-]+\s+gave\s+me\s+(?:[a-z$₵]{1,4}\s*)?\d/.test(text);
  const moneyReceipt = MONEY_RECEIPT.test(text);
  if (!hasCue && !moneyReceipt) return null;
  if (/\b(?:record|log|enter|add)\b[^,]*\bpurchase\b/.test(text)) return null;

  const withMoney = AMOUNT_AFTER_CUE.exec(text) ?? AMOUNT_WITH_CURRENCY.exec(text);
  const numeric = withMoney?.[1] ?? withMoney?.[2];
  const amount = numeric ? toDecimalString(numeric) : null;
  const item = extractItem(text);
  if (item?.quantity && item.product && !/\bpayment\b/.test(text) && !amount) return null;
  const payment = extractPayment(text);
  const customerPatterns: Array<[RegExp, number]> = [
    [new RegExp(String.raw`^(?:record\s+)?(${NAME})\s+(?:has\s+|have\s+|just\s+|also\s+|already\s+)*(?:paid|pays|repaid|settled|cleared|deposited|brought|sent|gave|made|makes)\b`, "u"), 1],
    [new RegExp(String.raw`\b(?:from|by)\s+(${NAME})${PAY_STOP}`, "u"), 1],
    [new RegExp(String.raw`\bpayment\s+(?:for|of\s+[^\s]+\s+for)\s+(${NAME})${PAY_STOP}`, "u"), 1],
  ];
  // A "by/for NAME" match whose words are all payment or currency terms ("by cash", "for cedis") is not a customer name.
  const notAPaymentWord = new RegExp(String.raw`^(?:${CUR}|cash|credit|card|mobile|money|momo|mtn|vodafone|telecel|airtel|tigo|orange|ecocash|m-pesa|pos|visa|mastercard|full|fully|later|account|tab)$`, "u");
  const looksLikeName = (name: string) => name.split(/\s+/).some((word) => !notAPaymentWord.test(word));
  let customerText: string | undefined;
  for (const [pattern, group] of customerPatterns) { const match = pattern.exec(text); const name = cleanName(match?.[group]); if (name && looksLikeName(name)) { customerText = name; break; } }

  const currencyMarked = (() => { const found = detectCurrency(withMoney?.[0] ?? ""); return Boolean(found.code || found.ambiguousShilling); })();
  const weights: number[] = [];
  if (!hasCue && !currencyMarked) return { intent: "RECORD_CUSTOMER_PAYMENT", confidence: 0.6, entities: { amount: amount ?? undefined, customerText: customerText } };
  if (hasCue && amount) weights.push(0.9);
  if (/\b(?:record|log|enter|add)\b[^,]*\bpayment\b/.test(text)) weights.push(0.85);
  if (moneyReceipt && amount) weights.push(0.86);
  if (hasCue && customerText) weights.push(0.82);
  if (hasCue) weights.push(0.6);
  const entities: ParsedEntities = {
    customerText, amount: amount ?? undefined, ...(numeric && !amount ? { invalidQuantityText: numeric } : {}),
    paymentMethod: payment.method === "credit" ? undefined : payment.method, paymentConflict: payment.conflict || undefined,
    providerHint: payment.providerHint, ...extractCurrencyFlags(withMoney?.[0] ?? ""),
  };
  return { intent: "RECORD_CUSTOMER_PAYMENT", confidence: noisyOr(weights), entities };
}

/* ───────────── supplier questions ───────────── */

function scoreSupplierPurchases(text: string, raw: string): Candidate | null {
  if (/\d/.test(text) && !/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return null;
  if (/\b(?:customers?|clients?|buyers?|people)\b/.test(text) || /\bwho\s+(?:bought|purchased|ordered|shopped|spent)\b/.test(text)) return null;
  const purchaseWord = /\b(?:receive[d]?|bought|purchased?|purchases|purchase\s+history|deliver(?:ed|ies|y)|supplied|supplies|supply|restock(?:ed)?|bring|brought)\b/.test(text);
  if (!purchaseWord || !isQuestionForm(raw, text)) return null;
  if (SUPPLIER_DIRECTION.test(text)) return null;
  const supplier = extractSupplier(text);
  const first = new RegExp(String.raw`^(?:what|which)\s+(?:did|has|have|does)\s+(${NAME})\s+(?:supply|deliver|send|give|bring)`, "u").exec(text);
  const found = supplier.name ?? cleanName(first?.[1]);
  const name = found && /^(?:the\s+)?(?:wholesaler|vendor|supplier|distributor|dealer)$/.test(found) ? undefined : found;
  const weights = [0.86];
  if (name) weights.push(0.5);
  return { intent: "SUPPLIER_PURCHASES", confidence: noisyOr(weights), entities: { supplierText: name } };
}

function scoreSupplierBalance(text: string): Candidate | null {
  if (!SUPPLIER_DIRECTION.test(text)) return null;
  const owe = new RegExp(String.raw`\bowe(?:d|ing)?\s+(?:to\s+)?(${NAME})${SUPPLIER_STOP}`, "u").exec(text);
  const found = cleanName(owe?.[1]);
  const name = found && !/^(?:how(?:\s+much)?|much|us|me|you|them|him|her|it)$/.test(found) ? found : undefined;
  return { intent: "SUPPLIER_BALANCE", confidence: 0.9, entities: { supplierText: name } };
}

/* ───────────── things TallyBook can do but the assistant deliberately does not ───────────── */

function scoreUnsupportedAction(text: string, raw: string): Candidate | null {
  const change = !parseCountCommand(raw) && /\b(?:delete|remove|void|undo|cancel|refund|reverse|edit|change|update|correct|adjust|fix|rename|archive|restore|revert|reset|clear|write off|waive)\b/.test(text)
    && /\b(?:sale|sales|payment|payments|customer|product|stock|purchase|purchases|receipt|record|records|transaction|price|balance|debt|inventory|supplier|expense|quantity)\b/.test(text);
  if (change) return { intent: "UNSUPPORTED_ACTION", confidence: 0.86, entities: {}, unsupportedTopic: "change_record" };
  if (/\brefund(?:s|ed)?\b/.test(text) || /^(?:give|offer|apply|add)\s+.*\bdiscount\b/.test(text)) return { intent: "UNSUPPORTED_ACTION", confidence: 0.86, entities: {}, unsupportedTopic: "change_record" };
  if (/\b(?:expense|expenses|spent|spend)\b/.test(text)) return { intent: "UNSUPPORTED_ACTION", confidence: 0.82, entities: {}, unsupportedTopic: "expense" };
  return null;
}

function scoreHelp(text: string): Candidate | null {
  return /^(?:help|\?|commands?|examples?|what can (?:you|i)(?: do| ask| say)?|how do (?:i|you) (?:use|work)(?: this| you)?|how do i record (?:a )?sale|how do i add (?:a )?(?:customer|supplier|product)|what do you do|instructions|guide|menu|options)$/.test(text) ? { intent: "HELP", confidence: 0.97, entities: {} } : null;
}

/** Aggregate query scoring functions. Periods are read from the prepared (lower-case) text. */
function scoreTopDebtors(text: string, now: Date): Candidate | null {
  const debtWord = String.raw`(?:debtors?|debts?|owes?|owed|owing|unpaid|outstanding|credit)`;
  const asks = new RegExp(String.raw`\b(?:top|biggest|largest|highest|worst)\s*(?:\d+\s*)?${debtWord}\b|\b(?:which|what|who)\b[^?]*\b${debtWord}\b[^?]*\b(?:most|highest|biggest|largest)\b|\bwho\s+owes?\s+(?:us|me|the shop|the business)\b|\b(?:which|what)\s+(?:customers?|people)\s+(?:owe|owes)\b|\bcustomers?\s+(?:who\s+)?owe\b|\bbiggest\s+debtors?\b`).test(text);
  if (!asks) return null;
  return { intent: "TOP_DEBTORS", confidence: /\b(?:top|biggest|highest|largest|most)\b/.test(text) ? 0.9 : 0.83, entities: {}, period: detectSalesPeriod(text, now) };
}

function scoreLowStock(text: string): Candidate | null {
  if (!/\b(?:running low|low.*stock|stock.*low|reorder|restocking|short on)/.test(text) && !LOW_STOCK_QUESTION.test(text)) return null;
  const weights = [0.85];
  if (/\b(?:need|should|must|running low)/.test(text)) weights.push(0.90);
  return { intent: "LOW_STOCK", confidence: Math.max(...weights), entities: {} };
}

function scoreBestSelling(text: string, now: Date): Candidate | null {
  if (!/\b(?:best[\s-]?sell(?:ing|ers?)|top[\s-]?sell(?:ing|ers?)|best[\s-]?products?|top\s+(?:\d+\s+)?products?|most\s+(?:sold|popular|selling)|what\s+sells?\s+(?:the\s+)?most|highest[\s-]?(?:revenue|selling)|biggest\s+sellers?|fast(?:est)?[\s-]?(?:moving|selling)|sells?\s+(?:the\s+)?best|sell\s+best)/.test(text)) return null;
  return { intent: "BEST_SELLING", confidence: 0.9, entities: {}, period: detectSalesPeriod(text, now) };
}

function scoreCustomersWhoBought(text: string, now: Date): Candidate | null {
  if (!/\b(?:which|what)\s+(?:customers?|people)\s+(?:bought|purchased|ordered|came|shopped|spent)\b|\bwho\s+(?:bought|purchased|ordered|shopped|spent)\b|\bcustomers?\s+who\s+(?:bought|purchased|ordered|shopped)\b|\b(?:top|best|biggest)\s+(?:\d+\s+)?customers?\b/.test(text)) return null;
  const asked = /\b(?:bought|purchased|ordered)\s+(.+)$/.exec(text)?.[1]
    ?.replace(/\b(?:today|yesterday|this|last|past|previous|in|on|during|for|since|so far|all time|ever|the|a|an|any|some|of)\b.*$/, "").trim();
  const productText = asked && asked.split(/\s+/).length <= 3 && !/^(?:anything|something|items?|products?|stuff|goods|much|more|most)$/.test(asked) ? asked : undefined;
  return { intent: "CUSTOMERS_WHO_BOUGHT", confidence: 0.86, entities: productText ? { productText } : {}, period: detectSalesPeriod(text, now) };
}

const ACTIVITY_QUESTION = /\b(?:activity|audit)\s+(?:log|history|trail)\b|\bassistant\s+(?:activity|history|log)\b|\bwhat\s+(?:did|have)\s+(?:you|the\s+assistant)\s+(?:just\s+)?(?:record(?:ed)?|sav(?:e|ed)|add(?:ed)?|enter(?:ed)?|done|do)\b|\bwhat\s+(?:was|has\s+been|did\s+the\s+assistant)\s+(?:recorded|saved|added)\b[^?]*\bassistant\b/;

function scoreActivity(text: string, now: Date): Candidate | null {
  return ACTIVITY_QUESTION.test(text) ? { intent: "ACTIVITY_QUERY", confidence: 0.93, entities: {}, period: detectSalesPeriod(text, now) } : null;
}

function scoreInsights(text: string): Candidate | null {
  if (/\b(?:sales?|revenue|takings?)\b[^?]*(?:up|down|increase|decrease|compared|comparison)\b|\b(?:are|how are)\s+(?:sales?|our sales?)\b[^?]*\b(?:up|down|compared)\b/.test(text)) {
    return { intent: "INSIGHTS_QUERY", confidence: 0.995, entities: {}, qualifier: "sales-comparison" };
  }
  if (/\b(?:what|which)\s+(?:should|do)\s+i\s+reorder\b|\breorder suggestions?\b|\bwhat stock should (?:i|we) buy\b/.test(text)) {
    return { intent: "INSIGHTS_QUERY", confidence: 0.995, entities: {}, qualifier: "reorder" };
  }
  if (/\bslow[- ]moving\b|\bslow movers?\b|\bproducts?\s+(?:that are )?not moving\b/.test(text)) {
    return { intent: "INSIGHTS_QUERY", confidence: 0.995, entities: {}, qualifier: "slow-movers" };
  }
  return null;
}

/* ───────────── creating records and counting stock (patterns live in recordParsers.ts) ───────────── */

const CREATE_INTENTS = { customer: "CREATE_CUSTOMER", supplier: "CREATE_SUPPLIER", category: "CREATE_CATEGORY", product: "CREATE_PRODUCT" } as const;

function scoreCreateRecord(raw: string): Candidate | null {
  const parsed = parseCreateCommand(raw);
  return parsed ? { intent: CREATE_INTENTS[parsed.kind], confidence: 0.92, entities: parsed.entities } : null;
}

function scoreStockCount(raw: string): Candidate | null {
  const parsed = parseCountCommand(raw);
  return parsed ? { intent: "ADJUST_INVENTORY", confidence: 0.92, entities: { counted: parsed.counted, productText: parsed.productText, statedRecorded: parsed.statedRecorded } } : null;
}

const INTENT_PRIORITY: AssistantIntent[] = [
  "UNSUPPORTED_ACTION", "SUPPLIER_BALANCE", "RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT",
  "SUPPLIER_PURCHASES", "TODAY_SALES", "SALES_QUERY", "CUSTOMER_BALANCE", "INVENTORY_QUERY",
  "TOP_DEBTORS", "LOW_STOCK", "BEST_SELLING", "CUSTOMERS_WHO_BOUGHT", "INSIGHTS_QUERY",
  "CREATE_CUSTOMER", "CREATE_PRODUCT", "CREATE_CATEGORY", "CREATE_SUPPLIER", "ADJUST_INVENTORY", "ACTIVITY_QUERY",
  "HELP", "UNKNOWN",
];

/** The single public entry point: prepare the text, score every intent, and return the best reading with its alternatives. */
export function parseCommand(rawText: string, options: ParseOptions = {}): ParsedCommand {
  const now = options.now ?? new Date();
  const raw = rawText;
  const text = interpretLanguage(rawText).normalizedText;
  if (!text) return { intent: "UNKNOWN", confidence: 0, entities: {}, alternatives: [], raw };

  const help = scoreHelp(text);
  if (help) return { ...help, alternatives: [], raw };

  const candidates = [
    scoreCreateRecord(raw), scoreStockCount(raw), scoreActivity(text, now), scoreUnsupportedAction(text, raw), scoreSupplierBalance(text), scoreRecordSale(text, raw), scoreReceiveStock(text, raw), scorePayment(text, raw),
    scoreSupplierPurchases(text, raw), scoreSales(text, raw, now), scoreCustomerBalance(text), scoreInventory(text),
    scoreTopDebtors(text, now), scoreLowStock(text), scoreBestSelling(text, now), scoreCustomersWhoBought(text, now), scoreInsights(text),
  ].filter((candidate): candidate is Candidate => candidate !== null && candidate.confidence >= 0.3)
    .sort((left, right) => right.confidence - left.confidence || INTENT_PRIORITY.indexOf(left.intent) - INTENT_PRIORITY.indexOf(right.intent));

  if (!candidates.length) {
    const words = text.split(/\s+/);
    const bare = words.length <= 4 && new RegExp("^[\\p{L}\\p{N}'\\- ]+$", "u").test(text) ? text : undefined;
    return { intent: "UNKNOWN", confidence: 0, entities: {}, alternatives: [], bareMention: bare, raw };
  }

  const [top, ...rest] = candidates;
  const alternatives = rest.filter((candidate) => candidate.confidence >= CONFIDENCE_MEDIUM).map(({ intent, confidence }) => ({ intent, confidence }));
  let confidence = top.confidence;
  if (top.intent !== "INSIGHTS_QUERY" && rest[0] && confidence - rest[0].confidence < 0.05 && rest[0].confidence >= 0.75) confidence = Math.min(confidence, 0.7);
  return { ...top, confidence, alternatives, raw };
}

/* ───────────── answers to a question the assistant just asked ───────────── */

export function parseQuantityAnswer(rawText: string): number | undefined {
  const match = /^\D*(\d+)\D*$/.exec(prepareText(rawText));
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 9_999_999 ? value : undefined;
}

export function parseMoneyAnswer(rawText: string): { amount?: string; invalid?: string; currency: ReturnType<typeof detectCurrency> } {
  const text = prepareText(rawText);
  const match = new RegExp(String.raw`(${MONEY_NUMBER})`).exec(text);
  if (!match) return { currency: {} };
  const amount = toDecimalString(match[1]);
  return { ...(amount ? { amount } : { invalid: match[1] }), currency: detectCurrency(text) };
}

export function parsePaymentAnswer(rawText: string): PaymentInfo {
  const walkIn = extractWalkIn(prepareText(rawText));
  return extractPayment(walkIn.cleaned);
}

export function parseCustomerAnswer(rawText: string): { walkIn?: boolean; name?: string } {
  const text = prepareText(rawText);
  if (WALK_IN_RE.test(text) || /^(?:walk[\s-]?in|nobody|no one|none|no name)$/.test(text)) return { walkIn: true };
  const stripped = text.replace(/^(?:it was|it is|this was|sold|sale|to|for|the customer is|customer|client|named|called|his name is|her name is|for customer|to customer)\s+/g, "").replace(/^(?:to|for)\s+/, "").trim();
  const name = cleanName(stripped.replace(/[,;:!?"()]/g, " "));
  return name && name.split(/\s+/).length <= 4 ? { name } : {};
}

export function parseNameAnswer(rawText: string): string | undefined {
  const text = prepareText(rawText).replace(/^(?:it was|it is|from|by|the|supplier|named|called|for|to)\s+/g, "").replace(/[,;:!?"()]/g, " ").trim();
  const name = cleanName(text);
  return name && name.split(/\s+/).length <= 5 ? name : undefined;
}

export function parseItemAnswer(rawText: string): Pick<ItemMatch, "quantity" | "unit" | "product" | "invalidQuantityText"> {
  const text = prepareText(rawText);
  const item = extractItem(text);
  if (item) return { quantity: item.quantity, unit: item.unit, product: item.product, invalidQuantityText: item.invalidQuantityText };
  const quantity = parseQuantityAnswer(rawText);
  if (quantity) return { quantity };
  // A product name must contain at least one letter, so pure punctuation or symbols ("???", "###") is never mistaken for one.
  const words = text.replace(/[,;:!?"()]/g, " ").split(/\s+/).filter((word) => word && new RegExp("\\p{L}", "u").test(word) && !GENERIC_ITEMS.has(word) && !/^(?:a|an|the|some|it|was|is|of|sold|sell)$/.test(word));
  return words.length && words.length <= 5 ? { product: words.join(" ") } : {};
}

/** A bare cost such as "28", "cost 28", "at 28 each" or "250 total", used to change a pending stock-receipt preview. */
export function parseCostAnswer(rawText: string): { unitCost?: string; totalCost?: string; invalid?: string } | null {
  const text = prepareText(rawText);
  const full = new RegExp(String.raw`^(?:the\s+)?(?:(?:unit\s+)?(?:cost|price)\s+(?:is\s+|was\s+)?|at\s+|@\s*|for\s+)?(?:(?:${CUR})\s*)?(${MONEY_NUMBER})\s*(?:${CUR})?\s*(each|apiece|per\s+\p{L}+|a\s+(?:${UNIT_ALTERNATION})|in\s+total|total|altogether)?$`, "u").exec(text);
  if (!full) return null;
  const decimal = toDecimalString(full[1]);
  if (!decimal) return { invalid: full[1] };
  const qualifier = full[2] ?? "";
  const leadsWithFor = /^for\s/.test(text);
  return /total|altogether/.test(qualifier) || (leadsWithFor && !qualifier) ? { totalCost: decimal } : { unitCost: decimal };
}
