# Stage 2 inventory integration review

## Implemented in this increment
- Sale service uses configured wholesale unit price at the configured quantity threshold, and stores effective price on each line.
- Service items may be sold without requiring or reducing inventory stock; service sale lines still create ledger entries and receipts.
- Batch-tracked items are consumed earliest-expiry-first in the same IndexedDB transaction as the sale, excluding expired batches. A partially tracked product is blocked rather than allowing a sale that bypasses batch accounting.
- Stock-count corrections to batch-tracked items are blocked until their batches can be reconciled.
- Ordinary stock receiving for batch-tracked items is blocked until a batch-aware receipt path exists, avoiding silent drift of physical stock versus tracked batches.

## Outstanding development — NOT COMPLETE
- Batch-aware purchase receiving and sale reversal allocation history (requires immutable batch movement references).
- UI for catalogue variants, pack conversions, wholesale pricing, images and service settings needs end-to-end wiring and price preview reconciliation.
- Batch reconciliation controls to register additional stock and repair partial-tracking conditions.
- Sale confirmation preview must show wholesale threshold pricing consistently.
- Run actual database integration and browser tests; package dependencies unavailable here.

Stage 2 remains OPEN. Stage 3 must not begin until these are integrated. No production certification implied.
