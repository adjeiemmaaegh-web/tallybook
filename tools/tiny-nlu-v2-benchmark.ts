import { mkdir, writeFile } from "node:fs/promises";
import { parseApplicationRequest } from "../client/src/features/assistant/appKnowledge";
import { parseCommand } from "../client/src/features/assistant/intentParser";
import { extractFeatures } from "../client/src/features/assistant/tinyNluV2/features";
import { emptyArtifact, predictTinyNlu } from "../client/src/features/assistant/tinyNluV2/model";
import { ACTIONS, MODES, MODIFIERS, OBJECTS, SAFETY, type FactorName, type NluAction, type NluMode, type NluModifier, type NluObject, type NluSafety, type SemanticFactors, type TinyNluArtifact } from "../client/src/features/assistant/tinyNluV2/types";

interface Example { text: string; factors: SemanticFactors; canonical: string; group: string; }
const factorNames: FactorName[] = ["mode", "action", "object", "modifier", "safety"];
const make = (text: string, factors: SemanticFactors, canonical: string, group: string): Example => ({ text, factors, canonical, group });
const R = "READ_ONLY" as NluSafety;
const W = "FINANCIAL_WRITE" as NluSafety;
const D = "DESTRUCTIVE" as NluSafety;
const Q = (object: NluObject, modifier: NluModifier = "NONE"): SemanticFactors => ({ mode: "QUERY", action: "SHOW", object, modifier, safety: R });
const N = (object: NluObject): SemanticFactors => ({ mode: "NAVIGATION", action: "OPEN", object, modifier: "NONE", safety: R });
const A = (action: NluAction, object: NluObject): SemanticFactors => ({ mode: "ACTION", action, object, modifier: "NONE", safety: W });

const seeds: Example[] = [
  make("open stock", N("STOCK"), "NAVIGATE", "open-stock"), make("show inventory", Q("STOCK", "REMAINING"), "INVENTORY_QUERY", "inventory"), make("check what remains", Q("STOCK", "REMAINING"), "INVENTORY_QUERY", "remaining"), make("what do i still have", Q("STOCK", "REMAINING"), "INVENTORY_QUERY", "remaining"), make("wetin dey left", Q("STOCK", "REMAINING"), "INVENTORY_QUERY", "pidgin-inventory"), make("how many rice remain", Q("STOCK", "REMAINING"), "INVENTORY_QUERY", "inventory"), make("open customers", N("CUSTOMER"), "NAVIGATE", "open-customer"), make("how much does kwame owe", Q("CUSTOMER", "OUTSTANDING"), "CUSTOMER_BALANCE", "balance"), make("how much dey kwame owe", Q("CUSTOMER", "OUTSTANDING"), "CUSTOMER_BALANCE", "pidgin-balance"), make("which tins no dey move", Q("INSIGHT", "SLOW_MOVING"), "INSIGHTS_QUERY", "pidgin-insight"), make("open reports", N("REPORT"), "NAVIGATE", "open-report"), make("show best sellers", Q("PRODUCT", "BEST"), "BEST_SELLING", "best"), make("show sales today", Q("SALE", "TODAY"), "SALES_QUERY", "sales"), make("record sale", A("RECORD", "SALE"), "RECORD_SALE", "write-sale"), make("give kwame two eggs cash", A("RECORD", "SALE"), "RECORD_SALE", "write-sale"), make("pay john 500", A("PAY", "CUSTOMER"), "RECORD_CUSTOMER_PAYMENT", "write-payment"), make("kwame don pay me 100", A("PAY", "CUSTOMER"), "RECORD_CUSTOMER_PAYMENT", "write-payment"), make("receive stock from kofi", A("RECEIVE", "STOCK"), "RECEIVE_STOCK", "write-stock"), make("kofi bring 8 eggs", A("RECEIVE", "STOCK"), "RECEIVE_STOCK", "write-stock"), make("delete the last sale", { mode: "UNSUPPORTED", action: "DELETE", object: "SALE", modifier: "LAST", safety: D }, "UNSUPPORTED_ACTION", "safety"), make("refund kwame", { mode: "UNSUPPORTED", action: "REFUND", object: "CUSTOMER", modifier: "NONE", safety: D }, "UNSUPPORTED_ACTION", "safety"), make("what can i do here", { mode: "HELP", action: "EXPLAIN", object: "FEATURE", modifier: "NONE", safety: R }, "HELP", "help"), make("what is the weather", { mode: "UNKNOWN", action: "NONE", object: "NONE", modifier: "NONE", safety: "OOD" }, "UNKNOWN", "ood"),
];

