/**
 * Measures the Assistant's understanding layer on phrasing it was not tuned on.
 * Same order as the live Assistant: the rule-based parser first, then the
 * tinyNluV2 context resolver for read-only questions the parser gave up on.
 *
 * Report only: it prints the numbers and fails solely on a confident wrong
 * write (the parser acting on the wrong sale/stock/payment/record, or the right
 * one with the wrong quantity or amount), which is never acceptable.
 * Run: pnpm exec vitest run client/src/features/assistant/eval/heldout.eval.test.ts
 */
import { describe, expect, it } from "vitest";
import { parseCommand } from "../intentParser";
import { resolveContextFirst } from "../tinyNluV2/contextFirstResolver";
import { CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, type AssistantIntent, type ParsedEntities } from "../types";
import { heldoutCases, type HeldoutCase } from "./heldoutCases";

const NOW = new Date(2026, 10, 5, 12, 0, 0);
const WRITES = new Set<AssistantIntent>(["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT", "CREATE_CUSTOMER", "CREATE_PRODUCT", "CREATE_CATEGORY", "CREATE_SUPPLIER", "ADJUST_INVENTORY"]);
const CONTEXT_FALLBACK = new Set<AssistantIntent>(["CUSTOMER_BALANCE", "INVENTORY_QUERY", "SALES_QUERY", "TODAY_SALES", "BEST_SELLING", "LOW_STOCK", "INSIGHTS_QUERY", "TOP_DEBTORS", "ACTIVITY_QUERY"]);

type Outcome = "correct" | "asked" | "declined" | "wrong-read" | "wrong-write" | "wrong-numbers";

function understand(text: string): { intent: AssistantIntent; confidence: number; entities: Partial<ParsedEntities>; layer: "parser" | "tinyNlu" | "none" } {
  const parsed = parseCommand(text, { now: NOW });
  if (parsed.intent !== "UNKNOWN") return { intent: parsed.intent, confidence: parsed.confidence, entities: parsed.entities, layer: "parser" };
  const context = resolveContextFirst(text);
  const top = context.candidates[0]?.intent as AssistantIntent | undefined;
  if (top && CONTEXT_FALLBACK.has(top) && context.safety.safety === "READ_ONLY")
    return { intent: top, confidence: Math.min(0.78, Math.max(0.46, context.confidence)), entities: {}, layer: "tinyNlu" };
  return { intent: "UNKNOWN", confidence: parsed.confidence, entities: parsed.entities, layer: "none" };
}

const has = (actual: unknown, expected: string) => typeof actual === "string" && actual.toLowerCase().includes(expected.toLowerCase());

function judge(testCase: HeldoutCase, result: ReturnType<typeof understand>): Outcome {
  const acts = result.intent !== "UNKNOWN" && result.confidence >= CONFIDENCE_HIGH;
  const asks = result.intent !== "UNKNOWN" && result.confidence >= CONFIDENCE_MEDIUM && !acts;
  if (testCase.intent === "UNKNOWN") {
    if (WRITES.has(result.intent) && acts) return "wrong-write";
    return result.intent === "UNKNOWN" || !acts ? "correct" : "wrong-read";
  }
  const e = testCase.expect ?? {};
  const numbersOk = (e.quantity === undefined || result.entities.quantity === e.quantity)
    && (e.amount === undefined || result.entities.amount === e.amount);
  const namesOk = (["productText", "customerText", "supplierText"] as const).every((key) => e[key] === undefined || has(result.entities[key], e[key]!))
    && (e.paymentMethod === undefined || result.entities.paymentMethod === e.paymentMethod);
  if (result.intent === testCase.intent) {
    if (!numbersOk) return WRITES.has(result.intent) && acts ? "wrong-numbers" : "asked";
    if (!acts) return asks ? "asked" : "declined";
    return namesOk ? "correct" : "asked";
  }
  if (result.intent === "UNKNOWN" || !acts) return asks ? "asked" : "declined";
  return WRITES.has(result.intent) ? "wrong-write" : "wrong-read";
}

describe("assistant understanding on held-out phrasing", () => {
  it("reports accuracy by request type and style, and never acts on a wrong write", () => {
    const rows = heldoutCases.map((testCase) => { const result = understand(testCase.text); return { testCase, result, outcome: judge(testCase, result) }; });
    const pct = (n: number, d: number) => d ? `${((n / d) * 100).toFixed(0)}%` : "-";
    const tally = (subset: typeof rows) => {
      const count = (o: Outcome) => subset.filter((r) => r.outcome === o).length;
      return { cases: subset.length, correct: pct(count("correct"), subset.length), asked: count("asked"), declined: count("declined"),
        wrongRead: count("wrong-read"), wrongWrite: count("wrong-write") + count("wrong-numbers") };
    };
    const byIntent = Object.fromEntries([...new Set(heldoutCases.map((c) => c.intent))].map((intent) => [intent, tally(rows.filter((r) => r.testCase.intent === intent))]));
    const byStyle = Object.fromEntries([...new Set(heldoutCases.map((c) => c.style))].map((style) => [style, tally(rows.filter((r) => r.testCase.style === style))]));
    const rescued = rows.filter((r) => r.result.layer === "tinyNlu" && r.outcome === "correct").length;
    console.info("\nHELD-OUT OVERALL", JSON.stringify(tally(rows)), `tinyNlu rescued: ${rescued}`);
    console.table(byIntent);
    console.table(byStyle);
    console.table(rows.filter((r) => r.outcome !== "correct").map((r) => ({ text: r.testCase.text, expected: r.testCase.intent, got: r.result.intent,
      conf: Number(r.result.confidence.toFixed(2)), layer: r.result.layer, outcome: r.outcome,
      qty: r.result.entities.quantity, amount: r.result.entities.amount })));
    const unsafe = rows.filter((r) => r.outcome === "wrong-write" || r.outcome === "wrong-numbers");
    expect(unsafe.map((r) => r.testCase.text), "the parser must never confidently act on a wrong write").toEqual([]);
  });
});
