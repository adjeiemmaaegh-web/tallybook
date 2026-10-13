import { describe, expect, it } from "vitest";
import { parseCommand } from "../intentParser";
import { BASELINE_MIN_ACCURACY, evaluationCases, transactionIntents } from "./cases";

const NOW = new Date(2026, 9, 15, 12, 0, 0);

function entitiesMatch(actual: Record<string, unknown>, expected: Record<string, unknown> | undefined): boolean {
  return !expected || Object.entries(expected).every(([key, value]) => actual[key] === value);
}

describe("assistant parser evaluation harness", () => {
  it("reports a deterministic baseline and has no dangerous transaction classifications", () => {
    const results = evaluationCases.map((testCase) => ({ testCase, actual: parseCommand(testCase.text, { now: NOW }) }));
    const known = results.filter(({ testCase }) => testCase.known);
    const counted = results.filter(({ testCase }) => !testCase.known);
    const correct = counted.filter(({ testCase, actual }) => actual.intent === testCase.intent && entitiesMatch(actual.entities, testCase.expect));
    const incorrect = counted.filter(({ testCase, actual }) => actual.intent !== testCase.intent || !entitiesMatch(actual.entities, testCase.expect));
    const dangerous = results.filter(({ testCase, actual }) => testCase.intent === "UNKNOWN" && transactionIntents.has(actual.intent) && actual.confidence >= 0.75);
    const accuracy = correct.length / counted.length;
    const entityCases = counted.filter(({ testCase }) => testCase.expect);
    const entityCorrect = entityCases.filter(({ testCase, actual }) => entitiesMatch(actual.entities, testCase.expect));
    const entityAccuracy = entityCases.length ? entityCorrect.length / entityCases.length : 1;

    console.table(incorrect.map(({ testCase, actual }) => ({ input: testCase.text, expected: testCase.intent, actual: actual.intent, confidence: actual.confidence })));
    console.info(["Evaluation Summary", "------------------", `Total cases: ${results.length}`, `Counted cases: ${counted.length}`, `Known gaps: ${known.length}`, `Correct: ${correct.length}`, `Incorrect: ${incorrect.length}`, `Accuracy: ${(accuracy * 100).toFixed(2)}%`, `Entity cases: ${entityCases.length}`, `Entity correct: ${entityCorrect.length}`, `Entity accuracy: ${(entityAccuracy * 100).toFixed(2)}%`, `Dangerous classifications: ${dangerous.length}`].join("\n"));

    expect(dangerous, "Dangerous transaction classifications must never be accepted").toEqual([]);
    expect(accuracy, `Parser baseline regressed: ${(accuracy * 100).toFixed(2)}% < ${(BASELINE_MIN_ACCURACY * 100).toFixed(2)}%`).toBeGreaterThanOrEqual(BASELINE_MIN_ACCURACY);
    expect(entityAccuracy, "Entity extraction baseline regressed").toBeGreaterThanOrEqual(BASELINE_MIN_ACCURACY);
  });
});
