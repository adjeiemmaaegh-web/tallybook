# Tallybook V19 — finance and scoped authorization continuation (10 October 2026)

**Decision: NO-GO / INCOMPLETE.** This is a new local, source-only increment from `TALLYBOOK_V19_NEXT_SECURITY_2026-10-10_SOURCE.zip` (SHA-256 `127eeff863232c91b8e84f7020f2308bdf421312c51e4308c0671347fd58cbfc`), not a rebuild from the original V19 handover. No external account, payment, cloud service, production data, staging host or hardware was used or authorized. All 82 original acceptance units remain in the roadmap.

## Confirmed defect and corrected behavior (FIN-003, FIN-002)

The saved `SaleReversal.reversedOutstandingMinor` contract is a **negative** amount. `checkedCreditExposure` previously called a nonnegative-only sum on those saved reversal deltas, so a customer with a valid fully reversed credit sale was blocked from further credit sales when a credit limit was configured. The previous native unit test used a **positive** reversal and hid the mismatch. A separate customer sale summary also displayed gross unpaid sales without subtracting immutable repayments and reversals. The management debt report used `Math.max(0, ...)`, hiding negative inconsistency.

A shared, read-only customer ledger reconciling sales, exact full-sale reversals and repayments now handles those signs consistently. It rejects missing/duplicate sale IDs, orphan/duplicate/wrong-value full reversals, customer mislinks, malformed minor amounts, over-repayment and safe-integer overflow. Checkout credit-limit checks, read-only customer summaries, repayment guards and management debts reuse that helper; balances are never silently floored to zero. The sale summary and customer debt summary now read related tables inside a single read transaction. No partial refund or supplier settlement ledger was invented.

## Additional authorization updates (SEC-001)

Supplier creation, modification and archival now run permission revalidation and company checks inside the same IndexedDB transaction as uniqueness checks and writes. Concurrent normalized-name supplier creation is serialized; when a staff identity exists, the mutation records the actual actor in a staff audit. Credit repayments similarly revalidate permissions and shift inside the write transaction, with staff tables included. This preserves the authorized no-staff local retail path. A stock movement in completed purchase now retains the captured target company ID rather than re-reading the active company after asynchronous work.

## Executed QA and limits

- Environment: Linux x86_64, Node `v22.16.0`, OpenSSL available; repository pins Node `24.19.0` and pnpm `10.34.0`.
- Full available native test suite: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` **173 passed / 173 total, 0 failures, 0 skips**, command exit code **0**. See `artifacts/continuation-2026-10-10-finance/native-full.log` and `native-result.txt`.
- Rewritten pure customer ledger suite includes seven native tests, covering exact negative reversal, credit reopening, overpayment, duplicate/orphan/mismatched reversal, safe arithmetic, and settlement.
- Source-only TypeScript parser checks (seven changed TS declaration/source/test files): zero syntax errors. Node syntax checks for changed `.mjs` files: pass. This is **not a semantic `tsc` check**.
- New IndexedDB/Vitest integration tests test consistent customer balances, an authentic full reversal reopening credit, and two simultaneous supplier submissions. These tests have **not run**, because the handover excludes `node_modules`, pnpm is unavailable, and the project-pinned Node is unavailable here. Consequently the integrated client paths are `implemented-unverified`, not fully accepted.
- Vite production build, Chromium/Playwright, pin-matched package audit, device, large-history, crash, and external suites were **not run**. Earlier historical client passes do not apply to this changed source.

## Unresolved priorities

`FIN-001/FIN-002`: partial item returns/refunds with exact stock/cost/tax/tender/benefit adjustments; batch and unit costing; supplier payable settlement and opening liability; full independent accounting reconciliation; historical cost evidence and authoritative currency precision. `SEC-001`: exhaustive actor, tenant and write-entrypoint coverage. `DATA-001/DATA-002`: complete historical migrations, malformed backup and durable cross-database interruption recovery. Cloud replay, authoritative stores, signed live payments, trusted public commerce, hardware and approved staging remain blocked/incomplete. Do not activate those integrations or declare production ready.

**Next feasible work:** execute pinned client Vitest/type/build/browser checks as soon as dependencies are available, fix any failures, then resume partial-return/settlement modeling, the full write-audit inventory, and crash-safe recovery. Real payment/provider and staging gates remain separate owner decisions.
