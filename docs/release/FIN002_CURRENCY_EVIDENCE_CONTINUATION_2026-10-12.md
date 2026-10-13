# Tallybook V19 FIN-002 — Saved currency integrity for management reports

**12 October 2026 — local development increment. Release: NO-GO / INCOMPLETE.**

Started from `TALLYBOOK_V19_FIN002_RECONCILIATION_CONTINUATION_2026-10-12_SOURCE.zip`, verified SHA-256 `52b7d29673807f47db1b72a3de16774dbcba219270a74140feaa601064743615`. This is a continuation of **FIN-002**, not closure of the 12-stage roadmap or an approved tax model.

## Finding and implementation

The management report aggregates sales, repayment, expense and prepaid-transfer amounts into **one scalar currency** and its React view formats that scalar with the **current** business currency. Sales and repayments already had optional saved currency snapshots, but expense and prepaid-transfer records did **not** record the currency used when money was first entered. After a profile currency change, a historical USD amount could therefore be displayed and summed as GHS or vice versa.

- Added optional `currency` snapshots to **new** expenses and prepaid wallet transfers. Old entries remain explicitly unknown. Duplicate expense submissions now must match the original currency; wallet transfer retries must match the saved profile currency. Prepaid new postings reject prior transfers with unknown or different saved currency rather than silently merging balances.
- Added independent pure `assertSingleCurrencyFinancialEvidence` for **all source history** of saved sales, repayments, expenses, prepaid transfers, and partial cash refunds. A management report is available only when the nonzero source records have valid, matching three-letter currency evidence for the company profile. Missing or foreign currencies now cause an explicit reconciliation error, not silent conversion. Existing original-sale tender, reversal, supplier and FIFO reconcilers still run separately. The supplier report continues to report payable amounts *by their own saved currencies* rather than combining them with receipts.
- Extended backup parsing to validate any present expense/wallet currency snapshots without retroactively asserting currencies for legacy records. The database format is additive: no schema or historical record migration was applied.
- Added seven independent native regression tests and unexecuted client integration tests for new expense/wallet snapshots, idempotency, mismatched historical wallet currencies, and invalid expense currency backups.

**Deliberate compatibility restriction:** Historical expenses, prepaid transfers, sales and repayments lacking currency evidence can make the single-currency management report unavailable until an auditable correction/reconciliation policy is agreed. No historical value is assigned the currently selected currency. Existing historical purchases with unknown settlement status remain unknown. Currency-code validation alone is not proof that a transaction used the correct currency or that a foreign-exchange rate is available. Real payment/provider confirmation is not attempted.

## Evidence and outstanding work

- Native Linux Node 22.16.0/OpenSSL suite: **431/431 PASS**, zero skipped/failures, including 7 new denomination tests. `artifacts/fin002-currency-2026-10-12/native-full.log`.
- Isolated, disabled-by-default mock gateway: **4/4 PASS**. `artifacts/fin002-currency-2026-10-12/mock-gateway.log`.
- Changed TypeScript/TS declaration/test files: **8 syntax-parsed**. `artifacts/fin002-currency-2026-10-12/ts-syntax.log`.
- Full-project semantic TypeScript: **BLOCKED** because project Node and Vite declarations and client dependencies are absent; failure retained in `artifacts/fin002-currency-2026-10-12/tsc-full.log`.
- Client Vitest/real IndexedDB, schema upgrades, browser/PWA, multi-currency policy/data migration, physical or external payment testing: **NOT RUN**. This increment cannot be treated as a production-certified cash/expense reconciliation.

82 acceptance units and the existing issue register were preserved; `FIN-002` remains **missing** as an overall acceptance gate. Full statutory tax rules, multi-currency period and balance accounting, historical monetary provenance, refunds and other financial source reconciliations remain open. No external staging, payments or deployment were authorized or performed.
