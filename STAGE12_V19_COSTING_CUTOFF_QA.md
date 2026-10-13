# Stage 12 — Historical cost cutoff hardening (2026-10-10)

## Source changes
- `client/src/features/inventory/historicalCosting.ts`: optional `asOf` cutoff excludes later receipts from historical cost previews; validates the cutoff and sorts FIFO by parsed UTC timestamps rather than lexical date strings (timezone offsets can change sort order).
- `scripts/historical-costing-check.mjs`: 3 additional tests covering future-dated receipts, malformed cutoffs, and timezone-offset FIFO ordering.

## Executed validation
- `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` — **152 passed, 0 failed**.
- `npm run check` — blocked by missing type declarations / incomplete installed dependencies; inspect `typecheck.log` in companion QA context.
- `npm run build` — blocked by missing Vite.

## Safety constraints and remaining blockers
This remains a **read-only preview**: no purchase receipt history is persisted by this change, no atomic sale-line cost allocation is recorded, and no authoritative COGS or gross profit is generated. An `asOf` date cannot reconstruct historical remaining units from today's remaining quantities. Full historical inventory ledger, purchase/return adjustments, unit conversions, atomic allocation, reversal handling and real IndexedDB integration are still mandatory. Other Stage 5–11 blockers and full production QA remain unresolved. Not release-certified.
