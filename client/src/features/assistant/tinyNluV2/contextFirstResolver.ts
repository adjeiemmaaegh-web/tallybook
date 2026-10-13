import { findAppCapability, parseApplicationRequest, type AppCapability } from "../appKnowledge";
import { interpretLanguage } from "../languageUnderstanding";
import { candidateConcepts, roleMentions } from "./lexicalCandidates";
import { TINY_NLU_LANGUAGE_PACK } from "./languagePack";
import { composeCandidates } from "./composition";
import { predictTinyNlu } from "./model";
import { safetyPrecheck, type SafetyPrecheck } from "./safety";
import { ACTIONS, MODIFIERS, OBJECTS, type CandidateIntent, type NluAction, type NluMode, type NluModifier, type NluObject, type NluSafety, type SemanticFactors, type TinyNluArtifact, type RoleMentions, type LexicalCandidate } from "./types";

export type ResolutionDisposition = "ANSWER" | "NAVIGATE" | "PREVIEW_WRITE" | "ASK_CLARIFICATION" | "REJECT";
export type ResolutionMode = "NAVIGATION" | "QUERY" | "HELP" | "ACTION" | "REVERSAL" | "COMPARISON" | "UNKNOWN";

export interface AssistantContext {
  currentRoute?: string;
  customerNames?: readonly string[];
  supplierNames?: readonly string[];
  productNames?: readonly string[];
}

export interface NormalizedInput {
  original: string;
  prepared: string;
  normalized: string;
  tokens: ReturnType<typeof interpretLanguage>["tokens"];
  unmatched: string[];
}

export interface EntityMention {
  value: string;
  kind: "customer" | "supplier" | "product";
  source: "local-record" | "phrase-role" | "unknown-noun";
  score: number;
}

export interface ResolvedRoles extends RoleMentions {
  customerEntity?: EntityMention;
  supplierEntity?: EntityMention;
  productEntity?: EntityMention;
}

export interface SemanticFrame {
  id: string;
  priority: number;
  evidence: string[];
  factors: Partial<SemanticFactors>;
  clarification?: string;
}

export interface ViewResolution {
  kind: "NAVIGATION" | "QUERY" | "HELP" | "AMBIGUOUS";
  confidence: number;
  evidence: string[];
  capability?: AppCapability;
  clarification?: string;
}

export interface ContextFirstResolution {
  disposition: ResolutionDisposition;
  input: NormalizedInput;
  safety: SafetyPrecheck;
  mode: ResolutionMode;
  roles: ResolvedRoles;
  frames: SemanticFrame[];
  view?: ViewResolution;
  factors: SemanticFactors;
  candidates: CandidateIntent[];
  lexical: LexicalCandidate[];
  confidence: number;
  evidence: string[];
  diagnostics: string[];
  clarification?: string;
}

const NAVIGATION_WORDS = /\b(?:open|opn|opin|go\s+to|take\s+me\s+to|bring\s+up|page|screen|section|menu|navigate|where\s+is)\b/i;
const QUERY_WORDS = /\b(?:how\s+many|how\s+much|what\s+remains?|what\s+is\s+left|which|who\s+owes?|balance|outstanding|best|top|slow|today|yesterday|last\s+month|sales|available|in\s+stock)\b/i;
const HELP_WORDS = /\b(?:what\s+can\s+i\s+do|what\s+can\s+you\s+help|how\s+does\s+this\s+work|how\s+do\s+i|how\s+can\s+i|how\s+to|teach\s+me|explain|help\s+me)\b/i;
const REVERSAL_WORDS = /\b(?:undo|reverse|cancel|remove|delete|refund|erase|clear)\b/i;
const WRITE_WORDS = /\b(?:record|sell|sold|receive|received|brought|bring\s+\d|pay|paid|repay|adjust|count|add|create|save)\b|\b(?:give|sell)\b.*\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
const AMBIGUOUS_VIEW_WORDS = /\b(?:show|see|view|display|check|look)\b/i;
const ENTITY_WORDS = new Set(["customer", "client", "buyer", "supplier", "vendor", "product", "item", "stock", "inventory", "rice", "eggs", "sugar", "soap", "milk"]);

const frame = (id: string, priority: number, evidence: string[], factors: Partial<SemanticFactors>, clarification?: string): SemanticFrame => ({ id, priority, evidence, factors, clarification });

function normalizeInput(rawText: string): NormalizedInput {
  const interpretation = interpretLanguage(rawText);
  return { original: rawText, prepared: interpretation.preparedText, normalized: interpretation.normalizedText, tokens: interpretation.tokens, unmatched: interpretation.diagnostics.unmatched };
}

