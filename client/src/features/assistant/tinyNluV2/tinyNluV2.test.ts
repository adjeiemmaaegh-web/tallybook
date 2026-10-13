import { describe, expect, it } from "vitest";
import { candidateConcepts } from "./lexicalCandidates";
import { TINY_NLU_LANGUAGE_PACK } from "./languagePack";
import { emptyArtifact, predictTinyNlu } from "./model";
import { safetyPrecheck } from "./safety";

describe("Tiny NLU v2 isolated components", () => {
  it("resolves reusable abbreviations without sentence aliases", () => {
    const concepts = candidateConcepts("opin sto custmr suplier expence rpts", TINY_NLU_LANGUAGE_PACK);
    expect(concepts.map((item) => item.concept)).toEqual(expect.arrayContaining(["OPEN", "STOCK", "CUSTOMER", "SUPPLIER", "EXPENSE", "REPORT"]));
  });
  it("recognizes informal reusable concepts", () => {
    const concepts = candidateConcepts("wetin dey left which tins no dey move", TINY_NLU_LANGUAGE_PACK);
    expect(concepts.some((item) => item.concept === "REMAINING")).toBe(true);
    expect(concepts.some((item) => item.concept === "SLOW_MOVING")).toBe(true);
  });
  it("puts deterministic destructive safety before model output", () => {
    expect(safetyPrecheck("delete the last sale")).toMatchObject({ safety: "DESTRUCTIVE", blocked: true });
    expect(safetyPrecheck("refund Kwame").blocked).toBe(true);
  });
  it("rejects an untrained artifact instead of inventing a normal intent", () => {
    const prediction = predictTinyNlu("what is the weather", emptyArtifact());
    expect(prediction.safetyBlocked).toBe(true);
    expect(prediction.rejected).toBe(true);
  });
  it("keeps financial writes non-executable at the NLU boundary", () => {
    const prediction = predictTinyNlu("pay john 500", emptyArtifact());
    expect(prediction.safetyBlocked).toBe(false);
    expect(prediction.factors.safety).toBe("FINANCIAL_WRITE");
    expect(prediction.rejected).toBe(true);
  });
});

describe("intent-aware safety regressions", () => {
  it("allows informational questions about editing while blocking actual destructive commands", () => {
    expect(safetyPrecheck("How can I edit a sale?").blocked).toBe(false);
    expect(safetyPrecheck("What happens if I delete a sale?").blocked).toBe(false);
    expect(safetyPrecheck("edit the sale")).toMatchObject({ safety: "DESTRUCTIVE", blocked: true });
    expect(safetyPrecheck("delete the sale")).toMatchObject({ safety: "DESTRUCTIVE", blocked: true });
  });
});