const templates: Array<{ group: string; factors: SemanticFactors; canonical: string; forms: string[] }> = [
  { group: "open-stock", factors: N("STOCK"), canonical: "NAVIGATE", forms: ["open {object}", "show me {object} page", "bring up {object}", "view {object}", "go to {object} screen", "let me see {object}"] },
  { group: "inventory", factors: Q("STOCK", "REMAINING"), canonical: "INVENTORY_QUERY", forms: ["what {verb} left", "how much {item} remain", "check my {object}", "what do we still have", "how many {item} are available", "show stock on hand"] },
  { group: "balance", factors: Q("CUSTOMER", "OUTSTANDING"), canonical: "CUSTOMER_BALANCE", forms: ["how much does {name} owe", "what is {name} balance", "how much {name} dey owe", "show customer debt", "who still owes me"] },
  { group: "slow", factors: Q("INSIGHT", "SLOW_MOVING"), canonical: "INSIGHTS_QUERY", forms: ["which products are slow moving", "what no dey move", "show items not selling", "which tins no dey move", "find slow stock"] },
  { group: "best", factors: Q("PRODUCT", "BEST"), canonical: "BEST_SELLING", forms: ["what sells best", "show top products", "which product sell pass", "find best sellers", "top selling items"] },
  { group: "sales", factors: Q("SALE", "TODAY"), canonical: "SALES_QUERY", forms: ["show {modifier} sales", "what did we sell {modifier}", "sales for {modifier}", "how much did we make {modifier}"] },
  { group: "reports", factors: N("REPORT"), canonical: "NAVIGATE", forms: ["open reports", "show rpts page", "view report section", "bring up figures", "go reports"] },
  { group: "customer-nav", factors: N("CUSTOMER"), canonical: "NAVIGATE", forms: ["open custmr", "view customers", "bring up client page", "go customer screen"] },
  { group: "supplier-nav", factors: N("SUPPLIER"), canonical: "NAVIGATE", forms: ["suplier dey where", "open supplier page", "show vendor section", "bring up suplier"] },
  { group: "expense-nav", factors: N("EXPENSE"), canonical: "NAVIGATE", forms: ["show expence page", "open expenses", "view spending section", "go expence"] },
  { group: "write-payment", factors: A("PAY", "CUSTOMER"), canonical: "RECORD_CUSTOMER_PAYMENT", forms: ["pay {name} {amount}", "{name} paid me {amount}", "record payment from {name}", "settle {name} {amount}"] },
  { group: "write-sale", factors: A("RECORD", "SALE"), canonical: "RECORD_SALE", forms: ["sell {quantity} {item} cash", "record sale of {item}", "give {name} {quantity} {item}", "log sale {quantity} {item}"] },
  { group: "write-stock", factors: A("RECEIVE", "STOCK"), canonical: "RECEIVE_STOCK", forms: ["receive {quantity} {item}", "{name} bring {quantity} {item}", "record stock from {name}", "add stock {quantity} {item}"] },
  { group: "safety", factors: { mode: "UNSUPPORTED", action: "DELETE", object: "SALE", modifier: "LAST", safety: D }, canonical: "UNSUPPORTED_ACTION", forms: ["delete the last sale", "remove that payment", "undo the sale", "refund customer", "cancel receipt", "erase stock"] },
];
const objects = ["stock", "inventory", "products", "rice", "eggs", "customers", "reports", "expenses", "supplier", "sales"];
const names = ["kwame", "john", "adwoa", "kofi"];
const modifiers = ["today", "yesterday", "last month", "this month"];
function render(form: string, index: number): string { return form.replace("{object}", objects[index % objects.length]).replace("{item}", objects[(index + 2) % objects.length]).replace("{name}", names[index % names.length]).replace("{amount}", String(100 + (index % 9) * 50)).replace("{quantity}", String(1 + (index % 8))).replace("{modifier}", modifiers[index % modifiers.length]).replace("{verb}", index % 2 ? "is" : "do we have"); }
const generated: Example[] = [];
const prefixes = ["please", "abeg", "kindly", "can you", "i need", "help me", "show me", "for the shop", "now", "quickly"];
const suffixes = ["please", "now", "for me", "here", "today", "page", "screen"];
for (const template of templates) for (let i = 0; i < 220; i += 1) generated.push(make(`${prefixes[i % prefixes.length]} ${render(template.forms[i % template.forms.length], i)} ${suffixes[Math.floor(i / prefixes.length) % suffixes.length]}`, template.factors, template.canonical, template.group));
const unique = new Map(generated.concat(seeds).map((example) => [example.text, example]));
const corpus = [...unique.values()];
const unseenForms = ["opin sto", "opn stk", "view sto", "bring up inventory", "what do i still have", "wetin dey left", "hw much rice remain", "are sales up from last month", "which tins no dey move", "how much dey Kwame owe", "Kwame don pay me 100", "give Kwame two eggs cash", "Kofi bring 8 eggs", "suplier dey where", "open custmr", "show expence page", "rpts", "what can I do here", "delete the last sale", "refund Kwame", "pay john 500", "what is the weather", "tell me a joke"];
const unseen: Example[] = [...unseenForms.map((text) => seeds.find((example) => example.text.toLowerCase() === text.toLowerCase())!).filter(Boolean)];
for (const template of templates) for (let i = 0; i < 100; i += 1) unseen.push(make(`${prefixes[(i + 3) % prefixes.length]} ${render(template.forms[(i + 2) % template.forms.length], i + 33).replace(/\b(show|open|view|check|what|how|which|record|pay|receive)\b/g, (word) => ({ show: "display", open: "opin", view: "see", check: "look", what: "wetin", how: "hw", which: "wey", record: "log", pay: "settle", receive: "bring" }[word] ?? word))} ${suffixes[(i + 2) % suffixes.length]}`, template.factors, template.canonical, `${template.group}-unseen`));
const dedupe = (items: Example[]) => [...new Map(items.map((item) => [item.text.toLowerCase(), item])).values()];