function matchFrames(text: string, safety: SafetyPrecheck): SemanticFrame[] {
  const frames: SemanticFrame[] = [];
  if (safety.safety === "DESTRUCTIVE") frames.push(frame("destructive-safety", 1000, safety.reasons, { mode: "UNSUPPORTED", safety: "DESTRUCTIVE" }));
  if (safety.safety === "OOD") frames.push(frame("out-of-domain", 1000, safety.reasons, { mode: "UNSUPPORTED", safety: "OOD" }));
  if (/\b(?:what|wetin)\b.*\b(?:left|remain|remaining|available)\b|\b(?:wetin dey left|dey left)\b/i.test(text)) frames.push(frame("remaining-stock-question", 950, ["remaining-stock phrase"], { mode: "QUERY", action: "SHOW", object: "STOCK", modifier: "REMAINING" }));
  if (/\bhow\s+much\b.*\b(?:owe|owes|owing|debt|balance)\b|\bhow much dey\b.*\bowe\b/i.test(text)) frames.push(frame("customer-outstanding-question", 950, ["outstanding-balance phrase"], { mode: "QUERY", action: "SHOW", object: "CUSTOMER", modifier: "OUTSTANDING" }));
  if (/\bwhat\s+can\s+i\s+do\b|\bwhat\s+can\s+you\s+help\b|\bhow\s+do\s+i\b.*\b(?:record|sell|receive|pay|use)\b/i.test(text)) frames.push(frame("application-help", 940, ["help/discovery phrase"], { mode: "HELP", action: "EXPLAIN", object: "FEATURE", safety: "READ_ONLY" }));
  if (/\bbring\s+up\b|\b(?:open|opn|opin|go\s+to|take\s+me\s+to)\b/i.test(text)) frames.push(frame("explicit-navigation", 930, ["explicit navigation verb"], { mode: "NAVIGATION", action: "OPEN" }));
  if (/\bbring\s+\d+\b|\b(?:receive|received|brought)\b.*\b\d+\b/i.test(text)) frames.push(frame("stock-receipt-action", 930, ["quantity-bearing stock receipt phrase"], { mode: "ACTION", action: "RECEIVE", object: "STOCK", safety: "FINANCIAL_WRITE" }));
  if (/\b(?:give|sell|sold)\b.*\b\d+\b|\b(?:record|log)\s+(?:a\s+)?sale\b/i.test(text)) frames.push(frame("sale-write-action", 930, ["quantity-bearing sale phrase"], { mode: "ACTION", action: "RECORD", object: "SALE", safety: "FINANCIAL_WRITE" }));
  if (/\b(?:pay|paid|repay|settle)\b|\b(?:don|has|have)\s+paid\b/i.test(text)) frames.push(frame("payment-action", 920, ["payment phrase"], { mode: "ACTION", action: "PAY", object: "CUSTOMER", safety: "FINANCIAL_WRITE" }));
  return frames.sort((left, right) => right.priority - left.priority);
}

function findMention(value: string | undefined, kind: EntityMention["kind"], known: readonly string[] | undefined): EntityMention | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  const local = known?.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase());
  return { value: local ?? normalized, kind, source: local ? "local-record" : "phrase-role", score: local ? 1 : 0.78 };
}

