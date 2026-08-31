# Testing Strategy

## Stage 6 automated coverage

The Vitest suite uses fake IndexedDB and now verifies partial repayment, multiple repayments to zero balance, overpayment rejection, customer-balance isolation, repayment idempotency, and version 6-to-7 migration. Existing sales tests continue to verify that the originating customer credit sale is atomic.

| Command | Purpose |
| --- | --- |
| `pnpm test` | Runs all foundation, business, inventory, customer, sales, credit, route, and UI regressions. |
| `pnpm check` | Runs TypeScript without emitting files. |
| `pnpm build` | Builds the production PWA and static server bundle. |
| `pnpm dev` | Starts the local mobile-first interface for manual checks. |

## Enhancement Roadmap — Stage 1 Mobile Money verification

The Stage 1 regression suite verifies provider-name normalization and duplicate handling, availability filtering, full Mobile Money payment snapshots, part-paid Mobile Money debt behavior, missing-provider rejection without stock loss, repeat submission idempotency, and a version-7 historical `mobile` payment migration. Backup/restore coverage proves provider configuration plus provider/reference snapshots return after a simulated reinstall. The read-only integrity test accepts historical Mobile Money rows with no provider fields and reports an invalid provider reference without modifying data.

The current complete automated suite contains **20 test files and 54 tests**. The browser acceptance ledger verified a full Cash sale with repeat activation, full Mobile Money with an in-context provider and reference, part-paid Mobile Money, named-customer Credit, refresh persistence, and Business-first provider visibility. See [Stage 1 browser validation notes](./stage1-validation-notes.md) for the exact isolated observations.

### Manual checks required for Stage 1 owner approval

Configure one provider in **Business**, then complete a Cash sale, a full Mobile Money sale with an optional reference, and a named-customer Mobile Money part payment. Confirm the provider add path does not clear the draft. Complete a named-customer Credit sale, refresh/reopen the app, inspect receipts and recent sales for **Mobile Money** labels, and verify customer debt, stock, and receipts. Create and restore a backup if the owner needs to verify that provider history is included on the target device.

## Enhancement Roadmap — Stage 2 debt clarity verification

Stage 2 adds a Home regression for the **Who owes me?** link and a debt-ledger regression that records a Mobile Money customer payment while proving the completed sale and its original outstanding amount remain unchanged. Existing tests continue to protect partial repayment, final settlement, overpayment rejection, customer isolation, repayment idempotency, migration, backup/restore, integrity, Stage 1 Mobile Money records, offline status, and keyboard access.

The Stage 2 release run passed **21 test files and 56 tests**, TypeScript, production PWA build, production dependency audit, offline-status browser check, integrity browser check, keyboard browser check, and real browser/manual debtor-flow validation. The manual flow verified immediate list-total refresh after a payment; the first browser attempt found that list state had not refreshed, the issue was repaired, and the final partial and settlement flows were rerun successfully.

## Enhancement Roadmap — Stage 3 receipt verification

The Stage 3 receipt-detail tests prove a part-paid Mobile Money receipt uses immutable original sale amounts, shows provider/reference snapshots where present, renders historical `mobile` as Mobile Money without requiring provider/reference data, excludes internal identifiers from share text, supports native sharing, uses clipboard fallback, exposes a manual-copy fallback, and preserves Credit receipt semantics. The simulated-reinstall backup test now rebuilds a saved Mobile Money receipt through the read-only detail resolver after restore.

Live browser validation completed a Cash sale and named-customer part-paid Mobile Money sale, opened detailed receipts, tested the visible Clipboard and manual-copy fallbacks, invoked visible Print through an isolated browser stub, confirmed receipt-action counts do not mutate business records, refreshed the app, and reopened the saved receipt from recent sales. The final release run passed **22 test files and 62 tests**, TypeScript, production PWA build, generated PWA artifacts, dependency audit, offline-status, integrity, keyboard, and responsive checks.

