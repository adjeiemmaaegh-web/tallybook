# Tallybook V19 — per-sale repayment evidence continuation (2026-10-10)

**Owner-authorized local work. Release: NO-GO / INCOMPLETE.** Starting point: `TALLYBOOK_V19_RETURN_SAFETY_CONTINUATION_2026-10-10_SOURCE.zip`, SHA-256 `0e3de05debc4246a211eac13113b543bed7545e10f5535e1f9081d35089fda48`. The source archive is verified prior to modification. Historical commits in the original worktree are not available in this source-only ZIP; local review history below is newly initialized, not claimed original history.

## Bounded implementation

- Extended `DebtRepayment` with *optional* immutable `saleAllocations: [{saleId, amountMinor}]`. The existing customer-level repayment form continues to generate unallocated records; no historical payment allocation is guessed. This increment supplies a validated service/API field, **not a new interactive repayment allocation picker**.
- The save boundary validates allocation sums against exactly the recorded payment, sale ownership (customer + company), cumulative amounts against each original sale's unpaid amount, no duplicate/missing/reversed sales and safe minor-unit integers. Entire verification and insert are in the existing authorized Dexie write transaction. Replay of a submission key must match the allocation as well as amount/customer/method/note; otherwise it is rejected.
- Customer credit exposure uses the same immutable-record allocation checks as customer balance reports. The reversal guard permits an unpaid sale's reversal only when **all** customer repayments are explicitly allocated and none applies to the sale being reversed. Any unallocated historical customer payment remains a fail-closed blocker. A repayment linked to the target sale also blocks reversal (refund/settlement adjustment remains separate).
- Validates newly allocated repayments in backup parsing against saved customer sales/reversals; preserving backwards compatibility for historical unallocated repayment rows. No database schema version increase is needed: allocations are optional embedded fields on the existing repayment records.
- Strengthened amount input bound to reject unsafe minor-unit amounts. Original sale currency still is not persisted universally, so the whole cross-currency debt policy remains unfinished.

## Verification boundary

- Linux Node 22.16.0, OpenSSL 3.5.5: full `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` **217/217 passed, 0 failures and 0 skips**, including 14 new native explicit allocation tests (`qa/stage12-repayment-allocations.test.mjs`).
- Mock gateway `node --test server/tests/paymentGateway.test.mjs`: separately recorded, not a real gateway.
- TypeScript syntax parsed using locally installed global TypeScript 5.8.3; JavaScript `node --check` passed. These are **not semantic typecheck or client runtime tests**.
- Added unexecuted actual Dexie/Vitest tests for allocated repayment persistence, authorization, key replay, actual different-sale reversal, invalid allocations, and backup parsing. Project dependency folders/pnpm/Node24 pin absent; client tests, semantic `pnpm check`, `pnpm build`, Playwright and real IndexedDB migration/device acceptance **not run**. Historical handover evidence does not certify current files.

## What is still not implemented

No customer-facing allocation selection UI, no guided reallocation of legacy repayments, no partial-return/refund posting or tax/wallet/cost/batch/tender settlement, no provider refund, no historical currency/sale due-date reconstruction, no cross-database crash recovery, no cloud authoritative multi-store or external test environment. Future per-sale repayment allocation must account for refunds/returns and credit notes, ensure currency consistency, and remain auditable when client migrations and backup/recovery are executed. Financial, SEC-001, DATA-001/002, and the other 12-stage release gates remain open.
