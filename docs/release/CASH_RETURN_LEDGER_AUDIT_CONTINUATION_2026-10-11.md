# Tallybook V19 — Whole-ledger cash-return stock and FIFO audit (11 October 2026)

## Starting point and boundaries

Input was `TALLYBOOK_V19_CASH_RETURN_LINKS_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `f6d1c35da080a71adaa5495e7cca0d1700cb38b63050ac79a829d89d12932bb8` (837 file paths). The previous cash-return review already checked a selected sale and refund posting checked earlier returns inside its write transaction; neither standalone backup parsing nor the whole-company integrity audit reused that physical/FIFO check. This increment leaves the Sales UI strictly read-only.

## Implemented

- Added pure `assertCashReturnLedgerLinks`: indexes a saved ledger snapshot, identifies every original sale with recorded cash returns, validates matching physical movement and immutable original FIFO receipt-layer restoration with the existing per-sale validator, rejects missing originals, malformed/duplicate event identities and cross-sale re-use of movement/cost identifiers. It reads but never rewrites data.
- `parseBackup` now rejects a saved cash return that has financial evidence but mismatched, missing, foreign or duplicated stock/FIFO links, before permitting import.
- `auditLocalIntegrity` reads inventory cost events in its existing read transaction and reports a separate `cash-partial-return-stock-integrity` issue when a return's physical/FIFO evidence cannot reconcile. The auditor preserves the ledger.
- Added eight Node native tests spanning two businesses, missing physical movement, tampered FIFO cost, foreign company, orphan sale, reused identities, duplicated snapshots, no mutation, and invalid input; two unexecuted client IndexedDB/backup tests.

## Local execution

- Linux Node 22.16.0 native command: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` — **333 passed, 0 failed, 0 skipped**, see `native-full.log`.
- Isolated mock payment: `node --test server/tests/paymentGateway.test.mjs` — **4 passed**.
- Changed TypeScript/declaration syntactic parsing — **4 files with zero parse errors**.
- Semantic `tsc --noEmit` — **FAILED / NOT VERIFIED** due missing `node` and `vite/client` definitions. Pinned Node 24, pnpm, client Vitest, build, Playwright, actual IndexedDB/migration and cross-tab verification unavailable; cannot claim they passed.

## Release decision and next work

**NO-GO / INCOMPLETE.** No real money moved and no live refunds are authorized. Posting control is still disconnected from the UI. Test the changed backup and audit paths in real IndexedDB, verify migration and mixed-company restores, then address SEC-001, DATA-002 cross-tab crash recovery, and customer/provider/wallet/batch refunds. Preserve unknown historical costs, currencies, tax and payment evidence.
