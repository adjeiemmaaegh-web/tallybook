# Original credit terms and receivables ageing

Implements S11-04 for the local application. New customer credit sales save the original payment-day policy and UTC due date in the same transaction as checkout. Missing policy is explicitly unknown. Changing a policy does not edit past sales. The additive optional sale field needs no IndexedDB version bump; historical records are unchanged. Central event and backup validation reject inconsistent saved terms.

Financial Intelligence and its CSV show current/due-today, 1–30, 31–60, 61–90 and over-90-day balances. Exact sale-linked repayments reduce their target debt; full reversals remove the original exposure. Unknown original terms remain separate. A customer's remaining balance with historical unallocated repayments is shown as allocation unknown rather than assigned arbitrarily. Currency groups never mix; unknown currency amounts are excluded and counted. Buckets must sum exactly to remaining debt. This is a current saved-history UTC-date report, not historical reconstruction at a selected period end or a legal overdue determination.

## Evidence

- Native ageing/terms: 7/7 passed (`artifacts/receivable-ageing-native.log`).
- Checkout and financial reporting: 44/44 passed (`artifacts/receivable-ageing-client.log`). The new fixture first failed due to an invalid phone, then a zero-payment cash method. Both fixture errors were corrected without changing application validation.
- TypeScript semantic check passed (`artifacts/receivable-ageing-types.log`; empty output, exit 0).
- Vite/PWA production build passed (`artifacts/receivable-ageing-build.log`); existing chunk/import warnings remain.

Reproduce with `node --test client/src/features/reports/tests/receivableAgeing.test.mjs`, `vitest run client/src/features/sales/sales.test.ts client/src/features/reports/financialIntelligence.test.ts --maxWorkers=1 --no-file-parallelism`, `tsc --noEmit`, and `vite build`. On this Windows workspace Vitest uses `artifacts/qa-temp` for TEMP/TMP.

Hands-on acceptance, representative customer backup validation and a full-suite rerun are not claimed by this increment. S11-04 is implemented-unverified, not fully accepted. Main and production deployment are unchanged.
