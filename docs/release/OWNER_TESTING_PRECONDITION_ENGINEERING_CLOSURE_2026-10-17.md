# Tallybook V19 — Owner-Testing Precondition / Developer-Side Engineering Closure Review

**Reviewed:** 2026-10-17  
**Source branch:** `v19/run20-operations-release-development-20261017`  
**Reviewed post-correction commit:** `4fd249c3cb0e232ce576fb6997b4aa8e70fbc8eb`  
**Classification:** PARTIAL SOURCE INSPECTION AND REPAIR. **NOT A FULL REPOSITORY AUDIT, NOT SEMANTIC TYPECHECKED, NOT EXECUTED OR ACCEPTED.**  
**Release:** NO-GO / INCOMPLETE.

## Owner handoff principle

The product owner should not be expected to debug our code during real-device UAT. Engineering needs to finish internal integrations, source review, automated QA and defect remediation before requesting the owner's costly Windows/Android, printer, scanner, shop-floor and financial acceptance tests. Previous instruction explicitly deferred tests/builds/CI, so none was executed by this review. Source work described as “20/20” referred to **planned increment authoring**, not complete and verified engineering readiness.

## Concrete developer-side defects found and patched during this review

| Finding | Source repair | Source inspection outcome | Executed proof |
| --- | --- | --- | --- |
| LEGACY-CURRENCY-ANALYTICS | `client/src/features/insights/run17Evidence.mjs`, `.d.mts`, `Run17EvidencePanel.tsx`, `run17Csv.mjs`: optional currency missing on legitimate historic `Sale` records previously caused entire Run 17 report to throw. Now such records are explicitly excluded from currency-bound numbers and observed unit totals, with separate coverage count, UI warning and CSV disclosure. Explicit conflicting currency still fails closed. | Edited and committed | NOT RUN |
| BACKUP-REAL-SIZE-CAP | `client/src/features/backup/run18ImportAdmission.mjs`: after reading a file, independently check its actual UTF-8 byte count against the same device-memory admission budget, not just the global 96 MiB maximum. Preserve no-truncation and no-destructive-restore behavior. | Edited and committed | NOT RUN |
| COMMERCE-INVALID-CANCEL-UI | `client/src/pages/CommercePage.tsx`: the legacy draft-cancellation button previously appeared even on reserved, dispatched and delivered orders, where draft transition must reject. It now appears only in draft, prepared and ready states. Specialized cancellation and return-review paths remain separate. | Edited and committed | NOT RUN |

**Do not count any item above as a PASS** until the exact corrected source executes through semantic TypeScript, matching fixture tests, browser integration, migrations and affected financial/backup recovery paths.

## Confirmed engineering-stage blockers before owner testing

| Area | Observed source state | Developer action before requesting merchant UAT |
| --- | --- | --- |
| Full code integration | Runs 13–20 were edited incrementally and no semantic TypeScript check or final production build was executed. | Run full pinned Node/pnpm semantic types, native/client tests, browser checks and build on final combined SHA; repair ALL compile/import/runtime errors. |
| Multi-store availability | `STAGE9_RELEASE_SCOPE.authoritativeStoreStock=false`, `executeStoreTransfer=false`. Source components exist but capability is deliberately blocked pending full integration/acceptance. | Decide release-safe supported feature set; finish and verify any capability promised for launch, retain disabled controls for truly deferred functionality. |
| Public commerce and stock reservation | `COMMERCE_RELEASE_SCOPE.publicStorefront=false`, `reserveStock=false`, `fulfillOrders=false`, `onlinePayments=false`. The public server boundary is not mounted. | Do not advertise a working online storefront. Finish server/tenant security and financial/stock flow only under explicit scoped approval; or release clearly local-only features. |
| Assistant/analytics | `RUN17_REVIEW_WRITES_ENABLED=false`, automatic actions disabled. Run 17 read-only evidence depends on correct historic source contract. | Re-run regression for missing currency, legacy money, stock, return, transfer and all company-scope/currency cases, then decide safe surface. |
| Integrity dashboard coverage | Run 20 diagnostics calls an older `auditLocalIntegrity` whose table list lacks later `storeStockModes`, `storeStockEntries`, `commerceHolds`, `commerceDeliveryEvents` and `run17ReviewEvents`. | Extend exhaustive read-only integrity coverage of later source tables or warn explicitly that dashboard status is only a partial legacy audit. No “all records healthy” claim. |
| Backup/recovery | v33 backups include recent record types, but the new backup byte admission/UI and restoring real historical documents have not been executed on a browser. | Verify backup input limits, corrupted/damaged payload, multi-tab restore locks, source preservation and version migration on disposable profiles. |
| Encrypted remote sync | Run 14 remote client/tenant boundary not production activated; timeout handling and sync state remain unexecuted. | Verify only after independent tenant/RLS protections and QA approval, else explicitly defer remote device convergence. |
| Payments | Run 15 real provider activation is disabled; sandbox contracts do not represent actual bank settlement. | No live charges. Owner/provider authorization and real settlement reconciliation are separate future release gates. |
| Security & hardware | Security threat model is source-only; Run 19 28 device cases are all NOT RUN. | Complete software/security checks first; only then request the owner's physical device and merchant UAT. |
| Historical issues | 82 acceptance units and 47-issue register are not dispositioned on this final source. | Reconcile every ID to exact SHA, actual test or documented deferral and explicit release applicability. |

## Required developer deliverable before owner manual QA

The next engineering package must contain: (a) one verified exact source commit and dependency lockfile, (b) all TypeScript/build/native/client results with machine/Node versions, (c) browser integration and migration/backup recovery logs on disposable data, (d) a corrected consolidated blocker register with no undefined states, (e) clear *working vs disabled* feature inventory, and (f) reproduction/fix/regression evidence for any source defects. Critical financial or identity bugs must never be waved through as owner-testing problems.

No external staging, production, cloud financial sync, public commerce, live payment, merchant data modification or merge to main is authorized by this document. **Owner physical testing should wait until these internal engineering conditions are satisfied, unless the owner explicitly chooses an earlier exploratory check.**

**Current internal engineering handoff:** NOT READY FOR OWNER FINAL TESTING.  
**Product release:** NO-GO.
