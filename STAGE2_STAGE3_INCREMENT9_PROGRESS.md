# Stage 2–3 / Security Increment 9 progress — 2026-10-23

## Result

This is an interim engineering increment for the Tallybook V19 continuation. It implements the Stage 2 batch-receipt/cost evidence path, adds Stage 3 current-inventory valuation with strict currency provenance, and fixes a company-switch race in backup-export status used by the company-clear safety gate. It does **not** close the broad Stage 2, Stage 3, Stage 11, or release acceptance criteria; project decision remains **NO-GO / INCOMPLETE**.

## Implemented

- Added schema-29 additive indexes and links for purchase-line, batch and immutable cost-event provenance. Batch purchase entry records the physical quantity/expiry identity and base-unit cost in the same transaction as the purchase, stock movement and FIFO receipt. Existing stock can be labeled as a batch without inventing purchase history or changing quantity.
- Added strict backup/import and read-only integrity checks linking new batch receipts across the purchase line, physical batch, stock movement, cost event and current stock. Regression coverage exercises expiry-priority physical allocation separately from accounting FIFO, reversal/restoration and tampering.
- Added `reconcileInventoryValuation`, which reconstructs current on-hand layers from company-scoped immutable cost events and purchase evidence. It reports separate totals for each saved purchase currency, never applies the current profile currency to legacy/opening stock, marks unknown quantities honestly, validates line and purchase-total arithmetic, and rejects cross-record or safe-integer inconsistencies.
- Included valuation in the same read-only company-scoped financial report snapshot and CSV. The report page labels valuation as current/as-of, separate from the selected sales period, and displays unknown quantities rather than estimating them.
- Fixed a destructive-gate risk: BackupPage previously recorded the current active company after asynchronous encryption, which could differ from the company in the file. `recordBackupExportedAt` now requires the exact backup company, checks it before and inside the Dexie transaction, and aborts on a switch. A Dexie hook regression proves the metadata transaction rolls back when company context changes during the profile read.
- Refreshed the AST mutation-candidate inventory; it still contains 70 candidates requiring manual boundary review and is not a security certification.

## Verification

Toolchain: Node `v24.19.0`, pnpm `10.34.0`, Vitest `4.1.11`, Vite `7.3.7`.

- Focused integration batch: **8 test files, 81 tests passed**.
- Full client suite: **99 test files, 797 tests passed**.
- TypeScript `pnpm check`: passed.
- Production `pnpm build`: passed; it emits existing dependency annotation and >500 kB chunk advisories.
- Native Stage 1 policy and Stage 12 schema continuity gates: **13/13 passed**.
- Stage 1 gate runner: **9 PASS, 0 FAIL, 0 BLOCKED** for executable gates; `stageAccepted` remains false because Windows browser-recovery evidence is absent. The runner explicitly distinguishes actual-schema Dexie tests using the IndexedDB test adapter from real browser/Windows persistence evidence.
- Raw logs and gate JSON are in `artifacts/stage2-stage3-increment9/`.

The automated suite is green for this source snapshot, but it does not validate physical devices, real browsers, Windows filesystem/recovery, production hosting, provider workflows, full historical data, or legal tax requirements.

## Remaining work

- Stage 2 `S2-06` remains `implemented-unverified`; broader browser acceptance and the full sales/return/expiry matrix are outstanding. Stage 2 `S2-07` and FIN-001 still require adjustment, conversion, unknown legacy cost and historical reconciliation coverage.
- Stage 3 `S3-06` remains **missing**: authoritative sale allocation, purchase, stock, reversal, liability and full-history totals must reconcile independently. Partial refunds and tax/accounting policy still need approved business facts.
- SEC-001 remains `implemented-unverified`; only one newly found backup metadata race was fixed. The 70-candidate static inventory and read surfaces still require manual service-boundary review.
- DATA-001/DATA-002 recovery and historical migration matrix remain open. Cross-platform/browser acceptance is deferred until the end by owner direction, not counted as passed.
- Cloud authentication/financial replication, authoritative multi-store balances, approved provider sandbox, public commerce/fulfillment, staging and operations remain separate missing or externally gated work.


## Source snapshot integrity

A complete source ZIP and unified patch were generated against the verified Increment 8 archive. The patch applied cleanly to a fresh extraction, reproduced every delivered source-file hash, and retained the checked-in candidate-module `dist` files while excluding only local dependency/cache directories and the root production build output. ZIP, patch, baseline and per-file hashes are recorded in the external Increment 9 SHA-256 sidecar.
