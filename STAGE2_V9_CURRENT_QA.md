# V9 Stage 2 implementation and QA (9 October 2026)

This build is NOT Stage 2 complete and must not unlock V10.

## Implemented in this increment
- Inventory UI supports choosing local catalogue CSV, user confirmation, and atomic import service; product CSV export remains available.
- Stock count UI now starts persistent draft sessions and can resume the latest saved draft; posting updates the persisted draft and posts through existing atomic stock correction service.
- Only one open draft stock count per business is permitted to prevent accidental overlapping counts.
- Batch registration refuses recording more tracked batch units than the product's physical stock; expiry dates undergo calendar validation.

## Not complete
- Variant editor, product images, wholesale and unit conversion UI and transactions.
- Proper non-stock service sale/purchase handling across all workflows.
- Batch/expiry-aware stock allocation and reversal, reconciliation to movement ledger, and receipt attribution.
- Integration and migration/restore validation of all inventory workflows.

## Test status
- Changed TypeScript files pass syntax transpilation diagnostics (not type checking).
- Full Vitest suite and production build blocked by unavailable node_modules / npm dependency resolution in this environment.
- Physical device, browser IndexedDB and printer checks deferred to comprehensive Work QA at project completion.
