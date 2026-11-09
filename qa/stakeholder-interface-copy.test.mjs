import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");

test("regular Reports navigation uses business-facing financial wording", () => {
  const reports = source("../client/src/pages/ReportsPage.tsx");
  assert.match(
    reports,
    /<Link href="\\/financial-intelligence" className="quiet-action">Financial intelligence<\\/Link>/,
  );
  assert.doesNotMatch(
    reports,
    /Financial intelligence\\s*\\((?:V\\d+|Stage\\s+\\d+|Phase\\s+\\d+)\\)/i,
  );
});

test("owner device and release QA routes stay behind explicit internal-tools opt-in", () => {
  const app = source("../client/src/App.tsx");
  const internalTools = source("../client/src/lib/internalTools.ts");
  assert.match(app, /\\{internalToolsEnabled\\s*\\?\\s*<Route path="\\/device-uat"/);
  assert.match(app, /\\{internalToolsEnabled\\s*\\?\\s*<Route path="\\/release-operations"/);
  assert.match(internalTools, /VITE_TALLYBOOK_INTERNAL_TOOLS\\s*===\\s*"true"/);
});
