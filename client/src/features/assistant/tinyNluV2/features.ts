import { tokenize } from "../text";

export function hashFeature(value: string, size: number): number { let hash = 2166136261; for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); } return (hash >>> 0) % size; }

export function extractFeatures(rawText: string, size = 8192): Map<number, number> {
  const text = rawText.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
  const tokens = tokenize(text);
  const values = new Map<number, number>();
  const add = (feature: string, weight = 1) => { const index = hashFeature(feature, size); values.set(index, (values.get(index) ?? 0) + weight); };
  add(`bias:${text.length < 8 ? "short" : text.length < 25 ? "medium" : "long"}`);
  for (const token of tokens) {
    add(`w:${token}`); add(`shape:${token.length}`);
    if (token.length >= 3) { add(`pre:${token.slice(0, 3)}`); add(`suf:${token.slice(-3)}`); }
  }
  for (let i = 0; i < tokens.length - 1; i += 1) add(`wb:${tokens[i]}_${tokens[i + 1]}`);
  for (const token of tokens) for (let n = 2; n <= 6; n += 1) for (let i = 0; i + n <= token.length; i += 1) add(`c${n}:${token.slice(i, i + n)}`, 0.5);
  if (/\d/.test(text)) add("has:number", 0.8);
  if (/[?]/.test(rawText)) add("has:question", 0.5);
  return values;
}
