# Tallybook V9 Stage 2 — inventory build plan and QA gate

Stage 3 is locked until the Stage 2 exit gate is met. This archive is a working Stage 2 increment, not a stage pass.

## Stage 2 builds
1. **Build 1: Catalogue foundations** — variant-level SKU/barcode identity; product-category hierarchy, compatible additive migration and legacy records. PENDING.
2. **Build 2: Pricing and units** — retail/wholesale pricing rules, base unit and pack conversion, audit-safe quantities. PENDING.
3. **Build 3: Products and media** — service/non-stock item semantics, local image attachments and storage limits. PENDING.
4. **Build 4: Bulk catalogue** — secure preview/import with CSV parsing, row errors and atomic validation; local CSV export. EXPORT IMPLEMENTED; import preflight added; full import PENDING.
5. **Build 5: Stock count** — expected-quantity snapshot, reviewed count, stale-count detection, atomic posting with inventory movement history. IMPLEMENTED via AdvancedInventory module and inventory page; persisted start/resume sessions PENDING.
6. **Build 6: Specialized tracking** — optional batch/expiry, receiving and sale allocation rules; migration tests. PENDING.

## Changes included
- `client/src/features/inventory/advancedInventory.ts`: local CSV export, import identifier preflight; prepare and post multi-product stock counts as one Dexie transaction. Previews are ephemeral, not saved sessions.
- `client/src/pages/InventoryPage.tsx`: export CSV action and reviewed physical stock count dialog.
- `client/src/features/inventory/advancedInventory.test.ts`: three regression test cases (not executed).

## QA performed
- Global TypeScript transpile/syntax checks of three changed files: passed.
- Archive integrity: checked when packaged.

## Deferred / blocking checks
- Vitest tests, full TypeScript typecheck, Vite production build (project dependencies unavailable).
- IndexedDB integration and browser offline workflows, migrations and backup/restore compatibility.
- Real-device barcode, quantity conversion, and stock count interaction.

## Exit criteria
Every build above is implemented, existing sale/purchase/reversal invariants remain valid, migrations and import rollback validated, unit and integration tests passed in a supported environment, and no known critical inventory data-loss defect. **Stage 3 must not begin before this gate is approved.**
