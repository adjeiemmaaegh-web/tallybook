# Stage 2 V9 — inventory backup integration checkpoint

## Implemented
- Include V14 stock-count sessions and inventory-batch metadata in company-scoped local exports.
- Restore both V14 tables in the main ledger transaction and reject cross-company IDs.
- Keep reading pre-V14 backups with absent inventory tables; missing records normalize to empty lists.
- Validate session line structure and references to products, and batch-to-product references.
- Add regression tests for restored tables and legacy backup parsing.

## Important limitations / Stage 2 blockers
- A stock-count session uses `companyId` alongside `businessProfileId` on new saves. Legacy sessions may lack the latter field; restore cleanup is therefore based on `companyId` rather than solely on a Dexie index.
- Full TypeScript typecheck, Vitest and browser integration were not run because project dependencies are missing.
- Service-item rules, UI wiring for variants/import/counts, stock quantity and unit conversion, and authoritative batch allocation across sales/purchases/reversals remain incomplete.
- Batch rows still represent metadata, not an independently reconciled inventory sub-ledger.

**Stage 2 not passed. Do not proceed to Stage 3.**
