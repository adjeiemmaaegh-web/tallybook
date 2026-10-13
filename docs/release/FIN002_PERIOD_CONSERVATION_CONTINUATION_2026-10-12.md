# Tallybook V19 — FIN-002 period/daily report conservation increment (12 October 2026)

**Decision: NO-GO / INCOMPLETE.** This work is a local, read-only report integrity increment; it is not accounting certification, statutory tax compliance or a posted financial transaction.

## Baseline

Verified the complete previous `TALLYBOOK_V19_FIN002_PREPAID_CONTINUATION_2026-10-12_SOURCE.zip`, SHA-256 `23865bb9d23d4d7a640115c849c1d1fec6fc30e4fb6c477f371c1ad7b385f327`, containing 995 files. Preserved all previous source and QA evidence. Source ZIPs contain no original `.git` history; any local review commit made from these ZIPs is a newly imported copy, not an original development commit.

## Root cause and implementation

The Stage 3 management report calculates headline revenue/collections/expenses using checked monetary reducers, but **daily rows and expense-category breakdowns were independently accumulated with unchecked JavaScript `+=` operations**. A corrupt saved history could make a daily or category total exceed safe-integer precision, or contain an invalid date outside the selected range so it quietly disappears. The final headline's safe-integer check could not certify those separate display sums.

- Added independent, pure `financialPeriodConservation.mjs` and typed declaration, reconstructing every selected sale, reversal, original wallet-offset, saved sale payment, customer repayment, cash partial refund, prepaid deposit/refund and expense into per-day entries using exact `BigInt` arithmetic. The resulting daily revenue/collections/expenses must reconcile **exactly** to the headline period totals.
- Each daily and category accumulator rejects unsafe intermediate arithmetic, even if later opposite-sign records would hide it. Reversal wallet spending is not counted as cash when the original reversal includes the offset; no new funds or costs are inferred.
- Full-history dates are verified before any period filter. Missing/invalid original posting timestamps and invalid expense calendar dates (such as February 30) now fail closed, including for records outside the selected period. Original expense date remains distinct from record creation time.
- `summarizeFinancials` now consumes the reconstructed, independently checked daily and expense-category rows instead of the unchecked legacy reducers. Existing headline formula and cash/payable presentation are unchanged. No historical records are rewritten.

## Executed evidence

- Linux Node.js 22.16.0, OpenSSL, native suite: **449/449 passed, 0 failed, 0 skipped**, up from the verified **440/440** baseline; 9 new independent native tests including multi-day conservation, credits/reversals, unsafe intermediate, malformed historical dates, and bad category/link evidence. `artifacts/fin002-period-2026-10-12/native-full.log`.
- Separate, disabled-by-default local mock gateway: **4/4 passed**, not a real payment test. `artifacts/fin002-period-2026-10-12/mock-gateway.log`.
- JS syntax and three changed TS/test/declaration files parsed; standalone strict semantic declaration typecheck passed. `artifacts/fin002-period-2026-10-12/ts-syntax.log` and `isolated-types.log`.
- Isolated transpiled `summarizeFinancials` smoke using the actual modified report source and the real period-conservation module passed for a two-day sale/payment/expense scenario. This is only a smoke check with dependencies stubbed, **not** real client, tax or IndexedDB acceptance. `artifacts/fin002-period-2026-10-12/isolated-summary-smoke.log`.
- Full repository `tsc --noEmit` **failed before source semantics could run** due absent `node` and `vite/client` type definitions. `artifacts/fin002-period-2026-10-12/tsc-full.log`.
- Added three Vitest integration tests for full `summarizeFinancials`, but **they were NOT EXECUTED**: project dependencies/pnpm and pinned Node24 remain unavailable; client IndexedDB, browser, production build, actual device dates, tax and payment-provider checks were NOT RUN.

## Acceptance and limitations

FIN-002 remains **missing (P0 broad gate)** because independent accounting over all sources, owner-provided statutory tax/registration policy, refund coverage, legacy-currency reconciliation and full client verification remain incomplete. Current single-currency reporting may be unavailable for historical incomplete evidence; no guessing/backfill or automatic tax rate is permitted. The original **82 acceptance units**, **47 tracked issues** and their states remain unchanged. No external staging, payment or production deployment is authorized. Use the newest archive from this increment for further work, never the earlier prepaid/currency/reconciliation ZIPs.
