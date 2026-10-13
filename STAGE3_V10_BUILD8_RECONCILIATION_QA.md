# V10 Stage 3 — reporting integrity increment

Branch baseline: tallybook-v10-stage3-parallel-development.zip. This is an independent financial-reporting branch, not a merge of Manus V9 inventory work.

## Implementation
- Report calculation now refuses to mask negative customer receivables (over-repayments or reversed debt) as zero. Shows an explicit reconciliation failure instead.
- Rejects negative or unsafe integer sale, payment, repayment, or expense amounts, and checks computed net-cash movement for safe integer precision.
- Added regression cases for negative receivables and malformed money.

## Tests performed
- Modified TypeScript source and test files transpile without parser diagnostics.
- Five isolated runtime checks passed using transpiled reporting-engine code (not Vitest): normal receivables, over-repayments, negative amount, unsafe integer, CSV disclaimer.

## Deferred
- Full Vitest suite; complete typecheck and Vite production build (project dependencies unavailable).
- Browser/IndexedDB tests, V9 merge, authoritative historical COGS, tax and payable integration. Stage 3 is not complete or production certified.
