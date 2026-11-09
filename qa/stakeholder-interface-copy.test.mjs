import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("regular Reports navigation uses business-facing financial wording", () => {
  const reports = source("../client/src/pages/ReportsPage.tsx");
  assert.ok(reports.includes('<Link href="/financial-intelligence" className="quiet-action">Financial intelligence</Link>'));
  assert.ok(!reports.includes("Financial intelligence (V10)"));
});

test("owner device and release QA routes stay behind explicit internal-tools opt-in", () => {
  const app = source("../client/src/App.tsx");
  const internalTools = source("../client/src/lib/internalTools.ts");
  assert.ok(app.includes('{internalToolsEnabled ? <Route path="/device-uat"'));
  assert.ok(app.includes('{internalToolsEnabled ? <Route path="/release-operations"'));
  assert.ok(internalTools.includes('VITE_TALLYBOOK_INTERNAL_TOOLS === "true"'));
});
