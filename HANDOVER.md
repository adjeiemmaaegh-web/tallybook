# HANDOVER.md — Tallybook V19 / Alchemy

**Date:** 2026-10-23  
**Incoming lead engineer:** Claude  
**Secondary engineer:** ChatGPT  
**Authoritative local handover input:** `TALLYBOOK_V19_STAGE1_INCREMENT7_2026-10-23.zip`  
**Input SHA-256:** `38891472d1fc41bb6d93769e0d80eb841a55dd63eb00cd1a3f7ca74bf24c3e57`  
**Status:** Stage 1 NOT ACCEPTED; client production **NO-GO**.

**Pre-handover QA update (2026-10-23):** Read `QA_PRE_HANDOVER_2026-10-23.md` and `QA_PRE_HANDOVER_TEST_LOG.txt`. Independent targeted run: 44/44 passed on Node 22.16.0. Exactly one byte-identical redundant log was removed; prior increment manifests remain historical. The new current-package manifest is `HANDOVER_PACKAGE_SHA256.json`. Stage 1 still NO-GO.

## 1. Owner instructions and scope

Claude takes responsibility for engineering architecture, integration, implementation, QA, and evidence-based acceptance. ChatGPT serves as secondary engineer/reviewer when assigned. Continue the **new 12-stage roadmap**, beginning with Stage 1 Foundation & Quality Recovery. Keep the original GitHub-downloaded `tallybook-main.zip` untouched. All work is local in a separate development directory. **Do not commit, push, merge, deploy, or modify GitHub or Supabase without separate explicit owner authorization.** No live payments or commercial release authorization. Do not assume the downloaded GitHub ZIP includes every branch or latest remote changes.

Maintain a persistent per-file development ledger with issue ID, reason, dependencies, tests, outcomes, and unfinished work. Deliver source ZIPs, reproducible patches, progress reports, manifests, and SHA-256 checksums after meaningful increments. Distinguish implementation, targeted testing, integration verification, environment blocking, and acceptance. Preserve the original archive as immutable evidence. Future GitHub integration requires comparison with the then-current branch and selective owner-authorized commits.

## 2. Exact source baseline and navigation

This handover ZIP is **Increment 7 with this new HANDOVER.md added**; no other project files are intentionally modified. The app root within the archive is `tallybook-main/`. Its root `package.json` reports `business-app` version `1.0.0`, not a verified Git commit or authoritative product version. The source's V19 identification comes from its documentation and delivery history; **GitHub HEAD/branches have not been verified**.

Important local records:
- `STAGE1_INCREMENT7_PROGRESS.md` — concise latest progress.
- `STAGE1_INCREMENT7_LEDGER.json` — Increment 7 file-level change records and blocker list.
- `STAGE1_DEVELOPMENT_LEDGER.json` — earlier development ledger.
- `STAGE1_INCREMENT7_SHA256.json` — previous source snapshot manifest; does not include this newly added handover.
- `STAGE1_INCREMENT6_GATE_RESULTS.json` and `STAGE1_INCREMENT6_RUNNER_LOG.txt` — previous QA gate evidence.
- `qa/stage1-gate-runner.mjs`, `qa/stage1-gate-policy.mjs` — QA runner and gate policy.
- `qa/stage1-schema-contract.test.mjs`, `qa/stage1-company-isolation.test.mjs` — targeted checks.
- `stage1-audit-candidate/tallybook-integrity/` and `stage1-audit-candidate/tallybook-security/` — candidate modules, adapters and tests.
- `docs/release/HANDOVER.md` — **historical release handover**, with multiple older 'latest' claims; use this root handover for the new lead transition and verify chronological claims.

## 3. Work performed through Increment 7

Candidate integrity/security modules and read-only audit adapters were added **outside production write paths**. Standalone tests and static schema/isolation checks were exercised in earlier increments; Increment 6 added gate-policy tests and reporting; Increment 7 corrected the isolation auditor so sale-line company ownership is inferred through its parent sale, with indeterminate scope distinct from confirmed cross-company references. Increment 7 progress reports **4/4 targeted regression tests passed**. The original production application write paths were not changed in Increment 7. These are **not** end-to-end production integration results.

Do not sum counts from different increments as if one combined run had been executed. Treat earlier assistant summaries as historical claims unless reproducible logs exist. Confirm actual outcomes by rerunning suites in the target environment.

## 4. Mandatory unfinished Stage 1 gates

| Gate | Current evidence / status | Required acceptance evidence |
|---|---|---|
| Real Dexie / IndexedDB integration | **Unverified**; standalone/fixture auditors exist | Disposable real IndexedDB database, actual schema, read-only snapshot audit, valid/corrupt records, repeatable automated results |
| Cross-company isolation at transaction boundaries | **Unverified**; fixture read-only auditor exists | Negative tests for real writes and reads across companies, including sales, customers, stock, refunds, staff and financial operations; verify rejection and unchanged data |
| Full application Vitest and TypeScript | **Blocked/unverified** in prior environment | Install pinned dependencies; execute full suites and `tsc --noEmit`; record exact versions, failures and fixes |
| Production build | **Blocked/unverified** | Execute both Vite frontend and esbuild server bundle; inspect artifacts, launch smoke tests and logs |
| Windows/browser recovery | **Unverified** | Real Windows 11 Chrome/Edge, browser restart, offline persistence, backup/restore, corrupted data, interrupted transactions, multi-tab and failure recovery with evidence |

Previous environment was reported as Node 22.16.0 without full dependencies; the intended environment was reported as Node 24.19.0 and pnpm 10.34.0. Confirm toolchain constraints from project files rather than relying only on prior narrative. Environment failures are not product passes.

## 5. Recommended immediate execution order

1. Verify this archive SHA-256 and all existing manifest entries; inspect source and Git metadata if any. Keep pristine baseline and create a new working copy.
2. Establish reproducible pinned Node/pnpm environment, install dependencies without modifying the owner's remote systems, and run existing QA gate runner, full Vitest, typecheck, and build. Record every failure.
3. Build **actual disposable Dexie/IndexedDB integration tests**, wire candidate auditors only where compatible, and validate snapshot consistency.
4. Add/repair authoritative transaction-level company isolation guards with negative tests and no production-data access.
5. Run browser recovery automation and prepare an explicit Windows 11 manual acceptance script for owner/device tests; never claim actual Windows verification from Linux emulation.
6. Update the persistent ledger, patch, full source ZIP, progress report and SHA-256 manifest. Keep Stage 1 NO-GO until every mandatory gate has evidence.

## 6. Product-level release warning

Passing Stage 1 is **not** completion of the entire 12-stage roadmap. Historical release records indicate unresolved financial reconciliation, partial returns/refunds, recovery, authorization, multi-branch/cloud and real-world acceptance concerns. Scope the first client offering explicitly before claiming commercial readiness. Refund policies must remain configurable per company; offline-first single-business capability must not be misrepresented as secure synchronized multi-device operation. Tallybook belongs under the Alchemy product ecosystem.

## 7. Packaging and integrity

This handover file is an additive documentation change. The original Increment 7 ZIP must be retained separately with SHA-256 `38891472d1fc41bb6d93769e0d80eb841a55dd63eb00cd1a3f7ca74bf24c3e57`. The ZIP delivered with this document is a **handover snapshot**, not a new verified engineering increment. Existing file-level manifests reflect their original snapshots and must not be silently relabeled as hashes of this new archive. The enclosing ZIP hash is supplied in the delivery message.
