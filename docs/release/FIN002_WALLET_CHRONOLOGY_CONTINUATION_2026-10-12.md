# FIN-002 — prepaid-wallet chronological reconciliation continuation (12 October 2026)

## Baseline and scope

The immediate input was `TALLYBOOK_V19_FIN002_DATES_CONTINUATION_2026-10-12_SOURCE.zip`, SHA-256 `83e80ac2bcd650c61c8c51079a0ba0ae91c28124d7aacebabc6a12a7973e4bd9`, verified with ZIP CRC (1,014 members). This is a **read-only** financial-audit correction: no historical rows were rewritten, no money transferred, no return service activated, no changes to default disabled tax, provider, or deployment decisions.

## Root cause, reproduction, fix

`prepaidLiabilityReconciliation.mjs` grouped events by literal `createdAt` string before checking that a customer's wallet balance never became negative. The same physical instant can have two different valid ISO spellings (`2026-10-09T10:00:00.000Z` and `2026-10-09T12:00:00+02:00`). Because literal strings formed different groups, the algorithm could process a debit before its simultaneous deposit and incorrectly reject intact wallet history depending on record order. This was reproduced with a new failing native regression, retained as `focused-before.log`.

The reconciliation now groups events by **parsed epoch milliseconds per customer**, treating offset-equivalent dates as one event time, with an exact BigInt net movement. It continues to reject a genuine one-millisecond-before-credit overdraft. The standalone wallet audit also reuses the FIN-002 strict ISO posting-timestamp validator to reject impossible calendar dates, e.g. normalized February 30, including wallet benefit entry timestamps; this was another proven failing regression. Original transfer-to-benefit immutable timestamp equality remains exact and unchanged.

Files: `client/src/features/reports/prepaidLiabilityReconciliation.mjs`, `client/src/features/reports/financialPeriodConservation.mjs`, `client/src/features/reports/financialPeriodConservation.d.mts`, `qa/fin002-prepaid-liability.test.mjs`. Added three native tests; no ledger schema changes.

## Executed local QA

- Linux Node v22.16.0, OpenSSL available. Full native suite `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`: **457 passed, zero failed/skipped** (previous baseline 454). `artifacts/fin002-wallet-chronology-2026-10-12/native-full.log`.
- Separate disabled-by-default simulated gateway `node --test server/tests/paymentGateway.test.mjs`: **4/4 passed**; no external payment. `mock-gateway.log`.
- Focused wallet QA `node --test qa/fin002-prepaid-liability.test.mjs`: **12/12 passed** under both `TZ=Asia/Dubai` and `TZ=Africa/Accra`. New regression failed before the fix (`focused-before.log`), and passes after (`focused-after.log`).
- Source syntax: `node --check` on both changed `.mjs` files: passed. Isolated strict `tsc` on `financialPeriodConservation.d.mts`: passed (`isolated-types.log`).
- Full-project `tsc --noEmit -p tsconfig.json`: **not passed**, missing Node and Vite/client type definitions (`tsc-full.log`); AST write-path audit unavailable because local TypeScript module is missing (`write-path-audit.log`). pnpm/pinned Node 24/client Vitest/real IndexedDB/build/browser/hardware were **not executed**; this session made no claims about them.

## Release and follow-up

This addresses a bounded FIN-002 false-positive and a malformed-date acceptance defect. The broad FIN-002 status remains **missing** pending full accounting reconciliation, owner-configured tax requirements and client/runtime tests. The 82 acceptance units retain their statuses, 47 issues retain their statuses, release decision remains **NO-GO / INCOMPLETE**. Continue from the archive created for this increment; do not revert to FIN002_DATES or older. No external staging, deployment, payment or provider setup is authorized.
