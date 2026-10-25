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

## 2026-10-25 offline browser investigation after `018b951`

The browser fixture now creates an owner, unlocks with its PIN and opens a shift after the offline reload. It navigates within the live application to preserve the memory-only verified session. The next failure is stock availability: the POS option stays at `Rice · 0 available`, while a direct IndexedDB read shows `qa-rice.stockQuantity = 3` and the `commerceHolds.businessProfileId` index exists. The test now waits for `Rice · 3 available` before adding to the cart, so it fails at the actual stock gate. Whether the POS reservation query is failing or stock mode is being loaded incorrectly remains to be diagnosed. No authorization or stock guard was relaxed. This attempt is not a passing browser gate.

## 2026-10-25 offline checkout correction

The stock calculation was the cause: an empty reservation map treated every missing product entry as if its entire stock were reserved. `SalesPage.tsx` now treats a loaded map's missing entry as zero reserved units, while a map that has not loaded still blocks sales. The browser fixture unlocks the owner again after the final reload, preserving the memory-only session rule. The production build, TypeScript check, focused company-isolation/migration suite (22/22), and all three offline PWA browser scenarios pass. The browser scenarios verify receipt, payment, tax, stock decrement and cost events after offline reload. Full Vitest, native QA, semantic conflict resolution and physical-device acceptance remain open; release remains NO-GO.

## 2026-10-25 financial fixture and batch receipt increment

The complete Vitest run after the initial assistant fixture repair reported 845 passing, 123 failing, 124 files (29 failed), and did not constitute a passing gate. It was followed by targeted fixes: assistant fixtures now create a verified owner and shift; the primary assistant suite reached 69/70, then its company-switch case was updated and passed on a targeted rerun. Credit tests pass 18/18, sales tests 16/16, and return-policy tests 13/13. Run10/Run12 report fixtures were repaired; their combined focused run reached 27/28, and the remaining case was updated to assert the v34 unique repayment index rejects a duplicate at insertion. A fresh full run is still required.

The Master batch receiving implementation is now merged into the stage22 purchase transaction and purchase UI. It preserves company and currency checks, cross-tab lock, store stock postings and supplier finance rules. Purchase and company-isolation suites pass 25/25, TypeScript checking passes, and the production build succeeds. The cost-ledger suite still has five failures involving older financial output expectations, company-switch authorization, and tracked-batch workflow assumptions. These require case-by-case reconciliation. Physical-device and complete regression gates remain open. Release remains NO-GO.

## 2026-10-25 financial, recovery, and fixture continuation

The complete Vitest run after the batch merge reported 930 passing and 66 failing across 996 tests. Targeted repair of legacy fixtures now provides a real owner and shift for backup, credit, reports, tax, customer, stock, return, and recovery flows. The Run9 cost reconciliation suite passes 12/12, offline reliability and retail write coordination pass 4/4, and the cost-ledger plus backup suites pass 27/27. These focused results do not establish a complete green regression gate.

The backup parser now verifies that every purchase receipt-linked batch points to the matching immutable cost receipt for the same batch, product, company, and starting quantity. Manual legacy batches without a cost event remain importable. A targeted test tampers with that link and confirms rejection. Settled zero supplier balances are excluded from outstanding-by-currency results; supplier payable and Run12 focused suites passed 22/22 before the latest backup change.

The old `auth.test.tsx` suite assumes every local route needs a cloud session; current offline-first behavior intentionally gates only the cloud route, as covered by `AuthGate.test.tsx`. This obsolete suite still requires explicit reconciliation. Two attempts to rerun full Vitest in the sandbox produced worker startup failures with zero tests in affected files. An unrestricted rerun also stalled after the old auth suite and was stopped; see `evidence/full-vitest-current-stalled.txt`. TypeScript checking passes, and Vite built the client, but the combined build command did not return a final status after the client output and was stopped. Neither is recorded as a passing complete gate. Release remains NO-GO; no production acceptance is claimed.
