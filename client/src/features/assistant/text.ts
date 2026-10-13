/** Tallybook Assistant: small, dependency-free text helpers. Pure functions only — nothing here reads or writes business records. */
import { applyLocalAliases } from "./aliases";

export const MAX_INPUT_LENGTH = 300;

/** Removes control characters, collapses whitespace, and caps length so odd input can never reach a parser or service. */
export function sanitizeInput(raw: string): string {
  return raw.replace(new RegExp("\\p{Cc}", "gu"), " ").replace(/\s+/g, " ").trim().slice(0, MAX_INPUT_LENGTH);
}

/* ───────────── number words ("two", "twenty five", "one hundred and fifty") ───────────── */

const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

type NumberKind = "none" | "ones" | "teen" | "tens" | "hundred" | "thousand";

function readNumberWords(tokens: string[], start: number): { value: number; next: number; trailing: string } | null {
  let total = 0;
  let current = 0;
  let last: NumberKind = "none";
  let index = start;
  let trailing = "";
  let consumed = 0;
  while (index < tokens.length) {
    const match = /^([a-z]+)([.,;:!?]*)$/.exec(tokens[index]);
    if (!match) break;
    const [, word, punctuation] = match;
    if (word in ONES && (last === "none" || last === "tens" || last === "hundred" || last === "thousand")) { current += ONES[word]; last = "ones"; }
    else if (word in TEENS && (last === "none" || last === "hundred" || last === "thousand")) { current += TEENS[word]; last = "teen"; }
    else if (word in TENS && (last === "none" || last === "hundred" || last === "thousand")) { current += TENS[word]; last = "tens"; }
    else if (word === "hundred" && (last === "none" || last === "ones" || last === "teen")) { current = (current || 1) * 100; last = "hundred"; }
    else if (word === "thousand" && last !== "thousand") { total += (current || 1) * 1000; current = 0; last = "thousand"; }
    else if (word === "and" && (last === "hundred" || last === "thousand") && consumed > 0 && index + 1 < tokens.length && /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)/.test(tokens[index + 1])) { index += 1; continue; }
    else break;
    consumed += 1;
    index += 1;
    trailing = punctuation;
    if (punctuation) break;
  }
  if (!consumed) return null;
  return { value: total + current, next: index, trailing };
}

/** Rewrites spelled-out numbers as digits so later patterns only deal with one number format. */
export function replaceNumberWords(text: string): string {
  const tokens = text.split(" ");
  const output: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const read = readNumberWords(tokens, index);
    if (read) { output.push(`${read.value}${read.trailing}`); index = read.next; }
    else { output.push(tokens[index]); index += 1; }
  }
  return output.join(" ");
}

/* ───────────── preparing text for pattern matching ───────────── */

const LEADING_FILLER = /^(?:hey|hi|hello|ok|okay|so|please|pls|kindly|tallybook|assistant|can you|could you|would you|will you|i want to|i'd like to|i would like to|i need to|i wanna|let's|lets|help me|go ahead and|just)\s+/;

