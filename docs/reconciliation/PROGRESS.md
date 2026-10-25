# V19 unified reconciliation — development status

Baseline: `v19/stage22-financial-workflow-completion-20261017` at `52668cc28687ef6ce1304a601e45413bac6d3093`, itself descended from GitHub `main` at `1d772d70163ce4b01d95f325321b64e651d17a81`.

The Master ZIP passed CRC validation. Its 994 source/documentation files were SHA-256 compared against all 37 branch heads. Twenty clean source merges and 193 Master-only files have been copied with provenance in `master-clean-merge.json`. Twenty overlapping files require manual resolution; none is marked accepted solely from a text merge. Master-only `candidate_modules` remain candidate code.

## Current verified changes

- Dexie v29/v30 declarations now include both historical lineages. v35 declares the merged indexes and append-only drawer journal without rewriting records. `TallybookDB.test.ts` includes a v30 local migration fixture and a v28 batch fixture. Focused suite: 6 passed, 0 failed.
- Company-isolation fixtures now unlock an owner and open a shift for checkout. The combined branch still has 9 failing cases out of 15, including genuine company-switch gaps and refund-policy setup mismatches. The failing run must be repaired before acceptance; authorization must remain enforced.
- The stage22 baseline had malformed JSX in `Run19DeviceAcceptancePage.tsx`; the local syntax error has been fixed. Semantic checking still fails on missing declarations and unresolved source integration, and is not a passing gate.

## Pending critical work

1. Resolve 20 conflicted paths in `master-clean-merge.json`, prioritizing company-switch guards, finance and recovery ledgers, and the Master’s local backup semantics. Preserve stage22’s verified per-company retry indexes and v31-v34 features.
2. Expand migration fixtures for GitHub v30 and v34 with historical rows, duplicate keys across companies, crash interruption, backup restore, and mixed Master/GitHub schema lineage.
3. Repair company-isolation failures by carrying over valid Master guards and updating policy-aware fixtures. Do not replace a failed test with a weaker assertion.
4. Complete semantic check, full Vitest, native QA, production build, browser automation, and dependency audit; retain logs.
5. Reassess all 12 stages against implementation evidence. Physical-device, cross-browser and real-world acceptance remain deferred. Production release remains NO-GO.

No deployment, live payment processing, or external service configuration has been performed.
