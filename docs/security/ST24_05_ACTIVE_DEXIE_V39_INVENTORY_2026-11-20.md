# ST24-05 — Active Dexie v39 encryption integration inventory (source review)

Date: 2026-11-20. Status: **preliminary source inventory, not an implementation or acceptance sign-off**.
Reference: `client/src/db/TallybookDB.ts` at PR #111 head `0cd8c748ba7a522a018b7e0d29d0072482b01faf`.
This file documents architecture only. It must not be interpreted as authorization to migrate or encrypt an active database.

## Baseline and bypass risk

- `DATABASE_NAME = "tallybook-db"`, `DATABASE_SCHEMA_VERSION = 39`. The default constructor uses `workspaceKey(DATABASE_NAME)`, so actual names may be workspace-qualified.
- The class exposes public Dexie `Table` members directly. `export const db = new TallybookDB()` permits direct queries and writes outside any new encryption facade. `initializeDatabase` directly reads and writes `appMeta` and `businessProfiles`.
- Existing schema indexes expose identifiers, names, normalized names, customer phone, SKU, receipt numbers, monetary outstanding balance, staff/store relationships, timestamps, retry/operation keys, and financial linkage. Encrypting record bodies while retaining these indexes does **not** provide full confidentiality.
- Stage A keyring, Stage B shadow and Stage C disposable migration do not change this behavior. Stage C reconstructs the original plaintext index definitions into a disposable target; it is **not** a production encrypted schema.
- Before a live implementation, enumerate *all* direct Dexie callers, raw IndexedDB callers, Dexie transactions, backups/imports, staff authorization, sync/replica, assistant storage, localStorage, service-worker/cache, and alternate workspace database names. This review has **not** completed that repository-wide call-site enumeration.

## Table and index exposure inventory

The following groups are directly declared as typed tables in `TallybookDB`. Every listed group requires field-level data classification and a query/write-path review before migration.

| Group | Tables | Confidentiality/query concerns |
|---|---|---|
| Setup and identities | appMeta, businessProfiles, staffMembers, staffShifts, staffAudits | Workspace identity, owner/staff identity, role, governance, authentication/authorization, timestamps |
| Product and inventory | categories, products, inventoryMovements, inventoryCostEvents, inventoryBatches, stockCountSessions | Names/SKU, quantity, cost, batch, stock movements and financial conservation |
| Customers and receivables | customers, customerActivities, customerBenefits, customerPolicies, walletTransfers, repayments | Name/phone, credit exposure, balance-affecting postings, submission-key uniqueness |
| Sales and returns | sales, saleLines, payments, receipts, saleReversals, cashPartialReturns, quotations | Receipt identifiers, outstandingMinor index, immutable financial records, duplicate prevention and refunds |
| Suppliers and spending | suppliers, purchases, purchaseLines, supplierPayableEntries, expenses | Supplier identity, purchases, payables, unique submission keys |
| Retail staff and stores | noSaleEvents, storeLocations, storeAssignments, storeTransferRequests, storeStockObservations, storeStockModes, storeStockEntries | Staff/store relationship, movement sequencing and uniqueness |
| Commerce and advisory | commerceOrders, commerceHolds, commerceDeliveryEvents, run17ReviewEvents, assistantAudit | Customer/order data, evidence trails, audit confidentiality |
| Sync and quarantine | syncConsents, syncOutbox, syncDevices, syncConflicts, syncReplicaOutbox, syncReplicaInbox, syncReplicaCursors, syncReplicaConflicts, centralSaleEvents, centralOperationalEvents, qaSaleClaimInbox, qaSaleClaimCursors | Device and tenant identifiers, remote event IDs, replay/ordering and uniqueness |
| Payment sandbox | paymentSandboxIntents, paymentSandboxEvents | Mock-only intent and event records; no live payment authorization |

**Schema caveat:** Some v39 effective indexes are inherited from earlier `.version(...).stores(...)` declarations. The inventory above is table-level, not an exhaustive resolved-index catalog. Resolve the effective schema in an isolated Dexie v39 instance before approving index redesign.

## Mandatory engineering gates

1. Generate a machine-checked **effective v39 object-store/index catalog** (including inherited indexes, unique and compound keys), plus a repository-wide read/write/transaction call-site manifest. Include indirect helper callers and raw IndexedDB.
2. Classify every persisted field as secret, authenticated clear metadata, or intentionally public; record leakage from table names, primary keys, row counts, ordering, timestamps and unique indexes. Require explicit approval for any cleartext index.
3. Specify encrypted schema and query replacements without using plaintext PII indexes; preserve tenant separation, financial integrity, uniqueness, and efficient offline queries.
4. Make old direct table access impossible or fail closed in encrypted mode; stage WebCrypto outside short IndexedDB transactions; coordinate all writers using an origin-wide lock plus transactional revision CAS.
5. Use only synthetic/disposable fixtures for integration rehearsals. Require owner-reselected verified external backup, independent clean-device restoration, crash/rollback and no-data-loss proof before any live switch.
6. Test all sales, refunds, inventory, purchases, payables, staff permissions, multi-business switching, exports, sync, offline startup, two-tab contention and browser engines. Do not enable payments or deploy.

## Decision

**NO-GO / PR remains draft.** This is an audit artifact, not a security fix. No active-ledger code, schema, data, migration, branch topology, deployment or payment configuration is changed by this document.
