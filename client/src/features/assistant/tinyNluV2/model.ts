import { candidateConcepts, roleMentions } from "./lexicalCandidates";
import { composeCandidates, inferMode } from "./composition";
import { extractFeatures } from "./features";
import { TINY_NLU_LANGUAGE_PACK } from "./languagePack";
import { safetyPrecheck } from "./safety";
import { ACTIONS, MODES, MODIFIERS, OBJECTS, SAFETY, type FactorName, type SemanticFactors, type TinyNluArtifact, type TinyNluPrediction } from "./types";

type Label = string;
function scoreHead(features: Map<number, number>, labels: readonly string[], weights: Record<string, number>, bias: Record<string, number>): Map<string, number> {
  const scores = new Map(labels.map((label) => [label, bias[label] ?? 0]));
  for (const [index, value] of Array.from(features.entries())) for (const label of labels) scores.set(label, (scores.get(label) ?? 0) + (weights[`${label}:${index}`] ?? 0) * value);
  const max = Math.max(...Array.from(scores.values()));
  const exps = new Map(Array.from(scores, ([label, value]) => [label, Math.exp(Math.max(-30, value - max))]));
  const total = Array.from(exps.values()).reduce((sum, value) => sum + value, 0);
  return new Map(Array.from(exps, ([label, value]) => [label, value / total]));
}
function top(scores: Map<string, number>): [string, number, number] { const sorted = Array.from(scores.entries()).sort((a, b) => b[1] - a[1]); return [sorted[0]?.[0] ?? "UNKNOWN", sorted[0]?.[1] ?? 0, (sorted[0]?.[1] ?? 0) - (sorted[1]?.[1] ?? 0)]; }

export function predictTinyNlu(rawText: string, artifact: TinyNluArtifact, options: { featureSpace?: number } = {}): TinyNluPrediction {
  const safety = safetyPrecheck(rawText);
  const features = extractFeatures(rawText, options.featureSpace ?? artifact.featureSpace);
  const lexical = candidateConcepts(rawText, TINY_NLU_LANGUAGE_PACK);
  const roles = roleMentions(rawText);
  const head = (name: FactorName, labels: readonly string[]) => scoreHead(features, labels, artifact.weights[name], artifact.bias[name]);
  const actionScores = head("action", ACTIONS); const objectScores = head("object", OBJECTS); const modifierScores = head("modifier", MODIFIERS); const safetyScores = head("safety", SAFETY); const modeScores = head("mode", MODES);
  const concept = (kind: "action" | "object" | "modifier", names: readonly string[]) => lexical.find((item) => item.kind === kind && names.includes(item.concept) && item.score >= 0.68);
  const actionHint = /\bbring\s+\d/i.test(rawText) ? lexical.find((item) => item.kind === "action" && item.concept === "RECEIVE") : lexical.find((item) => item.kind === "action" && [...ACTIONS].includes(item.concept as never) && (item.method === "exact" || item.method === "alias" || item.score >= 0.82));
  const objectHint = concept("object", OBJECTS); const modifierHint = concept("modifier", MODIFIERS);
  const [headAction, headActionConfidence] = top(actionScores); const [headObject, headObjectConfidence] = top(objectScores); const [headModifier, headModifierConfidence] = top(modifierScores); const [, , modeMargin] = top(modeScores);
  const queryWords = /\b(?:what|how|which|show|check|see|view|list)\b/i.test(rawText);
  const action = actionHint?.concept ?? (/\b(?:give|sell|sold)\b/i.test(rawText) ? "RECORD" : roles.paymentMethod || roles.amount ? "PAY" : queryWords ? "SHOW" : headAction);
  const object = objectHint?.concept ?? (action === "PAY" && roles.customer ? "CUSTOMER" : action === "RECEIVE" ? "STOCK" : action === "RECORD" && /\b(?:give|sell|sold)\b/i.test(rawText) ? "SALE" : action === "RECORD" && roles.quantity ? "STOCK" : modifierHint?.concept === "SLOW_MOVING" ? "INSIGHT" : modifierHint?.concept === "OUTSTANDING" ? "CUSTOMER" : modifierHint?.concept === "REMAINING" || /\b(?:left|remain|have|available|inventory|stock)\b/i.test(rawText) ? "STOCK" : /\bwhat can i do\b/i.test(rawText) ? "FEATURE" : headObject);
  const modifier = modifierHint?.concept ?? (object === "STOCK" && /\b(?:left|remain|have|available)\b/i.test(rawText) ? "REMAINING" : headModifier);
  const actionConfidence = actionHint || action === "RECORD" && /\b(?:give|sell|sold)\b/i.test(rawText) || action === "SHOW" && queryWords ? 0.86 : headActionConfidence;
  const objectConfidence = objectHint || roles.customer && object === "CUSTOMER" || modifierHint && ["STOCK", "INSIGHT", "CUSTOMER"].includes(object) || object === "STOCK" && /\b(?:left|remain|have|available|inventory|stock)\b/i.test(rawText) || object === "SALE" && /\b(?:give|sell|sold)\b/i.test(rawText) || object === "FEATURE" && /\bwhat can i do\b/i.test(rawText) ? 0.86 : headObjectConfidence;
  const modifierConfidence = modifierHint ? Math.max(0.86, modifierHint.score) : 0.86;
  const effectiveSafety = safety.safety;
  const factors: SemanticFactors = { mode: safety.blocked ? "UNSUPPORTED" : inferMode(action as never, object as never, effectiveSafety), action: action as never, object: object as never, modifier: modifier as never, safety: effectiveSafety };
  const effectiveModeConfidence = factors.mode === "UNKNOWN" ? 0.3 : 0.86;
  const effectiveSafetyConfidence = 0.86;
  const candidates = composeCandidates(factors);
  const confidence = Math.min(actionConfidence, objectConfidence, modifierConfidence, effectiveSafetyConfidence, effectiveModeConfidence);
  const margin = actionHint || objectHint || modifierHint || queryWords ? Math.max(0.1, modeMargin) : modeMargin;
  const learned = Object.keys(artifact.weights.action).length > 0;
  const rejected = safety.blocked || !learned || confidence < artifact.reject.confidence || margin < artifact.reject.margin || !candidates.length;
  const visibleFactors = rejected && !safety.blocked ? { ...factors, mode: "UNKNOWN" as const, safety: factors.safety === "FINANCIAL_WRITE" ? "FINANCIAL_WRITE" as const : "AMBIGUOUS" as const } : factors;
  return { factors: visibleFactors, factorScores: { action: actionConfidence, object: objectConfidence, modifier: modifierConfidence, safety: effectiveSafetyConfidence, mode: effectiveModeConfidence }, candidates: rejected && !safety.blocked ? [{ intent: "UNKNOWN", score: confidence, factors, reason: "open-set rejection" }] : candidates, roles, lexical, confidence, margin, rejected, safetyBlocked: safety.blocked, diagnostics: [...safety.reasons, ...(rejected ? ["prediction abstained by calibrated confidence/margin gate"] : [])] };
}

export function emptyArtifact(featureSpace = 8192): TinyNluArtifact { return { version: 2, featureSpace, ngramMin: 2, ngramMax: 6, labels: { mode: [...MODES], action: [...ACTIONS], object: [...OBJECTS], modifier: [...MODIFIERS], safety: [...SAFETY] }, weights: { mode: {}, action: {}, object: {}, modifier: {}, safety: {} }, bias: { mode: {}, action: {}, object: {}, modifier: {}, safety: {} }, reject: { confidence: 0.55, margin: 0.05 }, generatedAt: new Date().toISOString() }; }