## Manual checks required for Stage 6

Create a named-customer credit or partial sale. Open that customer, record a partial repayment, and confirm the derived balance falls. Record a second repayment to settle the debt, then try one more repayment and confirm it is rejected. Check that another customer’s balance is unchanged. Refresh/reopen the app and confirm repayment history and balance remain visible.

## Stage 6 approval repair checks

Regression coverage now renders Today with a saved profile and checks that the business name and country/currency record are visible. It also checks the bounded sale-completion helper and a full sale using `10,000.00` as the payment amount. An isolated loopback browser flow verifies that the grouped payment saves one sale and that the completion control ends with `aria-busy="false"` and its normal label.

The blocking-control regression additionally inspects the live Sales control without writing owner data and verifies that its normal empty-cart state is `disabled=false`, `aria-busy=false`, and uses a pointer cursor. The isolated checkout flow verifies it remains clickable after the one saved sale.

## Stage 7 reporting checks

Report tests build an isolated local ledger with a cash sale, a credit sale, a later repayment, and low stock. They verify today’s sales, received money, outstanding debt, transaction count, report rows, stock status, and seven-day trend reconcile to those saved records. They also verify the Today and Last 7 days filters use explicit local calendar boundaries and exclude an older sale.

## Stage 8 reliability checks

The Stage 8 suite closes and reopens a populated local database, then verifies the business profile, product stock, customer debt, receipt, dashboard, and all-time report values. It upgrades a simulated version-6 database while preserving its owner record, heals invalid schema metadata, and verifies an insufficient-stock failure leaves no partial records after reopen.

The isolated browser workflow seeds disposable local data, disables the loaded page’s network, verifies the **Working offline** badge, records a sale through the UI, verifies receipt and stock state, confirms a cached shell request, restores the network, and opens a fresh page with the saved record intact.

The Stage 8 repair regression verifies that an initial online load is silent, then that an offline-to-online transition shows the exact no-upload message. The isolated browser workflow exercises the same transition before confirming the original offline sale and reopen checks remain intact.

## Stage 9 backup and restore checks

The backup test creates a business, stock record, customer, partial sale, receipt, payment, and repayment; exports the local snapshot; clears the simulated local database; restores the backup; and reconciles the business profile, stock quantity, debt, receipt, and report totals. It rejects invalid kind, newer schema, and duplicate-record backups without changing the existing business.

The isolated browser workflow clicks the real download control, verifies a JSON file was produced, loads that file into the actual file input, changes the disposable current ledger, confirms replacement in the restore dialog, and verifies the original product, sale, payment, receipt, and repayment reappear.

## Stage 10 interaction and accessibility checks

The shell regression verifies a keyboard skip link targets the main landmark, the Backup route remains exposed in working navigation, and removed future-menu controls cannot trap an owner in a dead interaction. Focus and reduced-motion rules are verified through the shared stylesheet and reviewed at mobile and desktop viewport sizes. Existing sales, reports, offline, and backup checks continue to protect business-record behavior during the presentation-only changes.

## Stage 11 hardening checks

The integrity tests create a valid business, product, customer, sale, payment, receipt, and inventory record, then verify the audit reports a clear result without writing any record. A second test introduces an inconsistent total and orphan receipt directly into an isolated test database, then verifies both issues are reported and neither record is changed or deleted.

The dependency check removes unused audited production packages, upgrades the static server and Nano ID, reruns TypeScript and the full regression suite, and rechecks production dependencies. Production validation confirms client-side routes still resolve through the upgraded static server.

## Stage 12 final verification

The release-candidate run repeats the full regression suite, TypeScript check, production PWA build, manifest and service-worker presence, production route fallback, production dependency audit, offline workflow, backup/restore workflow, integrity workflow, keyboard path, and responsive visual review. The release checklist records which device-specific performance and installation checks remain for the owner rather than marking them as passed without evidence.