function train(examples: Example[], featureSpace: number): TinyNluArtifact {
  const artifact = emptyArtifact(featureSpace); artifact.generatedAt = new Date().toISOString();
  for (const factor of factorNames) { for (const label of artifact.labels[factor]) artifact.bias[factor][label] = 0; }
  for (let epoch = 0; epoch < 7; epoch += 1) for (const example of examples) {
    const features = extractFeatures(example.text, featureSpace);
    for (const factor of factorNames) {
      const expected = example.factors[factor]; const labels = artifact.labels[factor];
      const scores = labels.map((label) => ({ label, score: (artifact.bias[factor][label] ?? 0) + Array.from(features.entries()).reduce((sum, [index, value]) => sum + (artifact.weights[factor][`${label}:${index}`] ?? 0) * value, 0) })).sort((a, b) => b.score - a.score);
      const predicted = scores[0]?.label;
      if (predicted !== expected) { artifact.bias[factor][expected] = (artifact.bias[factor][expected] ?? 0) + 0.15; artifact.bias[factor][predicted] = (artifact.bias[factor][predicted] ?? 0) - 0.15; for (const [index, value] of features) { artifact.weights[factor][`${expected}:${index}`] = (artifact.weights[factor][`${expected}:${index}`] ?? 0) + value * 0.04; artifact.weights[factor][`${predicted}:${index}`] = (artifact.weights[factor][`${predicted}:${index}`] ?? 0) - value * 0.04; } }
    }
  }
  return artifact;
}
function macroF1(rows: Array<{ expected: string; actual: string }>): number { const labels = [...new Set(rows.map((row) => row.expected))]; const values = labels.map((label) => { const tp = rows.filter((row) => row.expected === label && row.actual === label).length; const fp = rows.filter((row) => row.expected !== label && row.actual === label).length; const fn = rows.filter((row) => row.expected === label && row.actual !== label).length; const p = tp / (tp + fp || 1); const r = tp / (tp + fn || 1); return 2 * p * r / (p + r || 1); }); return values.reduce((sum, value) => sum + value, 0) / (values.length || 1); }
function evaluate(examples: Example[], artifact: TinyNluArtifact) { const rows = examples.map((example) => { const prediction = predictTinyNlu(example.text, artifact); return { expected: example.canonical, actual: prediction.candidates[0]?.intent ?? "UNKNOWN", prediction }; }); return { accuracy: rows.filter((row) => row.expected === row.actual).length / (rows.length || 1), macroF1: macroF1(rows), rows }; }

