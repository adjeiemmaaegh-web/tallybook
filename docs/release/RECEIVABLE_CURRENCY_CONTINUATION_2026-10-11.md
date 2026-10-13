# Tallybook V19 — customer receivable denomination-safety continuation

**Date:** 11 October 2026
**Starting source:** `TALLYBOOK_V19_REPAYMENT_UI_CONTINUATION_2026-10-11_SOURCE.zip`
**Verified starting SHA-256:** `9841d9a5f81a4d4dca3931d196676bb79f15ae5f8c9373727afe20461c4cb25d`
**Release:** **NO-GO / INCOMPLETE**. No external provider, hosting, staging, production or physical hardware testing authorized.

## Financial defect and implementation

The old customer receivable aggregation added all saved `outstandingMinor` and `repayment.amountMinor` values without a denomination policy. A newly saved GHS sale could be combined with a USD sale or an historical record with no saved currency; either case misstates balances and can cause inappropriate credit extension, partial repayment, or misleading currency-labelled reports. A configured customer credit limit was previously the only time checkout reconciled the existing customer debt; limit-free credit checkout bypassed that guard.

The scoped changes:

- New `inspectReceivableCurrency` checks safe integer amounts, optional uppercase three-letter currency snapshots, and whether the customer's **nonzero** monetary evidence can be expressed in one verified denomination. A mixture of known currencies or known and unknown nonzero debt/payment evidence is rejected, never converted using a guessed FX rate. Fully zero legacy records do not taint an otherwise verified debt.
- `reconcileCreditLedger` runs the denominator check before producing a numeric balance. Old all-unknown ledgers retain historical arithmetic *only for reads*; they are not newly labelled as GHS by the debt/sale summary display.
- `assertReceivableWriteCurrency` refuses a currency-denominated write if existing active debt has unknown denomination or a different known currency. `completeSale` checks this **inside the same database transaction** for every customer sale creating debt, even when no credit-limit policy exists. `recordRepayment` repeats the check inside its transaction before recording cash/card/MoMo collection. Cross-currency conversion is not implemented or assumed.
- Explicit per-sale allocations cannot join different or one-sided currencies. Both sides missing remains historical unknown, not backfilled. Backup import validates the whole customer's known/unknown denomination consistency, even if the repayment is unallocated; preexisting per-sale tamper checks remain.
- New sale and repayment inputs require a three-letter uppercase currency code. A retry of an older sale without currency evidence can no longer be acknowledged as equivalent to any user-supplied currency (no mutation of the original record).
- Customer debt and sale summary labels use the saved verified currency; all-unknown ledgers show the numeric **minor-unit** amount with `historical currency unverified`, never an implied current business currency. Existing company-wide sales/cash reports have *not* been fully redesigned to show per-currency totals; financial readiness is still blocked.

### Intentional conservative compatibility behavior

On customers whose older positive debts/repayments have no currency snapshot, new currency-denominated repayment/credit extension now fails closed until independently sourced evidence establishes the currency. A mixed known/unknown ledger is not displayed as one valid receivable balance. This can prevent operations that previously completed, but does not delete or fabricate history. No automatic conversion, historical backfill, currency policy mutation, provider charge, refund, stock restoration, or partial-return posting was introduced.

## Verification

- Verified incoming ZIP SHA-256 before extraction.
- Linux Node **v22.16.0**, OpenSSL 3.0.16: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` **237/237 passed**, zero fails/skips. Added **8** pure native tests covering matching currency, mixed GHS/USD, mixed known/legacy, zero old debt, invalid snapshots, linked mismatch, and read-only unknown handling. Prior 229/229.
- Isolated mock gateway test `node --test server/tests/paymentGateway.test.mjs`: **4/4 passed** (separate suite, not summed into 237).
- Six changed TypeScript/TS declaration files parsed without syntax errors using locally available TypeScript compiler API; this is **NOT** a TypeScript semantic check. Changed JavaScript module passed `node --check`.
- Authored **unexecuted** client Dexie/Vitest tests checking rollback/no new stock movement after cross-currency credit attempt, rejected foreign-currency repayment, unverified legacy display and blocked posting, unallocated cross-currency backup tampering.
- Pinned Node 24.19.0, pnpm 10.34.0, client dependencies unavailable. **NOT RUN:** pnpm test/check/build, Vitest, actual IndexedDB migrations, Playwright, physical/hardware/device QA, remote CI, staging, real gateway. Previous client test results apply only to an older snapshot.

Logs at `artifacts/continuation-2026-10-11-receivable-currency/`. New issue FIN-008 is **implemented-unverified**, not closed. All 82 acceptance units remain. Next priorities are pinned client suite, policy for verified legacy debt/currency evidence, split-by-currency report/cash snapshots, real atomic partial refunds with cost/batch/tax/tender/wallet/debt conservation, DATA-001/002 durable recovery, and SEC-001 complete staff authorization.
