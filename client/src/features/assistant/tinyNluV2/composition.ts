import type { CandidateIntent, NluAction, NluMode, NluModifier, NluObject, NluSafety, SemanticFactors } from "./types";

export function composeCandidates(factors: SemanticFactors): CandidateIntent[] {
  const out: CandidateIntent[] = [];
  const add = (intent: string, score: number, reason: string) => out.push({ intent, score: Math.min(0.99, score), factors, reason });
  if (factors.safety === "DESTRUCTIVE") add("UNSUPPORTED_ACTION", 0.99, "deterministic destructive-action safety pre-check");
  if (factors.safety === "OOD") add("UNKNOWN", 0.99, "out-of-domain rejection");
  if (factors.action === "PAY" && factors.object === "CUSTOMER") add("RECORD_CUSTOMER_PAYMENT", factors.safety === "FINANCIAL_WRITE" ? 0.86 : 0.7, "PAY + CUSTOMER");
  if ((factors.action === "RECEIVE" || factors.action === "RECORD") && (factors.object === "STOCK" || factors.object === "PURCHASE")) add("RECEIVE_STOCK", 0.84, "RECEIVE/RECORD + STOCK/PURCHASE");
  if ((factors.action === "RECORD" || factors.action === "SHOW") && factors.object === "SALE" && factors.safety === "FINANCIAL_WRITE") add("RECORD_SALE", 0.84, "RECORD + SALE");
  if (factors.action === "OPEN" && ["STOCK", "PRODUCT", "CUSTOMER", "SUPPLIER", "SALE", "REPORT", "EXPENSE", "FEATURE"].includes(factors.object)) add("NAVIGATE", 0.86, "OPEN + application object");
  if ((factors.action === "SHOW" || factors.action === "VIEW" || factors.action === "CHECK" || factors.action === "LIST") && factors.object === "STOCK") add("INVENTORY_QUERY", factors.modifier === "REMAINING" ? 0.93 : 0.76, "QUERY + STOCK + remaining/stock evidence");
  if ((factors.action === "SHOW" || factors.action === "VIEW" || factors.action === "CHECK") && factors.object === "CUSTOMER" && factors.modifier === "OUTSTANDING") add("CUSTOMER_BALANCE", 0.94, "QUERY + CUSTOMER + outstanding");
  if ((factors.action === "SHOW" || factors.action === "VIEW" || factors.action === "LIST") && factors.object === "PRODUCT" && ["BEST", "TOP"].includes(factors.modifier)) add("BEST_SELLING", 0.9, "QUERY + PRODUCT + best/top");
  if ((factors.action === "SHOW" || factors.action === "VIEW" || factors.action === "CHECK") && factors.object === "INSIGHT" && factors.modifier === "SLOW_MOVING") add("INSIGHTS_QUERY", 0.9, "QUERY + INSIGHT + slow-moving");
  if ((factors.action === "SHOW" || factors.action === "VIEW" || factors.action === "LIST") && factors.object === "SALE") add("SALES_QUERY", 0.78, "QUERY + SALE");
  if ((factors.action === "SHOW" || factors.action === "VIEW") && factors.object === "REPORT") add("FEATURE_DISCOVERY", 0.76, "SHOW + REPORT");
  if (factors.action === "EXPLAIN" || factors.mode === "HELP") add("HELP", 0.72, "help/explanation mode");
  if (factors.mode === "UNKNOWN") add("UNKNOWN", 0.6, "no compositional evidence");
  return out.sort((a, b) => b.score - a.score);
}

export function factorDefaults(): SemanticFactors { return { mode: "UNKNOWN", action: "NONE", object: "NONE", modifier: "NONE", safety: "READ_ONLY" }; }
export function inferMode(action: NluAction, object: NluObject, safety: NluSafety): NluMode { if (safety === "DESTRUCTIVE" || safety === "OOD") return "UNSUPPORTED"; if (safety === "FINANCIAL_WRITE") return "ACTION"; if (action === "OPEN") return "NAVIGATION"; if (action === "EXPLAIN") return "EXPLANATION"; if (object !== "NONE") return "QUERY"; return "UNKNOWN"; }
