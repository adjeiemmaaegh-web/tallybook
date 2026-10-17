# Tallybook V19 — Developer Engineering Closure Continuation

**Date:** 2026-10-17  
**Source branch:** `v19/run20-operations-release-development-20261017`  
**Source HEAD prior to this report:** `06fefd50d5718cbe2a5b37fa0fa814af1086d256`  
**Purpose:** correct source integration defects before requiring the owner to conduct physical Windows/Android/shop-floor tests.

## Source corrections committed

1. **RUN17-LEGACY-CURRENCY:** `run17Evidence.mjs` now treats historical sales with no recorded currency as numerically unverified, excludes their amounts and unit volumes instead of guessing or crashing the whole report, and carries the coverage count to `run17Evidence.d.mts`, `Run17EvidencePanel.tsx`, and `run17Csv.mjs`. Wrong explicit currency remains a hard error.
2. **RUN18-BACKUP-ADMISSION:** `run18ImportAdmission.mjs` now checks actual post-read UTF-8 bytes against the same browser-memory admission bound used before reading, rather than comparing file contents only against the generic 96 MiB global maximum. No partial import or truncation is permitted.
3. **RUN16-COMMERCE-UI:** `CommercePage.tsx` hides ordinary draft-cancellation actions for reserved, packed, dispatched, delivered, return-requested and cancelled records; only valid draft/prepared/ready local planning states display the button.
4. **RUN20-OLDER-AUDIT-DISCLOSURE:** `run20LocalDiagnostics.ts` and `Run20OperationsPage.tsx` explicitly distinguish the legacy integrity audit from recent Run 13–17 tables. A clear legacy audit must never be represented as a complete statement.
5. **RUN20-CROSS-RUN-AUDIT:** New `run20CrossRunAudit.ts` reads the company-scoped, owner-authorized saved products, inventory movements, store stock modes/journal, transfers, commerce orders/holds/delivery events, saved sales, staff and advisory reviews in a single read-only IndexedDB snapshot under the recovery guard. It reuses existing strict Run 13 stock, Run 16 commerce and Run 17 review validators and separately checks order/sale reciprocal links and review author identities. Each issue is surfaced as ATTENTION rather than silenced or repaired automatically. Source relationships are not bank, device or physical inventory truth.
6. **RUN20-OPERATIONS-UI:** Added explicit cross-run structural counts and per-check findings to the existing owner operations screen alongside the older integrity results.
7. **RUN20-AUDIT-QA-SOURCE:** Authored `run20CrossRunAudit.test.ts` with client IndexedDB regressions for clean structural snapshots, orphan order/sale links and revoked owner access. This source file does NOT constitute an executed test.
8. **SOURCE IMPORT REVIEW:** Checked imports in seven edited core files against the connected GitHub branch source tree at an earlier checkpoint: 36 local/relative import statements, zero missing resolved source paths. This was a static path review, not semantic TypeScript or a runtime build.

## Remaining developer obligations — NOT passed

- **Exact-HEAD semantic TypeScript, production build, native/client/IndexedDB integration tests and real Chromium/Edge offline browser tests:** not executed inside the assistant container because the connected repository is not mounted; the runtime's `git ls-remote` could not resolve GitHub and the required pinned Node/pnpm dependencies are not available as a checked-out workspace.
- **CI attempt made, but blocked:** On commit `cb204d3ac8d59e9ca5834074910be271446c73f9` the existing [Release validation workflow](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/39000398606) actually triggered (GitHub run `39000398606`). GitHub reports `completed / failure`, with one `validate` job `117301906044`, an **empty executed-step summary**, **no workflow artifacts**, and job log retrieval returned a `BlobNotFound` 404. This DOES NOT establish any failing or passing client, native, TypeScript, build or browser assertion; the cause of this runner-level failure is not visible from the available evidence. Do not mark tests executed or QA accepted.
- **Focused new regression source:** `qa/run17-legacy-currency-coverage.test.mjs` and `qa/run18-import-memory-boundary.test.mjs` were added for the two confirmed fixes. `client/src/features/release/run20CrossRunAudit.test.ts` is the new client IndexedDB suite. All remain **UNEXECUTED** until the workflow can run successfully on the corrected exact SHA.
- **Release-scope design:** Run 13 authoritative store-stock and transfers, Run 16 public-commerce reservations/fulfillment, Run 14 cloud sync and Run 15 live provider payments remain intentionally disabled by source capability gates. Do not represent them as enabled features without full integration, safeguards, independent acceptance and separate deployment/provider authorization.
- **Financial conservation, historical 82 acceptance units / 47 blocker dispositions, migration/restore, staff/RLS, security/backup and hardware acceptance** all still need exact-source runnable evidence. Source audit is not a substitute for those gates.

## Owner-testing boundary

**Engineering handoff:** NOT YET READY FOR FINAL OWNER HARDWARE/UAT. Developer CI must be made runnable and source errors/failures corrected first. Owner must not have to discover source-level integration failures on live hardware. Use disposable/sample databases only for future QA. No staging, live payments, public publication, cloud financial transport, main-branch merge or production deployment is approved.

**Commercial release:** NO-GO / INCOMPLETE.