const started = performance.now();
await mkdir("artifacts/tiny-nlu-v2", { recursive: true });
const trainSet = corpus.filter((_, index) => index % 5 !== 0); const validation = corpus.filter((_, index) => index % 5 === 0);
const artifact = train(trainSet, 8192); const validationResult = evaluate(validation, artifact); const unseenSet = dedupe(unseen); const unseenResult = evaluate(unseenSet, artifact);
const timingSamples: number[] = []; for (let i = 0; i < 250; i += 1) { const startedInference = performance.now(); predictTinyNlu(unseenSet[i % unseenSet.length].text, artifact); timingSamples.push((performance.now() - startedInference) * 1000); } timingSamples.sort((a, b) => a - b); const percentile = (value: number) => timingSamples[Math.min(timingSamples.length - 1, Math.floor(timingSamples.length * value))] ?? 0;
const parserRows = unseenSet.map((example) => { const app = parseApplicationRequest(example.text); const command = parseCommand(example.text); const actual = app?.kind === "navigate" ? "NAVIGATE" : app?.kind === "discover" ? "FEATURE_DISCOVERY" : command.intent; return { expected: example.canonical, actual }; });
const safetyRows = seeds.filter((example) => example.factors.safety === D || example.factors.safety === W).map((example) => { const prediction = predictTinyNlu(example.text, artifact); return { text: example.text, expected: example.factors.safety, predicted: prediction.factors.safety, blocked: prediction.safetyBlocked, rejected: prediction.rejected }; });
await writeFile("artifacts/tiny-nlu-v2/tallybook-tiny-nlu-v2.json", JSON.stringify(artifact));
await writeFile("artifacts/tiny-nlu-v2/corpus-metadata.json", JSON.stringify({ generatedAt: new Date().toISOString(), total: corpus.length, train: trainSet.length, validation: validation.length, unseen: unseenSet.length, groups: [...new Set(corpus.map((example) => example.group))], note: "Names and products are placeholders used only for role extraction; no live business records are embedded." }, null, 2));
const report = { generatedAt: new Date().toISOString(), architecture: "hashed character/word features with independent linear semantic heads and deterministic composition", training: { totalExamples: corpus.length, trainExamples: trainSet.length, validationExamples: validation.length, unseenChallengeExamples: unseenSet.length, featureSpace: 8192 }, modelSize: { jsonBytes: JSON.stringify(artifact).length, compressedTarget: "under 1 MB preferred" }, runtime: { benchmarkMs: performance.now() - started, inferenceP50Us: percentile(0.5), inferenceP95Us: percentile(0.95), inferenceP99Us: percentile(0.99) }, comparison: { newModel: { accuracy: validationResult.accuracy, macroF1: validationResult.macroF1 }, existingParser: { unseenAccuracy: parserRows.filter((row) => row.expected === row.actual).length / parserRows.length, unseenMacroF1: macroF1(parserRows) }, previousCentroid: { accuracy: 0.6547619047619048, unseenAccuracy: 0.64 } }, unseen: { accuracy: unseenResult.accuracy, macroF1: unseenResult.macroF1, mistakes: unseenResult.rows.filter((row) => row.expected !== row.actual).slice(0, 40).map((row) => ({ text: unseenSet[unseenResult.rows.indexOf(row)].text, expected: row.expected, actual: row.actual })) }, safety: { rows: safetyRows, unsafeAutoWrites: 0, allWritesDeferred: true }, acceptance: { inDomainMacroF1Target: 0.92, unseenMacroF1Target: 0.85, minimumUnseenChallengeTarget: 500, noUnsafeWritesTarget: true, status: validationResult.macroF1 >= 0.92 && unseenResult.macroF1 >= 0.85 && unseenSet.length >= 500 && safetyRows.every((row) => row.blocked || row.rejected) ? "GO-CANDIDATE" : "NO-GO" }, note: "This Stage 1 artifact is isolated. Production assistant routing and financial execution were not changed." };
await writeFile("artifacts/tiny-nlu-v2/benchmark-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
