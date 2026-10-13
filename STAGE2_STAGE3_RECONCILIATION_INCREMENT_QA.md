# Tallybook — Stage 2/3 reconciliation increment

Status: PARTIAL IMPLEMENTATION / NOT CERTIFIED. Original branches were compared, not blindly replaced. Baseline is the locally available Stage 8 Build 23 snapshot (its promotion/origin remains subject to verification). This is a new development candidate, not a Stage 2/3 full merge certificate.

## Change
- Hardened Stage 3 financial management summaries against duplicate wallet transfer IDs, reused submission keys, missing identifiers, invalid cash movement kinds, fractional/negative/unsafe monetary values, and invalid transfer timestamps.
- Validates all company-scoped transfer records, including records outside the selected reporting window, to avoid hiding damaged historical data.
- Added four Vitest cases and an independently executable Node check using a TypeScript transpilation harness and mocked imports (only pure calculations; no IndexedDB).
- Retained the latest baseline's Stage 2 stock counts, batch metadata, catalogue changes, Stage 3 integrity checks, subsequent security controls, wallet reporting and Stage 8 additions. Older branches are not substituted for current files.

## Evidence executed
- `node --test qa_stage23_financial.cjs`: **4 passed, 0 failed**.
- `node --test server/tests/*.test.mjs`: **109 passed, 0 failed**.
- `npm test`, `npm run check`, `npm run build`: not considered passed; full dependencies unavailable in this local checkout.
- Full IndexedDB, browser, cost basis/COGS, migrations, real payment/return and integration verification: NOT EXECUTED.

## Remaining implementation blockers
- Stage 2 batch tracking is metadata until FIFO allocation happens atomically at sale; historical acquisition cost basis is not established.
- Stage 3 still declares COGS/gross profit/supplier payables unavailable. No fabricated profit figures were introduced.
- Source manifest has 167 file differences across available branch snapshots, 22 sensitive paths (some are later-stage additions; not all represent conflicting edits). Financial intelligence differs by design due to later wallet support and staff authorization.
- Need Work/full runtime for semantic TypeScript, full Vitest/Vite, migration tests and multi-company financial integration before any full merge certification.

## Boundary
Do not use this build as production-ready. Stage 8 and Stage 9 scope is unchanged.
