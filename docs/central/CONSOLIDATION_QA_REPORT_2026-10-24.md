# Tallybook V19 — Integrated local source and QA report

**Date:** 2026-10-24  
**Input:** `TALLYBOOK_V19_CENTRAL_WORKSPACE_LOCAL_INCREMENT_2026-10-24_SOURCE.zip` (979 source members, Dexie v30) + the existing Batch 1–7 modules and reports already retained as `candidate_modules/` and connected source.  
**Mode:** LOCAL DEVELOPMENT ONLY. **Release decision:** **NO-GO / INCOMPLETE**. No live data, GitHub modifications, Supabase project edits, payments, cloud sync or deployment authorized.

## What was integrated in actual application paths

1. **Read-only sale integrity review** — `localIntegrityCore.ts` and `localIntegrityOverview.ts` provide company-scoped reporting for sale balances, tender sums, duplicate provider references, orphan payments and historical staff/shift uncertainty. An explicit Reports-page button triggers this read-only review. It does not recompute payable/refund settlement, perform bank reconciliation, or mutate any financial record.
2. **Single-store Watchdog daily JSON preview** — `watchdogDayEnvelope.ts` produces a versioned, row-counted, UTC-day JSON document after the existing Watchdog sale/payment/shift conservation checks. App service reads the same authorized Dexie snapshot used by the legacy CSV, including existing cash partial return journal. Reports has a separate JSON button; the older CSV is preserved as-is.
3. **Provenance transparency** — Stable event IDs, ISO UTC timestamps, no-sale local device *claims*, receipt numbers, known tender methods and known MoMo providers are carried where present. Historical device/register identity and remote receipt timestamp are **not invented**; `contract_status: partial_unverified_provenance` is explicit. Cash returns are identified only as locally staff-confirmed claims.
4. **Reproducible native QA** — `node scripts/qa-consolidated-local.mjs` runs existing source/server native QA and standalone batch checks separately. It is offline and does not install packages, run a browser, or contact a database.
5. **Full 30-deliverable integration matrix** — `CONSOLIDATION_INTEGRATION_MATRIX.md` identifies each candidate module as connected, equivalent-existing, candidate-only or blocked. The authoritatively persisted sale/refund/wallet/backup/inventory writers are **not replaced** by general-purpose reviewers.

## Verified locally, exact commands

| Check | Evidence | Status |
|---|---|---|
| `node --experimental-strip-types --test qa/*.test.mjs server/tests/*.test.mjs` | 510 tests; 510 passed, 0 failed, 0 skipped | Passed on Node 22.16.0 |
| `node --experimental-strip-types --test candidate_modules/batch{1,2,3,4}/*.test.mjs candidate_modules/crossBatchCompatibility.test.mjs` | 68 tests; 68 passed, 0 failed, 0 skipped | Passed in a **separate** run |
| 7 edited/added TS/TSX entry files transpiled with global TypeScript 5.8.3 | 0 syntax/transpile diagnostics | Passed (syntax only) |
| ZIP CRC and per-file SHA-256 manifests | Separate packaging verification output | Archive integrity only |
| `tsc --noEmit --pretty false` | TS2688: missing Node and `vite/client` type definition files | **Blocked** — no semantic TypeScript pass |
| `pnpm test`, full Vitest, Vite build | No installed pinned pnpm/dependencies | **Not run** |
| Real PostgreSQL migrations/RLS, fake/real IndexedDB, browser/Watchdog importer | No isolated DB or full app/browser environment here | **Not run** |

**Do not combine** the 510 and 68 counts into a purported single full-app test run. Local native checks do not prove an integrated finance transaction or a working cloud deployment.

## Important remaining blockers

- **CENTRAL-001/002/003 (critical):** Missing trusted financial ingest RPC/endpoint, durable complete operation payloads transactionally enqueued with each originating operation, and actual PostgreSQL RLS/constraint/negative tests. Existing uploader receipt validation is an adapter, not working Supabase synchronization.
- **CENTRAL-006/007:** Dexie v30 of uploaded source conflicts with a separately reported branch v33; no GitHub merge attempted. No authoritative per-sale shop and device provenance for multi-store data; recent single-store-only mapping remains conservative.
- **CENTRAL-008/009/014:** Watchdog JSON is an explicit **preview**, not an importer-verified final shared event contract. No 7-shop central owner reporting, trusted bank/MoMo statement matching, or verified device register mapping.
- **CENTRAL-011:** Complete per-business refund settlements, payment provider disbursement proofs, split tenders and historical approval-policy snapshots remain unimplemented beyond existing restricted local cash-return and reversal flows.
- **CENTRAL-010/012:** Real IndexedDB, Chrome/Edge/Windows, full app Vitest/typecheck/build and Watchdog end-to-end imports are unverified. Node 22.16.0 differs from pinned 24.19.0.

## Next owner-controlled prerequisites

1. Confirm which source branch (uploaded v30 or actual repo v33) is target for a three-way merge; review migration differences and do not drop data.
2. Obtain an **isolated test-only** Supabase project/localhost Postgres environment and explicit permission before project changes. Execute SQL and negative RLS/forgery/idempotence tests there.
3. Design independently validated staff-device-shop attestation, durable local event payload/operation identity, and trusted cloud ingestion, then verify extended-offline/revocation semantics.
4. Agree with the Watchdog developer on exact final versioned event contract, source evidence rules, privacy fields, import format and timezone boundaries; run saved-file importer end-to-end.
5. Install pinned Node/pnpm dependencies and run full project Vitest, semantic tsc, Vite build, IndexedDB recovery and physical browser checks.

No external source control or database resource was changed. Production readiness, full integration and complete refund processing **are not claimed**.
