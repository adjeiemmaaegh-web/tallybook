# Tallybook V19 — Run 10 full development increment: customer receivables and prepaid-cash conservation

**Date:** 2026-10-16  
**Starting source:** Run 9 draft PR #21 exactly at `e80592b71ffec349f35b6092966093df8397ee57`  
**Development branch:** `v19/run10-customer-receivables-20261016`  
**Development status:** Whole-run SOURCE increment completed for draft review.  
**Acceptance status:** **NOT PASSED**. V19 commercial **NO-GO / INCOMPLETE**.

## Owner intent, development cadence, release boundaries

This is the owner-authorized tenth **development** increment of the 20-run V19 roadmap, NOT a claim that V19 Run 10 or the previously open Runs 2–9 have passed release acceptance. Run 1 acceptance remains historical at its pinned original SHA only. Source development for Runs 1–10 means 10 development increments remain (Runs 11–20 inclusive). Historic 47 blocker / 82 acceptance-unit classifications are unchanged. No `main` merge, live Supabase SQL, customer record migration, payment gateway, real-money movement, cloud sync, staging or deployment was authorized.

## Prior safeguards preserved

- Saved customer debts derived from completed immutable customer credit sales, genuine signed full reversals and saved partial repayments. Existing `reconcileCreditLedger` checks negative balance, exact negative reversal quantities and over-allocation; sale-level repayment `saleAllocations` is **optional**, and absent historical allocation is UNKNOWN rather than FIFO-inferred.
- The repayment posting path already enforced staff permission and shift, selected company, sale currency, loan limit/available debt, live sale-linked target revalidation and same-IndexedDB-transaction posting.
- Full-history `reconcilePrepaidLiability` already independently checked wallet benefit source links, prepaid deposit/refund entries, wallet-funded sale debits, valid reverse credits and per-customer time-ordered balances without inventing preexisting wallet money. Wallet spending was not counted as external cash.
- Run 7/8 Web Lock + backup recovery journal and Run 9 money/stock cost audits remain intact. Run 10 changes preserve local IndexedDB schema v28 and currency snapshots. No retroactive legacy rewrite or FX conversion.

## Run 10 implementation committed

1. **Per-customer credit conservation instead of netting debt across customers.** New pure `client/src/features/reports/run10ReceivablesAudit.mjs` validates that a company-scoped original sale is unique, has valid money/date evidence, links to an existing company customer if it creates credit, and that full negative reversals are unique, customer-linked and not recorded before the original sale. It independently reconciles **each customer** via the existing credit ledger, then checks the aggregate as the sum of all verified customer balances. One customer's over-repayment cannot disappear under another customer's outstanding debt. Repayment IDs and optional submission keys are unique, and same-customer explicitly allocated repayments cannot point to foreign/earlier sales. Valid sale-linked/legacy customer-level repayment totals remain separate. All monetary sums use safe-integer checks; unknown historic currency stays visibly unverified, not forced to the current company currency. Returns `outstandingMinor`, `allocatedRepaymentMinor`, `unallocatedRepaymentMinor`, `indebtedCustomers`, customer counts, and unknown-currency counts.
2. **Separate prepaid cash/consumption/liability conservation.** New `run10PrepaidCashAudit.mjs` retains the existing authoritative saved benefit replay, then independently verifies
   `deposits - external cash refunds - (wallet sale spend - reversed wallet sale spend) === saved customer prepaid liability`.
   Uses BigInt/safe-integer limits, no implicit currency exchange, no inferred bank/payment-provider proof. Wallet sale spending is NOT counted as fresh cash collections and a wallet sale reversal restores a stored-value liability, not an external deposit. Returns separately labeled saved deposit/refund/consumption/credit amounts.
3. **Stronger authorized repayment write.** `client/src/features/credit/credit.ts` now invokes `withCoordinatedRetailWrite` **before** opening the Dexie write transaction (reuses existing Run 7 origin shared Web Lock and no-Web-Locks behavior). It rechecks active company during read/proposed posting and before transaction completion; the new full scoped customer audit validates the **proposed repayment** inside the same write transaction as actual `database.repayments.add`. The existing cash/amount/role/shift/submit idempotency checks are retained. Customer debt history and repayment target reads additionally reject a switched-company result.
4. **True business financial reporting.** `getFinancialSummary` now includes customers in the exact same company-scoped read transaction as sales, repayments and reversals. `summarizeFinancials` applies customer-level audit when provided a complete `company+customers` snapshot, replacing its prior simple global debt subtraction; it also uses prepaid cash conservation when the full wallet/benefit/currency evidence is provided. A public direct-call `summarizeFinancials` without complete customer evidence retains the preexisting basic arithmetic for compatibility but **is not certified** as audited per-customer accounting. Missing only one of company/customers fails. The management CSV and UI show sale-linked versus customer-only legacy repayments, current owing-customer count, recorded prepaid external cash and stored-value consumption separately.
5. **Dashboard and portable file hardening.** `client/src/features/reports/reports.ts` audits all customers in its full saved company source snapshot before dashboard, debt or end-of-day totals. `client/src/features/backup/backup.ts` requires both customer-credit and prepaid-money conservation during whole-ledger **prewrite** validation. An orphan allocation, duplicate collection, one customer's hidden overpayment, forged wallet benefit, or altered prepaid transfer cannot silently pass financial report/portable import validation.
6. **Types & no schema change.** Two `.d.mts` declarations describe structured read-only audit results and company/ledger inputs. No local database upgrade, outbound cash/refund transaction, company policy mutation, Supabase access, cloud data copy, unknown FX, bank webhooks or automatic legacy allocation was added.

