import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { gzipSync } from "node:zlib";
import { appCapabilities, parseApplicationRequest } from "../client/src/features/assistant/appKnowledge";
import { evaluationCases } from "../client/src/features/assistant/eval/cases";
import { parseCommand } from "../client/src/features/assistant/intentParser";
import { prepareText, replaceNumberWords, tokenize } from "../client/src/features/assistant/text";
import type { AssistantIntent, ParsedEntities } from "../client/src/features/assistant/types";

export type ModelIntent = AssistantIntent | "NAVIGATE" | "FEATURE_DISCOVERY" | "APP_HELP" | "APP_EXPLANATION";
interface Example { text: string; intent: ModelIntent; entities?: Partial<ParsedEntities>; source: "existing" | "app-alias" | "conversation" | "unseen"; }
interface ModelClass { intent: ModelIntent; centroid: Record<string, number>; count: number; }
interface ExportedModel { format: "tallybook-char-centroid-v1"; feature: "character-2-5-grams"; classes: ModelClass[]; vocabularySize: number; trainingExamples: number; }
interface Prediction { intent: ModelIntent | "UNKNOWN"; confidence: number; margin: number; scores: Array<{ intent: ModelIntent; score: number }>; }
interface ModelEntities { customerText?: string; productText?: string; supplierText?: string; amount?: string; quantity?: number; }

const modelIntents = new Set<ModelIntent>([...evaluationCases.map((item) => item.intent as ModelIntent), "NAVIGATE", "FEATURE_DISCOVERY", "APP_HELP", "APP_EXPLANATION"]);
const transactionIntents = new Set<ModelIntent>(["RECORD_SALE", "RECEIVE_STOCK", "RECORD_CUSTOMER_PAYMENT"]);

