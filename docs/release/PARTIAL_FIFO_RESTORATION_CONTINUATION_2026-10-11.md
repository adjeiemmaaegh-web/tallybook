# Tallybook V19 — Partial FIFO cost-restoration continuation

**Date:** 11 October 2026
**Release:** **NO-GO / INCOMPLETE**
**Input:** `TALLYBOOK_V19_RETURN_COMPONENTS_CONTINUATION_2026-10-11_SOURCE.zip`
**Verified input SHA-256:** `b8d9370f10486fcb2f1dbba8b2b371eda6b8c572c35ddb33d4540cf497e5cd1e`

## Source changes

- Added a **pure deterministic FIFO return-cost allocator**. For a sale issue spread over multiple historical receipt layers, each partial restock restores the original receipt costs in fixed FIFO allocation order. Cumulative partial restorations, up to full issued quantity, conserve original known and unknown cost evidence.
- Validates original issue identity, quantity/allocation totals, unique receipt identity, safe amounts, previously saved reversal events, company/product/sale links, overrestoration, alteration of receipt/unit cost evidence, and duplicate restoration identities. Does not guess missing historical costs.
- Inventory-cost reconstruction now accepts **multiple valid partial reversal cost events** linked to the same original sale issue. Existing exact full-sale reversal remains supported. `restoreInventoryCost` still blocks attempts to perform a new full reversal after any partial cost-restoration event.
- Added `restorePartialInventoryCost` as a **transaction-only inventory-cost helper**, with caller-required atomic stock movement, batch-disposition, refund/credit/debt/loyalty/tender event, staff audit and idempotency. No UI route calls it yet; it must **not** be used as a standalone partial refund.
- Added twelve native tests, plus one client Dexie test covering partial allocation, transaction rollback and rejection of an orphan cost event by financial reporting; the client test was written but **not run**.

**Critical scope limit:** **Actual partial-sale return/refund financial posting remains unimplemented.** Partial stock events have no authorized caller until full cross-ledger return events and reconciliation are implemented. The independent cost reconciliation intentionally rejects unmatched partial cost reversals; no user-facing refund or retail ledger mutation was enabled. No schema change or historical backfill was attempted.

## Evidence / limitations

| Test or check | Result |
|---|---|
| Input archive SHA-256 | **MATCH** |
| Linux Node 22.16.0 full native QA | **300/300 passed, zero failures/skips** (`artifacts/continuation-2026-10-11-partial-fifo/native-final.log`) |
| Isolated mock-payment suite | **4/4 passed**, simulated only |
| JS syntax + changed TS syntax parsing | **Passed** |
| Client Vitest/IndexedDB, semantic TypeScript, pinned Node 24/pnpm, production build/Playwright | **NOT RUN** — dependencies/pinned toolchain unavailable |
| True refund posting, stock batches, tax, tender, wallet and debt | **NOT IMPLEMENTED**; do not assert financial readiness |

The full 82-unit traceability register is preserved. The issue register now includes `FIN-012` implemented-unverified (36 issues); existing full-release blockers remain open. Never deploy or initiate real payment/staging without owner approval.

Next continuation must begin from this new archive. Priority: real atomic partial return/refund posting with durable original sale/line links, stock/FIFO and batch disposition, tax, wallet/points, customer debt, cash/provider action separation, cross-period reporting and reliable interruption recovery; execute full client test gates whenever possible.
