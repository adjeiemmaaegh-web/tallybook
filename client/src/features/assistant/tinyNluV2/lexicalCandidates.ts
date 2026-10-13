import { levenshtein, similarity, tokenize } from "../text";
import type { LexicalCandidate } from "./types";

export interface LexicalConcept { concept: string; kind: "action" | "object" | "modifier" | "mode"; variants: readonly string[]; }

const PHONETIC_REWRITES: Array<[RegExp, string]> = [[/[0aeiou]+/g, "a"], [/ph/g, "f"], [/ck/g, "k"], [/qu/g, "k"], [/x/g, "ks"], [/z/g, "s"]];
export function phoneticKey(value: string): string { let key = value.toLowerCase().replace(/[^a-z]/g, ""); for (const [pattern, replacement] of PHONETIC_REWRITES) key = key.replace(pattern, replacement); return key.replace(/(.)\1+/g, "$1"); }

export function candidateConcepts(rawText: string, concepts: readonly LexicalConcept[]): LexicalCandidate[] {
  const prepared = rawText.toLowerCase().replace(/\s+/g, " ").trim();
  const phraseMatches = concepts.flatMap((entry) => entry.variants.filter((variant) => variant.includes(" ") && prepared.includes(variant)).map((variant) => ({ input: variant, concept: entry.concept, kind: entry.kind, score: 0.98, method: "alias" as const })));
  const tokens = tokenize(rawText);
  const output: LexicalCandidate[] = [...phraseMatches];
  for (const input of tokens) {
    const candidates = concepts.flatMap((entry) => entry.variants.map((variant) => ({ entry, variant, score: input === variant ? 1 : similarity(input, variant), phonetic: phoneticKey(input) === phoneticKey(variant) })));
    const exact = candidates.filter((item) => input === item.variant);
    if (exact.length) { output.push(...exact.map((item) => ({ input, concept: item.entry.concept, kind: item.entry.kind, score: 1, method: "exact" as const }))); continue; }
    const ranked = candidates.filter((item) => item.score >= (input.length <= 3 ? 0.66 : 0.68) || item.phonetic).sort((a, b) => (b.phonetic ? 0.02 : 0) + b.score - ((a.phonetic ? 0.02 : 0) + a.score));
    const best = ranked[0];
    const second = ranked.find((item) => item.entry.concept !== best?.entry.concept);
    if (!best || (second && best.score - second.score < 0.06 && !best.phonetic)) continue;
    const method = best.phonetic && best.score < 0.9 ? "phonetic" : best.score === 1 ? "alias" : "edit";
    output.push({ input, concept: best.entry.concept, kind: best.entry.kind, score: Math.min(0.99, best.score), method });
  }
  return output;
}

export function roleMentions(rawText: string): { customer?: string; product?: string; supplier?: string; amount?: string; quantity?: string; dateOrPeriod?: string; paymentMethod?: string } {
  const text = rawText.toLowerCase();
  const amount = /(?:ghs|ghc|cedis?|₵|\$)?\s*(\d+(?:[,.]\d{1,2})?)/i.exec(text)?.[1];
  const quantity = /\b(?:sell|sold|give|receive|brought|bring|buy|bought|add|record)\s+(?:a|an|the)?\s*(\d+)\b/i.exec(text)?.[1];
  const paymentMethod = /\b(cash|momo|mobile money|card|credit|pos)\b/i.exec(text)?.[1];
  const dateOrPeriod = /\b(today|yesterday|last month|this month|this week|last week)\b/i.exec(text)?.[1];
  const customer = /\b(?:to|for|pay|paid|owe|owes|owing)\s+([a-z][a-z' -]{1,30}?)(?=\s+(?:cash|momo|card|credit|paid|owe|owes|\d)|$)/i.exec(text)?.[1]?.trim();
  const supplier = /\b(?:from|supplier|vendor)\s+([a-z][a-z' -]{1,30}?)(?=\s+(?:for|with|at|\d)|$)/i.exec(text)?.[1]?.trim();
  return { ...(customer ? { customer } : {}), ...(supplier ? { supplier } : {}), ...(amount ? { amount } : {}), ...(quantity ? { quantity } : {}), ...(dateOrPeriod ? { dateOrPeriod } : {}), ...(paymentMethod ? { paymentMethod } : {}) };
}

export function editDistanceAtMostOne(a: string, b: string): boolean { return a === b || levenshtein(a, b) <= 1; }
