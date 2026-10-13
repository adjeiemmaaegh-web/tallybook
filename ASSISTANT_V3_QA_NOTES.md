# Assistant V3 — compound transaction safety QA increment

## Implemented
- New `transactionSafety.ts` guards the single-item parser against silently dropping second products expressed as `and 3 ...` or `plus 6 ...` in sales and stock receipts.
- Added the safeguard to the assistant request pathway before interpreting a single transaction. A flagged request produces an instruction to split lines and does not prepare a financial write.
- Existing batch parsing, customer context, follow-up memory, ambiguity checking, and explicit confirmation were preserved.
- Added focused regression tests, including an assistant-level test asserting that a compound sale cannot generate a preview or alter the ledger.

## Verification
- Source and tests pass TypeScript syntax transpilation.
- Direct runtime smoke checks passed for two compound and two non-compound utterances.
- Full Vitest, type checking, production build and browser tests were not executed: this environment lacks the project's dependencies.

## Remaining work before claiming a complete conversational upgrade
- Expand natural language parsing to safely handle arbitrary multi-product receipts/sales as true multi-line items, carrying shared payment/customer context explicitly.
- End-to-end tests for ambiguous customer/product names, partial repayments, balance reconciliation and offline voice on real devices.
- Install dependencies with the supported Node/pnpm versions and run `pnpm test`, `pnpm check`, `pnpm build` and browser checks.
