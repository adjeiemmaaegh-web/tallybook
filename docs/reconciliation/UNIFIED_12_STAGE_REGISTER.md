# Tallybook V19 — 12-stage engineering register (reconciliation checkpoint)

The 82 acceptance units in `docs/release/traceability.json` remain the governing register. This update records source-integration evidence without changing any unit to accepted. Counts below are the register's current statuses, not completion claims.

| Stage | Implemented, unverified | Implemented and tested | Missing | Blocked | Reconciliation assessment |
|---:|---:|---:|---:|---:|---|
| 1 | 6 | 0 | 0 | 0 | Full transaction and real-browser recovery gates open. |
| 2 | 7 | 0 | 0 | 0 | Historical batch/cost evidence still needs broader reconciliation. |
| 3 | 6 | 0 | 1 | 0 | Financial conservation and tax acceptance open. |
| 4 | 7 | 0 | 0 | 0 | Customer credit, wallet, and refund policies need full regression. |
| 5 | 3 | 1 | 1 | 0 | Assistant regression suite passes; formal acceptance is not inferred. |
| 6 | 6 | 0 | 0 | 0 | Recovery/backup tests and physical restart evidence open. |
| 7 | 6 | 0 | 0 | 0 | Supplier liability and settlement checks open. |
| 8 | 5 | 0 | 4 | 0 | Cloud remains development-only and disabled for production. |
| 9 | 6 | 0 | 5 | 0 | Multi-store and secure synchronization remain unaccepted. |
| 10 | 2 | 0 | 3 | 2 | Payment simulation and commerce only; live integrations prohibited. |
| 11 | 2 | 0 | 3 | 0 | Focused company-isolation suite passes 15/15; wider audit open. |
| 12 | 4 | 0 | 1 | 1 | Device, browser, operations and release acceptance open. |

Current automated evidence: the fresh clone at `3fd4b2f` passed complete client Vitest 996/996 across 124 files, following frozen installation, TypeScript and build. Clean-clone release and offline Playwright passed 3/3 each. After updating obsolete source-contract assertions, native QA passed 420/420 and focused server audits passed 83/83. The full Windows server suite remains non-green (345 pass, 43 optional-sync failures, 1 skip); Linux security verification is pending. These automated results do not change the 82 acceptance-unit statuses without required operational evidence.

**Release decision: NO-GO.** No deployment, live payment, or formal physical-device acceptance is authorized or claimed.

## Later v36 evidence, 2026-10-26

The staff-governance migration now fails closed if an enrolled company's staff rows disappear. Full client Vitest passed 1006/1006 across 125 files; TypeScript, production build, native schema-order gate (3/3), auth browser (3/3), release browser (3/3), and offline browser (3/3) passed. The status counts above remain unchanged because these checks do not supply the missing cloud, historical customer, Linux server, and operational acceptance evidence. See `STAFF_GOVERNANCE_V36_CHECKPOINT.md`.

## Local central-event checkpoint, 2026-10-26

Dexie v37 records new-sale event payloads atomically with checkout, preserves them through portable backup, and does not backfill historical sales. An isolated signed uploader verifier and draft PostgreSQL RLS tests now exist, but enrollment, server ingestion, live Supabase/RLS, full operation coverage, and Watchdog importer acceptance remain open. Complete client Vitest passed 1008/1008, native QA 422/422, TypeScript and build passed, and nine local Chromium checks passed. The full Windows server suite remains non-green at 349 pass, 43 POSIX-only failures, 1 skip; Linux evidence is still unavailable. The 82 governing acceptance-unit statuses in the table above remain unchanged. See `docs/central/2026-10-26_LOCAL_CENTRAL_CHECKPOINT.md` and its raw evidence.
