export const MODES = ["NAVIGATION", "QUERY", "ACTION", "HELP", "EXPLANATION", "DISCOVERY", "UNSUPPORTED", "UNKNOWN"] as const;
export type NluMode = (typeof MODES)[number];
export const ACTIONS = ["OPEN", "SHOW", "VIEW", "CHECK", "LIST", "FIND", "SEARCH", "CREATE", "ADD", "RECORD", "PAY", "RECEIVE", "ADJUST", "COMPARE", "EXPLAIN", "DELETE", "REMOVE", "CANCEL", "REFUND", "UNDO", "NONE"] as const;
export type NluAction = (typeof ACTIONS)[number];
export const OBJECTS = ["STOCK", "PRODUCT", "CUSTOMER", "SUPPLIER", "SALE", "PAYMENT", "PURCHASE", "EXPENSE", "REPORT", "BALANCE", "INSIGHT", "CATEGORY", "FEATURE", "ACTIVITY", "NONE"] as const;
export type NluObject = (typeof OBJECTS)[number];
export const MODIFIERS = ["TODAY", "YESTERDAY", "LAST", "LAST_MONTH", "REMAINING", "LOW_STOCK", "BEST", "TOP", "SLOW_MOVING", "OUTSTANDING", "BOUGHT", "PAID", "NONE"] as const;
export type NluModifier = (typeof MODIFIERS)[number];
export const SAFETY = ["READ_ONLY", "FINANCIAL_WRITE", "DESTRUCTIVE", "AMBIGUOUS", "UNSUPPORTED", "OOD"] as const;
export type NluSafety = (typeof SAFETY)[number];
export type FactorName = "mode" | "action" | "object" | "modifier" | "safety";
export type FactorValue = NluMode | NluAction | NluObject | NluModifier | NluSafety;

export interface LexicalCandidate { input: string; concept: string; kind: "action" | "object" | "modifier" | "mode"; score: number; method: "exact" | "alias" | "edit" | "phonetic"; }
export interface SemanticFactors { mode: NluMode; action: NluAction; object: NluObject; modifier: NluModifier; safety: NluSafety; }
export interface RoleMentions { customer?: string; product?: string; supplier?: string; amount?: string; quantity?: string; dateOrPeriod?: string; paymentMethod?: string; }
export interface CandidateIntent { intent: string; score: number; factors: SemanticFactors; reason: string; }
export interface TinyNluPrediction { factors: SemanticFactors; factorScores: Record<FactorName, number>; candidates: CandidateIntent[]; roles: RoleMentions; lexical: LexicalCandidate[]; confidence: number; margin: number; rejected: boolean; safetyBlocked: boolean; diagnostics: string[]; }

export interface TinyNluArtifact {
  version: 2;
  featureSpace: number;
  ngramMin: number;
  ngramMax: number;
  labels: Record<FactorName, string[]>;
  weights: Record<FactorName, Record<string, number>>;
  bias: Record<FactorName, Record<string, number>>;
  reject: { confidence: number; margin: number };
  generatedAt: string;
}