## Verification evidence — carefully scoped

**42/42 focused native-style checks PASSED in an isolated V8 compatibility harness against fetched Run 10 GitHub source blobs**, using simulated Node test/assert/source-file reads and a small timestamp-format shim:
- `client/src/features/reports/tests/run10ReceivablesAudit.test.mjs`: **16** cases — two debtors, masked overpayments, legacy and explicit partial payments, cross-customer allocations, time ordering, reversals, currency, duplicates and overflow.
- `client/src/features/reports/tests/run10PrepaidCashAudit.test.mjs`: **12** cases — deposit vs spending, wallet reversal, external refund, orphan cash/benefit, foreign customers/currency, duplicate and unsafe values.
- `server/tests/run10FinancialIntegrationAudit.test.mjs`: **14** static source contracts for report read snapshots, backup parse checks, repayment transaction coordination, company switch, historical unknown allocations, UI/CSV, no schema/cloud change.

**None of the 42 is a native `node --test` result, real Dexie/IndexedDB run, actual browser WebCrypto, live HTTP, Windows, pinned pnpm/TypeScript/Vite, GitHub Actions, or actual power-loss evidence.** These checks are development-level, not release acceptance.

**New real IndexedDB/Vitest tests authored, UNEXECUTED: 12**, `client/src/features/reports/run10FinancialConservation.test.ts`. Includes: two-client debt consistency across financial/dashboard/customer screens, linked partial repayment, cross-customer masked overpayment and portable-file rejection, foreign allocation, replayed keys, idempotent write, wallet deposit/spend conservation, wallet sale reversal, corrupted transfer liability and backup, FX collection rejection, late storage failure rollback, and unknown historical sale currency. Existing credit, wallet, finance, backup, FIFO and Windows suites need full reruns; no runner outcome is asserted.

**Unexecuted safe local Windows QA:** `scripts/RUN10_WINDOWS_READONLY_QA.cmd` checks pinned Node 24.19.0 and existing pnpm, runs native source contracts, selected real Vitest, TypeScript and Vite build and logs results. `docs/release/RUN10_CREDIT_PREPAID_WINDOWS_QA_MATRIX_2026-10-16.md` specifies synthetic two-company browser, cross-tab, credit/reversal, prepaid cash, FX, backup restore, low-spec Windows and crash/fault-injection drills. Neither script nor matrix has been executed; they do not touch a real owner's data or auto-deploy.

## Remaining material blockers, not acceptance passes

1. Execute pinned Node 24 and native source tests, **all** client Vitest and 12 new real IndexedDB cases, semantic TypeScript `pnpm check`, Vite build, complete Playwright, native suite, 8 GB CPU-only Windows, real multi-tab races, actual power-loss/rollback and exact-final-SHA GitHub Actions. Earlier Run 9 Actions failed; no green status may be inherited.
2. **Historical allocation:** unallocated repayments remain source-level customer evidence; there is no safe automatic sale assignment. Missing saved currency is unknown; cross-currency reporting/collection remains explicitly refused until independently reconciled. No historical due date, exchange rate or remittance proof is manufactured.
3. **Provider/bank verification:** recorded prepaid deposits and cash refunds are local staff attestations, not independently confirmed bank or MoMo/provider settlement. A liability result does NOT authorize real cash transfer or prove external funds exist.
4. **Advisory cross-tab locks:** repayment now participates in shared Web Locks, but not every legacy/raw writer is exhaustively covered. Run 7 crash journal and Run 8 independent backup/restore acceptance remain unverified. A saved local browser database can still be maliciously edited outside product authorization.
5. **Customer policy:** limits are per-customer/per-company and existing checks are preserved; Run 11 handles independently configurable per-company opt-in or no-refund return policy, authoritative policy snapshots and broader authorized refund workflows. Do not turn this Run 10 source increment into an unconditional refund capability.
6. Test-specific risk: the new IndexedDB regressions are source-only, and no semantic TS or real test runner verified fixture shape, cross-tab timing, actual report behavior or restore isolation. Fix and rerun any observed native/runtime failures **before** acceptance.
7. Historic 47 blockers and 82 acceptance units retain recorded statuses; V19 Run 1 historical PASS applies only to its original pinned candidate. V19 Runs **2–10 not accepted**, overall release **NO-GO**.

## Next whole-run source development

**V19 Run 11 — Company-configurable returns and refunds**, including genuine *no-refunds* business choices, consent/policy history snapshots, staff authorization, exact money/tax/stock linkage and complete partial/full correction evidence. Owner may initiate this next source increment without assuming Run 10 or prior commercial acceptance.

**Disposition:** Run 10 source development delivered and focused V8 checks passed; native/Windows/browser/full CI acceptance OPEN. No production changes, payments, live SQL, deployment or `main` merge.
