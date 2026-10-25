# Tallybook V19 — Seven-batch consolidation map

Date: 2026-10-24. Source: the uploaded `TALLYBOOK_V19_CENTRAL_WORKSPACE_LOCAL_INCREMENT_2026-10-24_SOURCE.zip` (Dexie v30). **No production changes or external connections.** This work does **not** claim all 30 candidate deliverables are production integrated: they were authored as separate read-only planning/checker/test artifacts. Replacing authoritative writers with them would be unsafe.

Status legend: **Connected** means imported into an actual app path; **Equivalent existing** means production code already handles the domain but candidate not substituted; **Candidate only** means tests/checker work standalone; **Blocked** means a specific missing precondition. All connected entries still require full app/browser acceptance.

| File | Current status | Evidence and reason |
|---|---|---|
| Batch 1 / `refundSettlement.ts` | Candidate only / blocked | Checks refund evidence; does not disburse cash or verify provider settlement; per-company refund policy and full journal settlement unimplemented |
| Batch 1 / `partialRefundEngine.ts` | Equivalent existing + candidate only | Actual `partialReturnPlan.mjs` and cash-only return writer are more precise; planner cannot allocate full tax/discount/tender workflows |
| Batch 1 / `financialReconciliation.ts` | **Connected** | Version of its sale-conservation checker integrated in `watchdogEventMapper.ts` and now `localIntegrityCore.ts` |
| Batch 1 / `customerCreditLedger.ts` | Equivalent existing + candidate only | Existing credit ledger is authoritative; candidate requires explicit allocation history not proven across all legacy data |
| Batch 1 / `walletReconciliation.ts` | Equivalent existing + candidate only | Existing prepaid liability/benefit reconciliation; historical transfer types need migration mapping |
| Batch 1 / `supplierPayableSettlement.ts` | Equivalent existing + candidate only | Existing purchase/payable journals; no generic settlement writer safely derived from reviewer |
| Batch 2 / `inventoryReconciliation.ts` | Candidate only / blocked | No authoritative per-shop stock-movement history in this source |
| Batch 2 / `multiStoreStockControl.ts` | Candidate only / blocked | Needs shop-level stock ledger, transfers, assignment and transaction provenance |
| Batch 2 / `companyIsolationGuard.ts` | Equivalent existing + candidate only | Existing companyScope and transactional permission guards; standalone checker cannot replace storage/RLS controls |
| Batch 2 / `staffAuthorizationAudit.ts` | Equivalent existing + candidate only | Actual `requirePermission` and staff shift services enforce saved roles/session; static candidate would duplicate policy |
| Batch 3 / `databaseMigrationValidator.ts` | Candidate only | Runs pure migration-chain diagnostics; cannot automatically migrate v30 over separate branch v33 |
| Batch 3 / `backupRestoreValidator.ts` | Equivalent existing + candidate only | Existing backup/restore integrity controls and crash journals are authoritative |
| Batch 3 / `crashRecoveryManager.ts` | Equivalent existing + candidate only | No swap without persisted browser restart testing and recovery-vault compatibility |
| Batch 3 / `offlineSyncReconciliation.ts` | Candidate only / blocked | Outbox stores metadata/digest but not atomic full operation payload; trusted ingest missing |
| Batch 3 / `financialReportsIntegration.ts` | Equivalent existing + candidate only | Existing financial intelligence has richer source links, costs and currency reconciliation |
| Batch 3 / `businessWorkflowIntegration.ts` | Candidate only | General workflow transition guard not yet bound to business-configurable approval rules |
| Batch 4 / `staffTransactionAndDrawerEvents.ts` | Equivalent existing / connected counterpart | New sale attribution and PIN/no-sale Dexie writer implemented in previous increment; candidate helper remains separate |
| Batch 4 / `watchdogCsvExport.ts` | **Connected** | Production-compatible serializer integrated in `client/src/features/integrations` in Batch 7; CSV remains legacy single-store |
| Batch 4 / `crossShopAttendantReports.ts` | Candidate only / blocked | Owner multi-shop consolidated facts require authoritative store/device provenance and central reporting |
| Batch 4 / `centralRetailSync.ts` | Candidate only / blocked | Pure ack/retry planning; no authenticated, verified ingestion, persisted full payload or RLS negative tests |
| Batch 5 / `integrationRegression.test.ts` | Scaffold | Needs full application fixture and seeded IndexedDB |
| Batch 5 / `financialIntegrity.test.ts` | Scaffold | Needs app transactions and historical refunds/wallets |
| Batch 5 / `securityIsolation.test.ts` | Scaffold | Needs real auth/RLS and forged attribution tests |
| Batch 5 / `backupRecovery.test.ts` | Scaffold | Needs browser profile restart and corrupted restore tests |
| Batch 5 / `crossBrowserAcceptance.spec.ts` | Scaffold / deferred | Physical browsers, Windows + Chromium/Edge/Firefox, no accepted evidence |
| Batch 5 / `endToEndBusinessFlows.spec.ts` | Scaffold / deferred | Full app and 2-shop/2-business fixtures not executed |
| Batch 6 / `FINAL_QA_REPORT.md` | Historical handover | Superseded by this increment's QA report; **release stays NO-GO** |
| Batch 6 / `RELEASE_BLOCKERS.json` | Historical handover | Updated blocker register remains at `docs/central/CENTRAL_WORKSPACE_BLOCKERS.json` |
| Batch 6 / `SOURCE_MANIFEST.json` | Historical handover | Reproducible SHA-256 manifest generated for this integrated source |
| Batch 6 / `TALLYBOOK_V19_FINAL_SOURCE.zip` | Historical source | Preserved inside original Batch 6 and original 7-batch master; superseded locally by this source |

## Actual source integrations made in this consolidation

1. One authorized, read-only `getLocalIntegrityOverview` service and Reports-page action; audits company-scoped sale conservation, saved external tender totals, orphan/duplicate payments, MoMo reference duplicates and legacy provenance. It never mutates stock, payments or customer balances.
2. One versioned daily **UTC JSON preview** action alongside the existing legacy Watchdog CSV, connected to the same authorized **single-store** snapshot and reconciliation. Includes shift-open, cash-count and staff-confirmed cash-return records and an explicit row count, stable IDs and UTC timestamps.
3. The preview does **not** assert unknown register/device identities or cloud timestamps; local no-sale device ID is identified as a claim, never cryptographic proof. Refunds are **staff-recorded cash claims** and not independent disbursement evidence. It includes no customer personal details.
4. Connected legacy export mapper now also exposes known receipt number, payment method and MoMo provider for the versioned preview, without changing the legacy CSV column contract.

## Why a complete integration cannot honestly be claimed

- **Central ingestion**: missing durable financial event payloads inside the same local transaction, trusted device/shop context, Supabase ingestion service, deployed/tested PostgreSQL RLS and credible revocation/retry reconciliation. No source/code-only test can prove cloud exactly-once effects.
- **Multi-store**: new and historical sales have no independently proven shop/device assignment; source's single-store bridge is conservative. Do not manufacture shop IDs by inferring from current settings.
- **Refunds**: existing cash-only in-person partial-return path does not verify all provider payouts or implement company-specific full settlement for card/MoMo/wallet/credit.
- **Git integration**: this uploaded Dexie v30 tree differs from a separately reported Dexie v33 branch; a proper three-way merge must precede using this patch in that branch.
- **Full acceptance**: missing project dependencies, native PostgreSQL test instance, pinned Node 24/pnpm, full browser/IndexedDB/Watchdog importer evidence. Native tests alone are not full application acceptance.

No GitHub, live Supabase, payment or deployment changes were performed.
