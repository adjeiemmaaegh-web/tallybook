# V19 unified reconciliation — development status

Baseline: `v19/stage22-financial-workflow-completion-20261017` at `52668cc28687ef6ce1304a601e45413bac6d3093`, itself descended from GitHub `main` at `1d772d70163ce4b01d95f325321b64e651d17a81`.

The Master ZIP passed CRC validation. Its 994 source/documentation files were SHA-256 compared against all 37 branch heads. Twenty clean source merges and 193 Master-only files have been copied with provenance in `master-clean-merge.json`. Twenty overlapping files require manual resolution; none is marked accepted solely from a text merge. Master-only `candidate_modules` remain candidate code.

## Current verified changes

- Dexie v29/v30 declarations now include both historical lineages. v35 declares the merged indexes and append-only drawer journal without rewriting records. `TallybookDB.test.ts` includes a v30 local migration fixture and a v28 batch fixture. Focused suite: 6 passed, 0 failed.
- Company-isolation fixtures unlock an owner and open a shift for checkout. The 15-case focused company-isolation suite now passes; broader security acceptance remains open.
- The stage22 baseline had malformed JSX in `Run19DeviceAcceptancePage.tsx`; the syntax error was fixed. TypeScript semantic checking passes on the current tree.

## Pending critical work

1. Resolve 20 conflicted paths in `master-clean-merge.json`, prioritizing company-switch guards, finance and recovery ledgers, and the Master’s local backup semantics. Preserve stage22’s verified per-company retry indexes and v31-v34 features.
2. Expand migration fixtures for GitHub v30 and v34 with historical rows, duplicate keys across companies, crash interruption, backup restore, and mixed Master/GitHub schema lineage.
3. Repair company-isolation failures by carrying over valid Master guards and updating policy-aware fixtures. Do not replace a failed test with a weaker assertion.
4. Complete semantic check, full Vitest, native QA, production build, browser automation, and dependency audit; retain logs.
5. Reassess all 12 stages against implementation evidence. Physical-device, cross-browser and real-world acceptance remain deferred. Production release remains NO-GO.

No deployment, live payment processing, or external service configuration has been performed.

## 2026-10-25 continuation increment

- Branch `development/v19-unified-reconciliation` created from verified stage22 commit and pushed. GitHub main and existing branches were not changed.
- The v35 schema now joins the Master v29/v30 lineage with GitHub v29–v34. Migration fixtures preserve v28 batch data, Master-style v30 no-sale and batch records, and GitHub-style v34 sale and wallet records. Combined focused migration and company-isolation run: 22/22 passing.
- Five originally failing Master company-isolation tests have been repaired without relaxing staff authorization; the combined suite now passes 15/15. Additional post-write company guards were added in sale, reversal, policy, catalogue and stock-count services.
- TypeScript semantic check, client Vite build, and server esbuild bundle pass. Production dependency audit now reports zero advisories after Zod/fast-uri updates and a scoped body-parser override.
- Full Vitest was attempted twice but did not complete; the stable-source run was stopped after approximately 39 of 124 files with multiple legacy fixture failures. Native Node verification reported 766 passing and 61 failing out of 828 tests on Windows; native QA alone reported 421 passing and 18 failing out of 439. These are not passing gates and the failures need triage. Release browser automation passed 3/3 scenarios. Offline browser automation failed 3/3 scenarios: its direct IndexedDB fixture has no verified staff session after reload, so checkout does not produce a receipt. Staff authorization remains enforced; the fixture and end-to-end flow need repair. Twenty Master/GitHub paths still need semantic conflict resolution, including backup, credit, purchases, supplier payables, finance reports, stores and UI. The release decision remains NO-GO.