/** Lower-cases, expands common contractions, removes polite filler, and converts number words. The result is only used for matching, never stored. */
export function prepareText(raw: string): string {
  let text = sanitizeInput(raw).normalize("NFKC").toLowerCase();
  text = text.replace(/[’‘`´]/g, "'").replace(/[“”]/g, "\"");
  text = text.replace(/\b(what|who|how|where|that|there|here|it)'s\b/g, "$1 is").replace(/\bwhats\b/g, "what is").replace(/\bhows\b/g, "how is");
  let previous = "";
  while (previous !== text) { previous = text; text = text.replace(LEADING_FILLER, ""); }
  text = text.replace(/[\s,]*\b(?:please|pls|thanks|thank you)\b[.!?\s]*$/, "");
  text = replaceNumberWords(text);
  return applyLocalAliases(text.replace(/[?!\.\s]+$/, "").replace(/\s+/g, " ").trim());
}

/* ───────────── units (descriptive only — TallyBook products have no unit field) ───────────── */

const UNIT_CANONICAL: Record<string, string> = {
  crate: "crate", crates: "crate", bag: "bag", bags: "bag", sack: "sack", sacks: "sack", bottle: "bottle", bottles: "bottle",
  box: "box", boxes: "box", carton: "carton", cartons: "carton", pack: "pack", packs: "pack", packet: "packet", packets: "packet",
  piece: "piece", pieces: "piece", pc: "piece", pcs: "piece", kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", gram: "gram", grams: "gram",
  litre: "litre", litres: "litre", liter: "litre", liters: "litre", ltr: "litre", tin: "tin", tins: "tin", can: "can", cans: "can",
  bunch: "bunch", bunches: "bunch", dozen: "dozen", dozens: "dozen", tray: "tray", trays: "tray", bundle: "bundle", bundles: "bundle",
  pair: "pair", pairs: "pair", gallon: "gallon", gallons: "gallon", bucket: "bucket", buckets: "bucket", roll: "roll", rolls: "roll",
  sachet: "sachet", sachets: "sachet", unit: "unit", units: "unit", item: "item", items: "item", basket: "basket", baskets: "basket",
  jar: "jar", jars: "jar", tube: "tube", tubes: "tube", set: "set", sets: "set", bar: "bar", bars: "bar", cup: "cup", cups: "cup",
};

export const UNIT_ALTERNATION = Object.keys(UNIT_CANONICAL).sort((left, right) => right.length - left.length).join("|");
export function canonicalUnit(word: string): string | undefined { return UNIT_CANONICAL[word.toLowerCase()]; }
export function pluralUnit(unit: string, quantity: number) { return quantity === 1 ? unit : unit === "box" ? "boxes" : unit === "bunch" ? "bunches" : unit === "kg" ? "kg" : `${unit}s`; }

/* ───────────── money and currency ───────────── */

export const MONEY_NUMBER = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;

/** "1,200.5" → "1200.5". Returns null for values with more than two decimals, zero, or nonsense. */
export function toDecimalString(numeric: string): string | null {
  const cleaned = numeric.replace(/,/g, "");
  if (!/^\d+(?:\.\d{1,2})?$/.test(cleaned)) return null;
  if (Number(cleaned) <= 0 || Number(cleaned) > 999_999_999) return null;
  return cleaned;
}

const CURRENCY_PATTERNS: Array<[RegExp, string]> = [
  [/(?<![a-z])(?:ghs|ghc|cedis?|ghana cedis?)(?![a-z])|gh[₵¢]|₵/, "GHS"],
  [/(?<![a-z])(?:ngn|naira)(?![a-z])|₦/, "NGN"],
  [/(?<![a-z])(?:kes|ksh|kshs)(?![a-z])/, "KES"],
  [/(?<![a-z])(?:tzs|tsh|tshs)(?![a-z])/, "TZS"],
  [/(?<![a-z])ugx(?![a-z])/, "UGX"],
  [/(?<![a-z])(?:rwf|frw)(?![a-z])/, "RWF"],
  [/(?<![a-z])(?:zar|rands?)(?![a-z])/, "ZAR"],
  [/(?<![a-z])(?:zmw|kwacha)(?![a-z])/, "ZMW"],
  [/(?<![a-z])(?:usd|dollars?|bucks)(?![a-z])|\$/, "USD"],
];

export interface DetectedCurrency { code?: string; ambiguousShilling?: boolean }

export function detectCurrency(text: string): DetectedCurrency {
  for (const [pattern, code] of CURRENCY_PATTERNS) if (pattern.test(text)) return { code };
  if (/(?<![a-z])(?:shillings?|shs)(?![a-z])/.test(text)) return { ambiguousShilling: true };
  return {};
}

export const CURRENCY_WORD_PATTERN = String.raw`(?:gh[s₵¢c]?|₵|cedis?|ghana cedis?|ngn|naira|₦|kes|ksh|kshs|tzs|tsh|tshs|ugx|rwf|frw|zar|rands?|zmw|kwacha|usd|dollars?|\$|shillings?|shs)`;

/* ───────────── similarity (used for entity matching only) ───────────── */

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

export function similarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 1;
}

/** Deliberately simple English plural folding, applied to both sides of every comparison so the same rule cancels itself out. */
export function singularize(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:ches|shes|sses|xes|zes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export function tokenize(value: string): string[] {
  return value.normalize("NFD").replace(new RegExp("\\p{M}", "gu"), "").toLowerCase().replace(new RegExp("[^\\p{L}\\p{N}]+", "gu"), " ").trim().split(" ").filter(Boolean);
}

/** Title-cases a mention for echoing back to the owner ("adwoa mensah" → "Adwoa Mensah"). Display only. */
export function displayMention(value: string): string {
  return value.trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}