function rawNormalize(text: string): string {
  return replaceNumberWords(text.normalize("NFKC").toLowerCase().replace(/[’‘`´]/g, "'").replace(/[^\p{L}\p{N}\s$₵.,!?'-]+/gu, " ").replace(/\s+/g, " ").trim());
}
function features(text: string): string[] {
  const normalized = rawNormalize(text);
  const padded = `^${normalized.replace(/\s+/g, "_")}$`;
  const output = new Map<string, number>();
  const words = tokenize(normalized);
  for (const word of words) output.set(`w:${word}`, (output.get(`w:${word}`) ?? 0) + 1);
  for (let n = 2; n <= 5; n += 1) for (let index = 0; index <= padded.length - n; index += 1) {
    const gram = `c:${padded.slice(index, index + n)}`;
    output.set(gram, (output.get(gram) ?? 0) + 1);
  }
  return [...output.entries()].flatMap(([key, count]) => Array.from({ length: Math.min(count, 3) }, () => key));
}
function vector(text: string): Map<string, number> {
  const result = new Map<string, number>();
  for (const feature of features(text)) result.set(feature, (result.get(feature) ?? 0) + 1);
  const norm = Math.sqrt([...result.values()].reduce((sum, value) => sum + value * value, 0)) || 1;
  for (const [key, value] of result) result.set(key, value / norm);
  return result;
}
function cosine(left: Record<string, number>, right: Map<string, number>): number {
  let score = 0;
  for (const [key, value] of right) score += value * (left[key] ?? 0);
  return score;
}
function train(examples: Example[]): ExportedModel {
  const grouped = new Map<ModelIntent, Map<string, number>[]>();
  for (const example of examples) {
    const current = grouped.get(example.intent) ?? [];
    current.push(vector(example.text));
    grouped.set(example.intent, current);
  }
  const classes: ModelClass[] = [];
  const vocabulary = new Set<string>();
  for (const [intent, vectors] of grouped) {
    const sums = new Map<string, number>();
    for (const item of vectors) for (const [key, value] of item) { sums.set(key, (sums.get(key) ?? 0) + value); vocabulary.add(key); }
    const centroid: Record<string, number> = {};
    const norm = Math.sqrt([...sums.values()].reduce((sum, value) => sum + value * value, 0)) || 1;
    for (const [key, value] of sums) centroid[key] = value / norm;
    classes.push({ intent, centroid, count: vectors.length });
  }
  return { format: "tallybook-char-centroid-v1", feature: "character-2-5-grams", classes, vocabularySize: vocabulary.size, trainingExamples: examples.length };
}
function predict(model: ExportedModel, text: string): Prediction {
  const input = vector(text);
  const scores = model.classes.map((item) => ({ intent: item.intent, score: cosine(item.centroid, input) })).sort((a, b) => b.score - a.score);
  const top = scores[0];
  const second = scores[1]?.score ?? 0;
  const margin = (top?.score ?? 0) - second;
  const confidence = Math.max(0, Math.min(1, 0.5 + (top?.score ?? 0) * 0.45 + margin * 0.8));
  return { intent: top && top.score >= 0.18 ? top.intent : "UNKNOWN", confidence, margin, scores: scores.slice(0, 3) };
}

function cleanSpan(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/^[\s,'"“”]+|[\s,'"“”?.!]+$/g, "").replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}
function slotEntities(text: string): ModelEntities {
  const normalized = rawNormalize(text);
  const amount = /(?:₵|\$|\b(?:ghs|cedis?|naira|dollars?)\b\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/i.exec(normalized)?.[1]?.replace(/,/g, "");
  const quantityMatch = /\b(\d+)\s+(?:units?\s+of\s+|bags?\s+of\s+|crates?\s+of\s+|pieces?\s+of\s+)?([a-z][a-z -]*)/i.exec(normalized);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;
  const product = cleanSpan(quantityMatch?.[2]?.split(/\s+(?:to|from|on|with|cash|credit)\b/i)[0])
    ?? cleanSpan(/\b(?:how many|how much|what is|stock for|inventory of)\s+(?:units? of\s+)?([a-z][a-z -]*?)(?=\s+(?:do|does|are|is|left|available|on hand|remain|have|stock)\b|$)/i.exec(normalized)?.[1]);
  const cue = /\b(?:to|from|by|for)\s+([a-z][a-z -]*?)(?=\s+(?:cash|credit|paid|on|and|today|this|last|\d+\b)|$)/i.exec(normalized)?.[1];
  const paidName = /^([a-z][a-z -]+?)\s+(?:paid|repaid|settled|gave|owes|bought|took)\b/i.exec(normalized)?.[1];
  const balanceName = /\b(?:does|is)\s+([a-z][a-z -]+?)\s+(?:owe|owes|debt|balance|unpaid|outstanding)\b/i.exec(normalized)?.[1];
  const person = cleanSpan(cue ?? paidName ?? balanceName);
  const supplier = /\b(?:from|supplier)\s+([a-z][a-z -]*?)(?=\s+(?:and|for|today|last|\d+\b)|$)/i.exec(normalized)?.[1];
  return { amount, quantity, productText: product, customerText: person, supplierText: cleanSpan(supplier) };
}
function sameEntity(actual: ModelEntities, expected: Partial<ParsedEntities>): boolean {
  const fields: Array<keyof ParsedEntities> = ["customerText", "productText", "supplierText", "amount", "quantity"];
  return fields.filter((field) => expected[field] !== undefined).every((field) => String(actual[field] ?? "").toLowerCase() === String(expected[field]).toLowerCase());
}
function entityFieldAccuracy(actual: ModelEntities, expected: Partial<ParsedEntities>): number {
  const fields: Array<keyof ParsedEntities> = ["customerText", "productText", "supplierText", "amount", "quantity"];
  const required = fields.filter((field) => expected[field] !== undefined);
  return required.length ? required.filter((field) => String(actual[field] ?? "").toLowerCase() === String(expected[field]).toLowerCase()).length / required.length : 1;
}
function hash(text: string): number { let result = 2166136261; for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }

const appTraining: Example[] = [];
for (const capability of appCapabilities) {
  for (const alias of capability.aliases.slice(0, 5)) {
    appTraining.push({ text: `open ${alias}`, intent: "NAVIGATE", source: "app-alias" });
    appTraining.push({ text: `show me ${alias}`, intent: "FEATURE_DISCOVERY", source: "app-alias" });
    appTraining.push({ text: `how do I use ${alias}`, intent: "APP_HELP", source: "app-alias" });
  }
}
const conversationTraining: Example[] = [
  { text: "she paid 100 cash", intent: "RECORD_CUSTOMER_PAYMENT", source: "conversation" },
  { text: "how much does he owe", intent: "CUSTOMER_BALANCE", source: "conversation" },
  { text: "and last month", intent: "SALES_QUERY", source: "conversation" },
  { text: "what about Adwoa", intent: "CUSTOMER_BALANCE", source: "conversation" },
  { text: "how many of those are left", intent: "INVENTORY_QUERY", source: "conversation" },
];
const allExamples: Example[] = [
  ...evaluationCases.filter((item) => !item.known).map((item) => ({ text: item.text, intent: item.intent as ModelIntent, entities: item.expect, source: "existing" as const })),
  ...appTraining,
  ...conversationTraining,
];
const unseen: Example[] = [
  ["opin sto", "NAVIGATE"], ["opn stk", "NAVIGATE"], ["show stk", "FEATURE_DISCOVERY"], ["view sto", "NAVIGATE"], ["bring up inventory", "NAVIGATE"], ["what do I still have", "INVENTORY_QUERY"], ["wetin dey left", "INVENTORY_QUERY"], ["hw much rice remain", "INVENTORY_QUERY"], ["are sales up from last month", "INSIGHTS_QUERY"], ["which tins no dey move", "INSIGHTS_QUERY"], ["how much dey Kwame owe", "CUSTOMER_BALANCE"], ["wetin Kwame owe me", "CUSTOMER_BALANCE"], ["Kwame don pay me 100", "RECORD_CUSTOMER_PAYMENT"], ["give Kwame two eggs cash", "RECORD_SALE"], ["Kofi bring 8 eggs", "RECEIVE_STOCK"], ["suplier dey where", "NAVIGATE"], ["open custmr", "NAVIGATE"], ["show expence page", "NAVIGATE"], ["rpts", "FEATURE_DISCOVERY"], ["what can I do here", "HELP"], ["delete the last sale", "UNSUPPORTED_ACTION"], ["refund Kwame", "UNSUPPORTED_ACTION"], ["pay john 500", "RECORD_CUSTOMER_PAYMENT"], ["what is the weather", "UNKNOWN"], ["tell me a joke", "UNKNOWN"],
].map(([text, intent]) => ({ text, intent: intent as ModelIntent, source: "unseen" as const }));

function parserIntent(text: string): string {
  const app = parseApplicationRequest(text);
  if (app) return app.kind === "navigate" ? "NAVIGATE" : app.kind === "discover" ? "FEATURE_DISCOVERY" : app.kind === "help" ? "APP_HELP" : "APP_EXPLANATION";
  return parseCommand(text, { now: new Date("2026-10-08T00:00:00Z") }).intent;
}
function accuracy(rows: Array<{ expected: string; actual: string }>): number { return rows.length ? rows.filter((row) => row.expected === row.actual).length / rows.length : 0; }
function benchmark(model: ExportedModel, rows: Example[]) {
  const started = performance.now();
  const predictions = rows.map((example) => ({ example, prediction: predict(model, example.text), parser: parserIntent(example.text) }));
  const elapsed = performance.now() - started;
  const modelRows = predictions.map(({ example, prediction }) => ({ expected: example.intent, actual: prediction.intent }));
  const parserRows = predictions.map(({ example, parser }) => ({ expected: example.intent, actual: parser }));
  const entityRows = rows.filter((example) => example.entities && Object.keys(example.entities).length).map((example) => ({ expected: example.entities!, model: slotEntities(example.text), parser: parseCommand(example.text, { now: new Date("2026-10-08T00:00:00Z") }).entities }));
  return { predictions, modelAccuracy: accuracy(modelRows), parserAccuracy: accuracy(parserRows), entityAccuracy: entityRows.length ? entityRows.filter((row) => sameEntity(row.model, row.expected)).length / entityRows.length : null, parserEntityAccuracy: entityRows.length ? entityRows.filter((row) => sameEntity(row.parser, row.expected)).length / entityRows.length : null, modelEntityFieldAccuracy: entityRows.length ? entityRows.reduce((sum, row) => sum + entityFieldAccuracy(row.model, row.expected), 0) / entityRows.length : null, parserEntityFieldAccuracy: entityRows.length ? entityRows.reduce((sum, row) => sum + entityFieldAccuracy(row.parser, row.expected), 0) / entityRows.length : null, elapsedMs: elapsed, p95InferenceUs: 0, entityRows };
}
function safetyReport(model: ExportedModel) {
  const safetyCases = unseen.filter((example) => example.intent === "UNSUPPORTED_ACTION" || transactionIntents.has(example.intent));
  const rows = safetyCases.map((example) => { const prediction = predict(model, example.text); const rawWouldAutoAction = transactionIntents.has(prediction.intent) && prediction.confidence >= 0.9 && prediction.margin >= 0.08 && !/\b(?:delete|remove|cancel|refund|undo|clear|change|edit)\b/i.test(example.text); const gatedAutoAction = false; return { text: example.text, expected: example.intent, prediction: prediction.intent, confidence: prediction.confidence, margin: prediction.margin, rawWouldAutoAction, gatedAutoAction }; });
  return { rows, unsafeAutoActions: rows.filter((row) => row.gatedAutoAction && !transactionIntents.has(row.expected)).length, rawModelTransactionActions: rows.filter((row) => row.rawWouldAutoAction).length, gatedTransactionActions: rows.filter((row) => row.gatedAutoAction).length, allTransactionsDeferred: rows.every((row) => !row.gatedAutoAction) };
}
function measureInference(model: ExportedModel, rows: Example[]) {
  const inputs = rows.map((row) => row.text);
  for (const input of inputs) predict(model, input);
  const samples: number[] = [];
  for (let index = 0; index < 10000; index += 1) { const start = performance.now(); predict(model, inputs[index % inputs.length]); samples.push((performance.now() - start) * 1000); }
  samples.sort((a, b) => a - b);
  return { p50Us: samples[5000], p95Us: samples[9500], p99Us: samples[9900] };
}

const holdout = allExamples.filter((example) => hash(`${example.source}:${example.text}`) % 5 === 0);
const training = allExamples.filter((example) => !holdout.includes(example));
const model = train(training);
const inDomain = benchmark(model, holdout);
const unseenResult = benchmark(model, unseen);
const safety = safetyReport(model);
const latency = measureInference(model, unseen);
const serialized = JSON.stringify(model);
const memoryBefore = process.memoryUsage().heapUsed;
for (let index = 0; index < 1000; index += 1) predict(model, unseen[index % unseen.length].text);
const memoryAfter = process.memoryUsage().heapUsed;
const parserUnseenRows = unseen.map((example) => ({ expected: example.intent, actual: parserIntent(example.text) }));
const report = {
  generatedAt: new Date().toISOString(),
  architecture: "character 2–5 gram centroid classifier; deterministic constrained slot extractor; no external runtime",
  training: { totalExamples: allExamples.length, trainingExamples: training.length, heldOutExamples: holdout.length, classes: model.classes.length, vocabularySize: model.vocabularySize, sources: { existingCorpus: evaluationCases.filter((item) => !item.known).length, appAliases: appTraining.length, conversationExamples: conversationTraining.length } },
  modelSize: { jsonBytes: Buffer.byteLength(serialized), gzippedBytes: gzipSync(serialized).byteLength, note: "JSON is directly importable by the existing TypeScript/Vite stack; gzip is a deployment transport metric, not required at runtime." },
  memory: { heapDeltaBytes: Math.max(0, memoryAfter - memoryBefore), processRssBytes: process.memoryUsage().rss },
  latency: { ...latency, note: "Node 22 sandbox benchmark; browser/device results can differ." },
  inDomain: { modelAccuracy: inDomain.modelAccuracy, parserAccuracy: inDomain.parserAccuracy, modelElapsedMs: inDomain.elapsedMs, heldOutCount: holdout.length, entityAccuracy: inDomain.entityAccuracy, parserEntityAccuracy: inDomain.parserEntityAccuracy, modelEntityFieldAccuracy: inDomain.modelEntityFieldAccuracy, parserEntityFieldAccuracy: inDomain.parserEntityFieldAccuracy },
  unseen: { modelAccuracy: unseenResult.modelAccuracy, parserAccuracy: accuracy(parserUnseenRows), count: unseen.length, entityAccuracy: unseenResult.entityAccuracy, parserEntityAccuracy: unseenResult.parserEntityAccuracy, modelEntityFieldAccuracy: unseenResult.modelEntityFieldAccuracy, parserEntityFieldAccuracy: unseenResult.parserEntityFieldAccuracy, mistakes: unseenResult.predictions.filter(({ example, prediction }) => example.intent !== prediction.intent).map(({ example, prediction }) => ({ text: example.text, expected: example.intent, actual: prediction.intent, confidence: prediction.confidence })) },
  safety,
  conclusion: "The tiny model is viable as a read-only suggestion/fallback classifier, but the existing parser remains the safer production authority for entities, periods, ambiguity, and financial actions. Do not auto-execute model predictions; keep model output behind confidence, ambiguity, validation, and confirmation gates.",
};
await mkdir("artifacts/intent-model", { recursive: true });
await writeFile("artifacts/intent-model/tallybook-intent-model.json", `${serialized}\n`);
await writeFile("artifacts/intent-model/benchmark-report.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
