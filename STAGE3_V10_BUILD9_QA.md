# Stage 3 V10 — Build 9, ledger relationship integrity

This build extends the read-only financial reporting calculation to detect duplicate sale IDs, payments referencing absent sales, mismatched payment/customer references, and duplicate or amount-mismatched sale reversals. Checks run on the full company-scoped snapshot, before period filtering, because current receivables depend on all historical records.

## Verified here
- TypeScript syntax parsing for both changed source/test files.
- Seven isolated runtime checks executing the transpiled reporting calculation with controlled records.
- ZIP structural integrity.

## Deferred
- Vitest suite and production Vite build (application dependencies unavailable in current runtime).
- Real IndexedDB fixtures, migration QA, browser interaction, and Stage 2 costing integration.

## Caveat
The new integrity boundary intentionally refuses financial reports if historical records include orphan payments or incorrect reversals; these conditions should be investigated rather than automatically repaired. This build is a Stage 3 branch and must not overwrite Manus's Stage 2 work.
