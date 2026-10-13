# Tallybook V8 Stage 1 — Build 4 QA notes

## Implemented
- A repeated checkout submission key is accepted only when its saved product IDs/quantities, customer, discount, payment amount/method and Mobile Money details match the previous committed checkout.
- Changed submissions using the same key fail before any financial write. Existing correct retries return the original sale and receipt.
- A missing receipt in an otherwise saved checkout is surfaced as a recovery error rather than hidden by a non-null assertion.
- Checkout timeout and unexpected failure messages no longer assure the cashier that nothing was saved when commit status may be unknown; cashier is directed to recent sales.
- Added ledger regression tests for changed carts and changed partial payments.

## Verification still required
- Vitest, TypeScript typecheck and production build (project dependencies not available in this environment).
- Browser offline/online cycles, phone camera permissions, receipt printing and retry under artificial IndexedDB delay.
- Important: the current Promise.race timeout does not cancel the underlying IndexedDB transaction. Cashiers must verify recent sales after a timeout; keep the same checkout key on retries.

## Next Build 5
- Durable pending checkout journal/recovery flow surviving browser reload; receipt/thermal-printer adapter and real device QA.
