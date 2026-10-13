/**
 * Tallybook Assistant — entity matching.
 *
 * Compares words the owner typed with real records. It only ever returns records that were passed in, and it only reports a single
 * match ("one") when that is safe. Ambiguity and possible typos are returned as "many" / "suggest" so the router can ask the owner.
 */
import { levenshtein, similarity, singularize, tokenize } from "./text";

export interface MatchCandidate { id: string; name: string; aliases?: string[] }

export type MatchResult<T extends MatchCandidate> =
  | { status: "none" }
  /** Exactly one record fits. Safe to use. */
  | { status: "one"; match: T }
  /** Several records fit equally well. The owner must choose. */
  | { status: "many"; matches: T[] }
  /** Only a close spelling was found. The owner must confirm it. */
  | { status: "suggest"; matches: T[] };

/** Same word, allowing simple plurals and an extra short suffix ("tomato"/"tomatoes"). */
function sameWord(left: string, right: string): boolean {
  if (left === right || singularize(left) === singularize(right)) return true;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  return shorter.length >= 4 && longer.startsWith(shorter) && longer.length - shorter.length <= 2;
}

function tierFor(mention: string[], variant: string[]): number {
  if (!mention.length || !variant.length) return 0;
  if (mention.length === variant.length && mention.every((word, index) => singularize(word) === singularize(variant[index]))) return 4;
  if (mention.every((word) => variant.some((candidate) => sameWord(word, candidate)))) return 3;
  if (mention.every((word) => variant.some((candidate) => sameWord(word, candidate) || (word.length >= 3 && candidate.startsWith(word))))) return 2;
  const fuzzy = (word: string, candidate: string) => word.length >= 4 && candidate.length >= 4 && (similarity(word, candidate) >= 0.8 || levenshtein(word, candidate) <= 1);
  if (mention.every((word) => variant.some((candidate) => sameWord(word, candidate) || fuzzy(word, candidate)))) return 1;
  return 0;
}

export function matchEntity<T extends MatchCandidate>(mention: string, candidates: readonly T[]): MatchResult<T> {
  const mentionTokens = tokenize(mention);
  if (!mentionTokens.length) return { status: "none" };
  const scored = candidates
    .map((candidate) => ({ candidate, tier: Math.max(...[candidate.name, ...(candidate.aliases ?? [])].map((text) => tierFor(mentionTokens, tokenize(text)))) }))
    .filter((entry) => entry.tier > 0);
  if (!scored.length) return { status: "none" };
  const best = Math.max(...scored.map((entry) => entry.tier));
  const top = scored.filter((entry) => entry.tier === best).map((entry) => entry.candidate).sort((left, right) => left.name.localeCompare(right.name));
  if (best === 1) return { status: "suggest", matches: top };
  return top.length === 1 ? { status: "one", match: top[0] } : { status: "many", matches: top };
}
