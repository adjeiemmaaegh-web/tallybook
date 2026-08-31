# Local Database

## Current schema

The `tallybook-db` database uses schema version `8`. Version 8 preserves every prior store and adds local Mobile Money provider configuration; it does not transform historical payment method values.

| Store | Primary key | Important indexes | Purpose |
| --- | --- | --- | --- |
| `sales` | `id` | customer, receipt, date, outstanding, submission key | Completed sale and original amount outstanding. |
| `payments` | `id` | sale, customer, date, method | Payment received at sale completion. |
| `repayments` | `id` | customer, date, method, unique submission key | Later payment against a customer’s outstanding balance. |
| `mobileMoneyProviders` | `id` | business profile, normalized name, update date | Owner-configured, locally available Mobile Money providers. |
| `customerActivities` | `id` | customer, sale, date | Earlier customer sale activity retained for compatibility. |

## Mobile Money payment metadata

The `payments` store retains `method: "mobile"` for compatibility. New Mobile Money payments may additionally hold `mobileMoneyProviderId`, `mobileMoneyProviderName`, and `mobileMoneyReference`. The provider name is a historical snapshot, so a receipt remains understandable if a provider is hidden later. The reference is optional. Existing `mobile` records without these optional fields remain valid and display as **Mobile Money**.

## Repayment record

| Field | Rule |
| --- | --- |
| `customerId` | References one active local customer. |
| `amountMinor` | Positive integer minor units; cannot exceed current derived debt. |
| `method` | Cash, card, or mobile payment. |
| `note` | Optional trimmed owner note, maximum 240 characters. |
| `submissionKey` | Unique key that makes a repeated action idempotent. |
| `createdAt` | ISO 8601 timestamp; repayment history is append-only. |

## Migration convention

Version 8 adds the `mobileMoneyProviders` store without deleting or rewriting earlier sales, payments, customers, stock, business data, or the version-7 repayments ledger. A version-7 migration test verifies a historical `mobile` payment survives unchanged and the new provider store opens empty. Derived debt continues to use sales plus repayments; it is never stored as a separately editable total.

## Stage 6 approval repair

This repair does not change the database schema or alter saved sales. It only normalizes human-entered money strings before converting them to minor units, so `10,000.00` becomes the same local value as `10000.00`.

The blocking-control correction likewise does not alter local records or schema; it only changes whether the owner can invoke the existing validation path before a sale is eligible to save.

## Stage 7 reporting model

Stage 7 requires **no database migration and no new persistent store**. Reports query the authoritative `sales`, `payments`, `repayments`, `customers`, and `products` stores, then calculate transient rows and totals in memory. This avoids a second source of truth and ensures a sale, repayment, or stock change is reflected as soon as the report refreshes.

## Stage 8 recovery behavior

Database startup preserves the first `databaseCreatedAt` value and writes the expected local schema version after a successful open. Stage 8 confirms that a malformed `schemaVersion` metadata value is safely replaced with the current version while existing owner records remain. This metadata is a readiness marker; it is not a substitute for export or backup.

The restored-connection notification creates no database record and does not mark any sale, receipt, payment, repayment, or stock item as synchronized.

## Stage 9 backup boundary

Backup files contain snapshots of every existing store: `appMeta`, `businessProfiles`, `categories`, `products`, `inventoryMovements`, `customers`, `sales`, `saleLines`, `payments`, `receipts`, `customerActivities`, `repayments`, and `mobileMoneyProviders`. The file is validated outside the replacement transaction, then every store is cleared and bulk-restored inside one transaction before startup metadata is rechecked. A legacy version-7 backup may omit `mobileMoneyProviders`; it restores with an empty provider list.

## Stage 10 data impact

Stage 10 does not add a store, field, index, migration, cache, or derived record. Accessibility and polish improvements are UI semantics and styling only.

## Stage 11 integrity strategy

Stage 11 adds no schema version or persistent audit log. The on-demand audit reads the existing version-7 stores and verifies relationships and arithmetic that can be proven from current saved records. An issue is advisory, preserves every record, and directs the owner to back up before any manual recovery. Database version migration remains explicit in `TallybookDB`; opening the app writes the current schema marker only after a successful database open.

## Stage 12 release state

The release candidate retains schema version 7. No destructive schema change, new data store, or automatic data transformation is introduced in Stage 12; release guidance directs owners to use the existing versioned local backup before any device transition or troubleshooting action.
