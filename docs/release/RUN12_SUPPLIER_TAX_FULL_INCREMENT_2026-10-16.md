# Tallybook V19 Run 12 — Supplier Payables, Expenses and Recorded Tax: Full Source Increment

**Date:** 2026-10-16  
**Exact inherited Run 11 head:** `8f91b8b55c06ac831866660dd352a695c803a8fe` (draft PR #23)  
**Branch:** `v19/run12-supplier-tax-20261016`  
**Disposition:** **SOURCE ENGINEERING DELIVERED, ACCEPTANCE NOT PASSED**  
**V19 release:** **NO-GO / INCOMPLETE**

## Implemented changes

### 1. Supplier payable settlement chronology and safety

The existing Run 9/10 supplier-payable ledger already supported explicit unpaid purchase recognition, partial manually attested payments, supplier credits, currency separation, idempotent submission keys and recognition-versus-payment separation. **Run 12 did not invent that ledger.** It hardened `supplierPayables.mjs` to require exact canonical UTC millisecond timestamps, saved purchase timestamp and currency, no supplier event before the original purchase, valid optional staff/shift identifiers and bounded payment references. Recognition cannot masquerade as a paid bank transfer or carry an unsupported reference. No payment-provider or bank API was activated.

The existing supplier recognition and settlement write paths now recheck the selected company during authorization and immediately before the payable event is added, inside their existing transactional staff/shift, recovery-barrier, purchase and supplier-journal scope. Existing duplicate-key, wrong-currency, orphan purchase, overpayment and unsafe-amount checks remain enforced.

### 2. Atomic expense authorization and company currency

`createExpense` now obtains coordinated retail write permission before the IndexedDB transaction, and performs the staff permission/shift checks **inside** the actual Dexie transaction that contains staff tables, expense table, company profile and recovery barrier. It rechecks active company and currency before writing, then rechecks staff permission before the expense add. A wrong-company currency expense is refused rather than inventing FX or treating it as a supplier payment. Expense postings remain separate from supplier settlements and inventory receipts.

### 3. Company-currency supplier cash conservation

New pure `run12SupplierCashAudit.mjs` reconciles recognized supplier liabilities against cumulative manually recorded payments, supplier credits and outstanding balances **by original saved currency**, using safe integer/BigInt calculations. It independently verifies `collections - recorded expenses` and then deducts **only the current company's currency** supplier cash outflows for a separate, clearly labeled operational cash net. Foreign-currency supplier payments are separately disclosed and **never** converted or silently combined. Unknown/unrecognized purchase liability is disclosed, not assumed to be zero. Supplier credits are never counted as cash paid.

### 4. Recorded-tax evidence, not a statutory tax return

Existing company tax settings were already **OFF by default** and required owner-supplied registration, rate and inclusive/exclusive price mode; the checkout already saved tax snapshots. Run 12 adds `run12RecordedTaxAudit.mjs`, independently aggregating exact saved gross tax, signed full-reversal tax, physically refunded cash-partial tax and the net full-history recorded tax. It rejects duplicate/foreign original sales, malformed snapshots, refund events predating sales, duplicate full reversal, conflicting full and partial return, and per-sale cash/tax refunds exceeding original saved amounts. Legacy sales with no tax snapshot remain **unknown**, not retroactively presumed tax-free or assigned today's rate. This **does not establish VAT/GST registration compliance, statutory tax liability, recoverable input tax, exemptions, compound levies, filing or legal remittance**.

### 5. Backup and financial reporting

The existing portable backup preflight already reconciled supplier purchases and payment events. Run 12 adds the new recorded-tax/refund conservation check before restore mutation. Management financial reports and CSV now show local-currency supplier cash payments separately from expenses and the new consolidated local-currency net, foreign-currency exclusion, unknown supplier liabilities, gross/reversed/partial/net recorded tax and missing historical tax evidence. Report UI explicitly states manual supplier settlements are not verified bank payments and recorded tax is not a statutory return. No data migration, provider refund or cloud financial sync was added.

## Authored tests and executed evidence

**52/52 focused tests passed using exact GitHub source blobs inside an isolated V8 compatibility harness with simulated Node test/assert/filesystem**:

- `client/src/features/purchases/tests/run12SupplierPayables.test.mjs`: **14** pure supplier recognition, payment, credit, currency, duplicate, timestamp, reference and orphan cases.
- `client/src/features/reports/tests/run12SupplierCashAudit.test.mjs`: **10** local cash, supplier credits, unknown liabilities, foreign currency, precision and overpayment checks.
- `client/src/features/reports/tests/run12RecordedTaxAudit.test.mjs`: **15** saved tax, full and partial refunds, unknown legacy tax, conflict and over-refund cases.
- `server/tests/run12SupplierTaxWriteAudit.test.mjs`: **13** source integration contracts for actual transaction scopes, company switching, recovery barrier, report/CSV/UI and backup preflight.

**7 real saved-IndexedDB/Vitest cases authored but NOT EXECUTED** in `client/src/features/reports/run12SupplierTaxIntegration.test.ts`: supplier recognition/partial payment/credit, duplicate/overpayment, expense versus supplier cash, wrong-currency expense, default-off tax, inclusive/exclusive exact calculation and backup supplier tamper rejection.

**No native Node, real Dexie/IndexedDB, semantic TypeScript, Vite, full Vitest, browser, Windows or real device check was run.** These 52 source checks are not commercial acceptance. `scripts/RUN12_WINDOWS_READONLY_QA.cmd` is authored and **unexecuted**. Real test failures may remain, especially inherited cross-tab, data migration and prior-run code; fix them against the exact final SHA and rerun all suites.

## Open risk and exit matrix

| Acceptance gate | Status / required proof |
| --- | --- |
| Exact-final-SHA pinned Node 24.19.0 native 52 tests | **NOT RUN**; capture native output and failures |
| Seven new real Dexie/Vitest cases plus all prior supplier, expense, Run 9/10/11, backup and tax regressions | **NOT RUN**; capture before/after money, stock, currency, return evidence |
| Full repo Vitest, TS, Vite, Playwright and GitHub Actions | **NOT PASSED**; fix/rerun on exact SHA |
| 8 GB low-spec CPU-only Windows Chrome/Edge/Firefox | **NOT RUN**; measure speed, offline behavior, quota and browser restarts |
| Multi-tab concurrent settlement, duplicate retry, browser kill, quota, power loss | **NOT RUN**; prove atomicity and idempotence on saved IndexedDB |
| Mixed GHS/USD supplier receipts and payments | **NOT RUN**; demonstrate no invented FX or cross-currency netting |
| Supplier invoice paid before initial recognition | **UNSUPPORTED**; requires separate historical reconciliation, never assume outstanding=0 |
| Supplier manual payment actually settled by bank/provider | **NOT VERIFIED**; ledger is operator attestation only |
| Supplier invoice tax/input VAT and statutory remittance | **NOT IMPLEMENTED**; requires jurisdiction-specific legal/accounting policy |
| Tax-off company, historical tax-on sales, policy changes and refunds | **SOURCE COVERED; real browser NOT RUN** |
| Restore tampered tax or supplier data and multi-device backup portability | **NOT RUN**; refuse bad data before writes |
| Staff/owner identity and no-staff bootstrap, local tamper-proof evidence | **OPEN**; prior security blockers remain |
| Full acceptance traceability 82 units and historic 47 blocker statuses | **UNCHANGED**, not promoted by source checks |

**No real customer data was touched. No live Supabase SQL, provider payment, refund, staging, production deployment, cloud sync or `main` merge was authorized or performed.** The existing 82 acceptance units and 47 blocker statuses remain open under prior classifications until witnessed evidence.

## Development progress

Run 12 source increment completes **12 of 20 planned development runs (60% source coverage)**, with **8 source-development runs remaining (13–20)**. This percentage **does not** indicate release readiness. Runs **2–12 acceptance NOT PASSED** and commercial V19 remains **NO-GO**. The next planned source increment is **Run 13 — Multi-store stock, transfers, attendant roles, oversell prevention and authoritative store reconciliation**.
