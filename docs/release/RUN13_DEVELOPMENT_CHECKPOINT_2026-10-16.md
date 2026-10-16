# Tallybook V19 — Run 13 source-development checkpoint (NOT COMPLETE)

Date: 2026-10-16
Parent: Run 12 commit `00d130d0c883f37b3dedbdda08a0888ac7bae050`
Branch: `v19/run13-multistore-development-20261016`

## Owner instruction: QA deferred
No test executions, CI re-runs, browser verification, Windows checks, or acceptance claims are permitted during this development-only checkpoint. Review can identify obvious source defects but cannot establish that the code is defect-free. Runs 2–12 remain unaccepted; commercial release NO-GO.

## Changes in this checkpoint
Added `client/src/features/stores/run13StockConservation.mjs`, a **read-only** deterministic preflight for planned per-store opening allocations and ordered transfers. It validates company ownership of all provided stores and products, duplicate IDs, active-store allocation targets, safe integer quantities, aggregate allocations not exceeding current company stock, distinct transfer endpoints, transfer identity uniqueness, source sufficiency and destination overflow. Returns explicit unallocated company quantity and proposed per-store balances. It returns `authoritative: false` by design.

## Strict safety boundary
This module is NOT wired to a financial/stock posting command. It does not alter Dexie, adjust `Product.stockQuantity`, activate `STAGE9_RELEASE_SCOPE.executeStoreTransfer`, or imply physical stock counts are ledger evidence. The existing store transfer requests remain requests only. No cross-device store-attendant checkout is enabled.

## Work still required to complete Run 13
1. Explicit company-approved stock allocation migration / original stock reconciliation with write-ahead and crash-recovery protections.
2. Authenticated, same-company owner/supervisor store assignment and cashier write scope inside the posting transaction.
3. Atomic, idempotent store-to-store stock transfer journal, correct source/destination conservation, concurrency guards and audit.
4. Store-scoped sale, purchase, refund and FIFO cost integration without mutating company-wide amounts twice.
5. Restore/export and management reporting support for new store journals; integrity rejection before restore mutations.
6. UI integration and complete companion automated tests, authored without execution while testing remains on hold.

## Quality declaration
No tests were run. No CI status is being interpreted as a Run 13 test outcome. No release blockers or acceptance units are closed. This is a limited **source checkpoint**, not a completed Run 13 stage and not a release.


## Continuation — read-only planning integration
Added `client/src/features/stores/run13StorePlanning.ts`, which reads company-scoped stores and stock products in one read transaction, performs report permission checks, and refuses company changes or foreign records. Hypothetical store allocations and transfer plans are never persisted. The planning output says `plannedOnly: true`, `authoritative: false`, and `companyStockUnchanged: true`. Physical observations and transfer requests are still not usable as authoritative stock postings.

Added `run13StockConservation.d.mts` for the pure module's TypeScript boundary and `run13StockConservation.test.ts` with ten authored **unexecuted** positive and negative regression cases. These cases have NOT passed or failed; no runner was invoked.

The source was reviewed for obvious integration assumptions only. Without a test/build environment, compilation, IndexedDB behavior and release correctness remain unverified.

**Run 13 remains IN DEVELOPMENT. The stage is not delivered or accepted.**


## Continuation — proposed transfer journal reducer
Added `run13TransferJournal.mjs` with `run13TransferJournal.d.mts` to validate hypothetical append-only transfer events. It rejects duplicate event IDs and submission keys, mismatched company identity, invalid timestamps and quantities, conflicting same-key intents, and moves exceeding allocated store stock. The reducer uses `run13StockConservation.mjs` so proposed movements conserve quantities. It **does not** verify saved staff/store assignments, bind request IDs to persisted requests, write any Dexie table, approve physical delivery, or authorize payment/checkout. No live transfer posting was enabled.

One attempt to commit additional test cases was blocked by the connector. Those cases are not in the repository; no tests were executed. The earlier ten authored cases remain unexecuted. Run 13 is still **partial source development, not delivered**.
