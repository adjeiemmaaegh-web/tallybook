import type { NluSafety } from "./types";

const DESTRUCTIVE = /\b(?:delete|remove|cancel|refund|reverse|undo|erase|clear)\b/i;
const EDIT_COMMAND = /^(?:(?:please|can you|could you)\s+)?(?:change|edit)\s+(?:the\s+|my\s+|a\s+|an\s+)?(?:sale|payment|transaction|receipt|record|customer|product|expense|stock|inventory)\b/i;
const INFORMATIONAL = /^(?:how|what|why|when|where|who|which|can i|could i|is it possible|explain|show me|tell me|do you know)\b/i;
const WRITE = /\b(?:sell|sold|record|receive|received|brought|pay|paid|repay|adjust|count|add|create|save)\b|\bbring\s+\d/i;
const OOD = /\b(?:weather|joke|recipe|football|politics|movie|song|travel|news)\b/i;
const AMBIGUOUS = /\b(?:maybe|perhaps|something|stuff|things|somebody|someone|it|that|those|same)\b/i;

export interface SafetyPrecheck { safety: NluSafety; blocked: boolean; reasons: string[]; }
export function safetyPrecheck(rawText: string): SafetyPrecheck {
  const reasons: string[] = [];
  if (!INFORMATIONAL.test(rawText.trim()) && (DESTRUCTIVE.test(rawText) || EDIT_COMMAND.test(rawText.trim()))) { reasons.push("destructive language requires explicit unsupported/clarification handling"); return { safety: "DESTRUCTIVE", blocked: true, reasons }; }
  if (OOD.test(rawText)) { reasons.push("request is outside Tallybook domain"); return { safety: "OOD", blocked: true, reasons }; }
  if (WRITE.test(rawText)) { reasons.push("financial write candidate must remain preview and confirmation gated"); return { safety: "FINANCIAL_WRITE", blocked: false, reasons }; }
  if (AMBIGUOUS.test(rawText)) { reasons.push("reference or object may be ambiguous"); return { safety: "AMBIGUOUS", blocked: false, reasons }; }
  return { safety: "READ_ONLY", blocked: false, reasons };
}
