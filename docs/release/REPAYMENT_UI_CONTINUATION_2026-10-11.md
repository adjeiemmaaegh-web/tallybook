# Tallybook V19 — local repayment selection and currency evidence increment

**Date:** 11 October 2026
**Starting source:** `TALLYBOOK_V19_REPAYMENT_ALLOCATION_CONTINUATION_2026-10-10_SOURCE.zip`
**Verified starting SHA-256:** `58c4477864e030f786386a4115d34cbb12227af8cbbd96e1183e22b4cb3e666d`
**Release decision:** **NO-GO / INCOMPLETE**. Development was local; no staging, provider, hardware, external accounts, live payments, or real customer data were accessed.

## Implemented source behavior

- New sales capture optional historical-safe `Sale.currency` as the checkout-request currency. New repayment entries capture `DebtRepayment.currency` similarly; both remain **absent/unknown** on historical records. Neither change creates a new schema migration.
- `getRepaymentTargetsFromLedger` is a pure selection policy with explicit company/customer/currency identity. It reconstructs credit and per-sale allocated debt, excludes reversed/fully paid/wrong-currency/unknown-currency sales, rejects invalid customer records and missing receipt identity, and **blocks new links if any legacy unallocated customer repayments exist**. Old entries are never reallocated.
- `getCustomerRepaymentTargets` provides scoped read-only target options, and `recordRepayment` repeats every relevant sale, allocation, and old-payment check inside the actual Dexie write transaction. Sale-link attempts against stale, foreign, refunded, or insufficiently supported records fail before writing a repayment. Replay of a new repayment with the same submission key but changed currency is rejected.
- The Customers page now offers an **optional, single-sale, entire-amount** selection. The default continues to be "customer balance (not assigned to a sale)". A linked payment must fit that sale's remaining saved debt. A missing/corrupt option fetch does not create an allocation. The form uses exact minor-unit parsing instead of binary-floating-point preview rounding. No historical debt allocation is fabricated.
- Backup parsing now checks that present currency snapshots are three-letter codes and that saved explicitly allocated repayments do not contradict a known sale currency; absent historical snapshots remain allowed.
- Native pure projection QA added twelve tests; client IndexedDB/Vitest and backup tests were **authored but not executed** in this environment.

## Testing and limitations

| Check | Actual result |
|---|---|
| Original ZIP identity | Verified SHA-256 above |
| Full native Node/QA suite (Linux Node 22.16.0, OpenSSL) | **229/229 passed, zero failed/skipped** |
| Newly added pure projection tests | **12 passed** |
| Mock payment gateway (separate command) | **4/4 passed** |
| TypeScript/TSX syntax-only parse | Seven source/test files parsed; **not a semantic type check** |
| Updated JS module syntax | `node --check` passed |
| Client semantic TypeScript/Vitest/Dexie | **NOT RUN**: dependency tree/pinned pnpm and Node 24 unavailable |
| Client Vite build, IndexedDB migration and Playwright PWA | **NOT RUN** |
| Physical, staging, TLS deployment, actual provider | **NOT RUN / not authorized** |

Native full command: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`. Logs are under `artifacts/continuation-2026-10-11-repayment-ui/`. These counts do **not** include client tests or the isolated mock gateway suite.

**Known scope boundaries:** This increment does not implement splitting one payment across multiple sales in the UI (the underlying service accepts validated splits), backfilling unverifiable old repayments, cross-currency debt reconciliation, historical invoices with unknown original currency, explicit due dates/ageing, atomic posted partial refunds, provider refunds, stock/cost/tax/wallet/tender conservation on returns, or crash-safe cross-database restore. The stored currency is the requested currency; a separate business-currency authorization and historical-currency policy are still needed. For legacy customers with unallocated payments the UI permits only customer-level repayments, even where newer entries have exact sale links. The payment collection itself remains manual and is not a verified external gateway receipt.

**Next executable gates:** Obtain a permitted pinned Node 24/pnpm environment with installed locked dependencies; run frozen install, `pnpm test`, `pnpm check`, `pnpm build`, browser migration/PWA suites; inspect new React and Dexie tests and fix any failures. Then prioritize actual partial-return ledger transactions, DATA-001/002 durable recoverability and full cash/currency reconciliation. Preserve the 82 acceptance units and unresolved release blockers; keep the release NO-GO.