function extractRoles(input: NormalizedInput, context: AssistantContext): ResolvedRoles {
  const mentions = roleMentions(input.normalized);
  const informalCustomer = /\bhow\s+much\s+(?:dey|is)\s+([a-z][a-z' -]{1,30}?)\s+owe\b/i.exec(input.normalized)?.[1]?.trim();
  const saleCustomer = /\b(?:give|sell|sold)\s+([a-z][a-z' -]{1,30}?)\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(input.normalized)?.[1]?.trim();
  const receiptSupplier = /^([a-z][a-z' -]{1,30}?)\s+bring\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i.exec(input.normalized)?.[1]?.trim();
  const customerEntity = findMention(mentions.customer ?? informalCustomer ?? saleCustomer, "customer", context.customerNames);
  const supplierEntity = findMention(mentions.supplier ?? receiptSupplier, "supplier", context.supplierNames);
  const product = mentions.product ?? input.normalized.match(/\b(?:rice|eggs?|sugar|soap|milk)\b/i)?.[0] ?? input.normalized.match(/\b(?:give|sell|sold)\s+[^\d]+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+([a-z][a-z-]*)\b/i)?.[1];
  const knownProduct = context.productNames?.find((candidate) => candidate.toLowerCase() === product?.toLowerCase());
  const productEntity = product ? { value: knownProduct ?? product, kind: "product" as const, source: knownProduct ? "local-record" as const : mentions.product ? "phrase-role" as const : "unknown-noun" as const, score: knownProduct ? 1 : mentions.product ? 0.78 : 0.62 } : undefined;
  return { ...mentions, ...(customerEntity ? { customerEntity } : {}), ...(supplierEntity ? { supplierEntity } : {}), ...(productEntity ? { productEntity } : {}) };
}

function resolveMode(text: string, safety: SafetyPrecheck, frames: SemanticFrame[], view?: ViewResolution): ResolutionMode {
  if (safety.safety === "DESTRUCTIVE") return "REVERSAL";
  if (safety.safety === "OOD") return "UNKNOWN";
  const strongest = frames[0]?.factors.mode;
  if (strongest === "HELP") return "HELP";
  if (strongest === "ACTION" || safety.safety === "FINANCIAL_WRITE") return "ACTION";
  if (strongest === "NAVIGATION" || view?.kind === "NAVIGATION") return "NAVIGATION";
  if (strongest === "QUERY" || view?.kind === "QUERY") return "QUERY";
  if (HELP_WORDS.test(text)) return "HELP";
  if (WRITE_WORDS.test(text)) return "ACTION";
  if (NAVIGATION_WORDS.test(text)) return "NAVIGATION";
  if (QUERY_WORDS.test(text)) return "QUERY";
  return "UNKNOWN";
}

function resolveView(text: string, modeHint: ResolutionMode, capability?: AppCapability): ViewResolution | undefined {
  if (!capability && modeHint !== "UNKNOWN") return undefined;
  const evidence: string[] = [];
  const hasNavigation = NAVIGATION_WORDS.test(text) || /\b(?:page|screen|section)\b/i.test(text);
  const hasQuery = QUERY_WORDS.test(text);
  const hasHelp = HELP_WORDS.test(text);
  if (hasNavigation) evidence.push("navigation cue");
  if (hasQuery) evidence.push("query cue");
  if (hasHelp) evidence.push("help cue");
  if (hasNavigation && hasQuery && AMBIGUOUS_VIEW_WORDS.test(text) && !/\b(?:open|go to|page|screen|section)\b/i.test(text)) return { kind: "AMBIGUOUS", confidence: 0.62, evidence, capability, clarification: "Do you want to open this section or see the saved records?" };
  if (hasHelp) return { kind: "HELP", confidence: 0.9, evidence, capability };
  if (hasNavigation) return { kind: "NAVIGATION", confidence: 0.9, evidence, capability };
  if (hasQuery) return { kind: "QUERY", confidence: 0.82, evidence, capability };
  if (capability) return { kind: "AMBIGUOUS", confidence: 0.6, evidence: ["capability match without decisive mode"], capability, clarification: "Would you like to open this section or ask about its records?" };
  return undefined;
}

function mergeFactors(mode: ResolutionMode, safety: SafetyPrecheck, frames: SemanticFrame[], view: ViewResolution | undefined, roles: ResolvedRoles, modelFactors?: SemanticFactors): SemanticFactors {
  const factorFrames = frames.filter((candidate) => candidate.factors.mode !== "UNSUPPORTED");
  const fromFrames = factorFrames.reduce<Partial<SemanticFactors>>((result, candidate) => ({ ...result, ...candidate.factors }), {});
  const action = (fromFrames.action ?? modelFactors?.action ?? (mode === "NAVIGATION" ? "OPEN" : mode === "HELP" ? "EXPLAIN" : mode === "QUERY" ? "SHOW" : "NONE")) as NluAction;
  const object = (fromFrames.object ?? modelFactors?.object ?? (roles.customerEntity ? "CUSTOMER" : roles.supplierEntity ? "SUPPLIER" : roles.productEntity ? "PRODUCT" : "NONE")) as NluObject;
  const modifier = (fromFrames.modifier ?? modelFactors?.modifier ?? "NONE") as NluModifier;
  const resolvedMode = (fromFrames.mode ?? modelFactors?.mode ?? mode) as NluMode;
  const resolvedSafety = safety.safety === "DESTRUCTIVE" || safety.safety === "OOD" || safety.safety === "FINANCIAL_WRITE" ? safety.safety : ((fromFrames.safety ?? modelFactors?.safety ?? "READ_ONLY") as NluSafety);
  return { mode: resolvedMode, action, object, modifier, safety: resolvedSafety };
}

function addCapabilityCandidate(candidates: CandidateIntent[], view: ViewResolution | undefined, factors: SemanticFactors): CandidateIntent[] {
  if (!view?.capability) return candidates;
  if (view.kind === "NAVIGATION") return [{ intent: "NAVIGATE", score: view.confidence, factors: { ...factors, mode: "NAVIGATION", action: "OPEN" }, reason: "application route and navigation evidence" }, ...candidates];
  if (view.kind === "HELP") return [{ intent: "APP_HELP", score: view.confidence, factors: { ...factors, mode: "HELP", action: "EXPLAIN", object: "FEATURE" }, reason: "application help evidence" }, ...candidates];
  return candidates;
}

function chooseDisposition(mode: ResolutionMode, safety: SafetyPrecheck, view: ViewResolution | undefined, candidates: CandidateIntent[], confidence: number): ResolutionDisposition {
  if (safety.safety === "DESTRUCTIVE") return "REJECT";
  if (safety.safety === "OOD") return "REJECT";
  if (safety.safety === "FINANCIAL_WRITE") return candidates.length ? "PREVIEW_WRITE" : "ASK_CLARIFICATION";
  if (view?.kind === "AMBIGUOUS") return "ASK_CLARIFICATION";
  if (view?.kind === "NAVIGATION" || mode === "NAVIGATION") return candidates.length ? "NAVIGATE" : "ASK_CLARIFICATION";
  if (mode === "HELP") return candidates.length ? "ANSWER" : "ASK_CLARIFICATION";
  if (candidates.length && candidates[0]?.intent !== "UNKNOWN" && confidence >= 0.55) return "ANSWER";
  if (mode !== "UNKNOWN" && (view || candidates.length)) return "ASK_CLARIFICATION";
  return "REJECT";
}

export function resolveContextFirst(rawText: string, context: AssistantContext = {}, artifact?: TinyNluArtifact): ContextFirstResolution {
  const input = normalizeInput(rawText);
  const safety = safetyPrecheck(input.original);
  const frames = matchFrames(input.normalized, safety);
  const capabilityMatch = findAppCapability(input.normalized)?.capability;
  const applicationRequest = parseApplicationRequest(input.normalized);
  const preliminaryView = safety.safety === "READ_ONLY" ? resolveView(input.normalized, "UNKNOWN", capabilityMatch) : undefined;
  const mode = resolveMode(input.normalized, safety, frames, preliminaryView);
  const view = safety.safety === "READ_ONLY" ? resolveView(input.normalized, mode, capabilityMatch ?? applicationRequest?.capability) : undefined;
  const roles = extractRoles(input, context);
  const model = artifact && safety.safety !== "DESTRUCTIVE" && safety.safety !== "OOD" ? predictTinyNlu(input.normalized, artifact) : undefined;
  const factors = mergeFactors(mode, safety, frames, view, roles, model?.factors);
  const compositional = composeCandidates(factors);
  const candidates = addCapabilityCandidate(compositional, view, factors).sort((left, right) => right.score - left.score);
  const confidence = Math.max(frames[0]?.priority === 1000 ? 0.99 : 0, view?.confidence ?? 0, candidates[0]?.score ?? 0, model && !model.rejected ? model.confidence : 0);
  const frameSafety = frames.find((candidate) => candidate.factors.safety === "FINANCIAL_WRITE")?.factors.safety;
  const effectiveSafety: SafetyPrecheck = frameSafety === "FINANCIAL_WRITE" && safety.safety === "READ_ONLY" ? { ...safety, safety: "FINANCIAL_WRITE", reasons: [...safety.reasons, "financial-write semantic frame detected"] } : safety;
  const disposition = chooseDisposition(mode, effectiveSafety, view, candidates, confidence);
  const evidence = [...frames.flatMap((candidate) => candidate.evidence), ...(view?.evidence ?? []), ...(roles.customerEntity ? [`customer: ${roles.customerEntity.value}`] : []), ...(roles.supplierEntity ? [`supplier: ${roles.supplierEntity.value}`] : []), ...(roles.productEntity ? [`product: ${roles.productEntity.value}`] : []), ...(model?.diagnostics ?? [])];
  const clarification = view?.clarification ?? frames.find((candidate) => candidate.clarification)?.clarification;
  return { disposition, input, safety: effectiveSafety, mode, roles, frames, view, factors: effectiveSafety.safety === "FINANCIAL_WRITE" && factors.safety === "READ_ONLY" ? { ...factors, safety: "FINANCIAL_WRITE" } : factors, candidates, lexical: candidateConcepts(input.normalized, TINY_NLU_LANGUAGE_PACK), confidence, evidence, diagnostics: [...input.unmatched.map((token) => `unmatched token: ${token}`), ...effectiveSafety.reasons], ...(clarification ? { clarification } : {}) };
}

export function isWritePreview(result: ContextFirstResolution): boolean { return result.disposition === "PREVIEW_WRITE" && result.safety.safety === "FINANCIAL_WRITE"; }
