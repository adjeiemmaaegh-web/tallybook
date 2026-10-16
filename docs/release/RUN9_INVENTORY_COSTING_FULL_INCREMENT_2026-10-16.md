# Tallybook V19 — Run 9 full development increment: inventory costing and financial reconciliation

**Date:** 2026-10-16  
**Exact source baseline:** Run 8 draft PR #20, commit `f1884ff3925f75755a0b97824c557b096ed2e102`  
**Development branch:** `v19/run9-inventory-financial-reconciliation-20261016`  
**Development disposition:** Whole-run source increment **delivered for draft review**.  
**Acceptance:** **NOT PASSED**. **Commercial release: NO-GO / INCOMPLETE**.

## Owner-approved scope and unchanged boundaries

The owner authorized a full source-development increment from the preceding draft, with comprehensive authored regressions, test execution when possible, explicit deferral of actual Windows/browser/native CI where unavailable, and draft PR. This does NOT authorize release acceptance, production SQL, cloud ledger migration, payments, staging, external deployment, or merging into `main`. Per-client return/refund policy remains configurable (including disabling refunds altogether); Run 11 is the separate broader policy gate.

The preexisting `costLedger.ts` already persisted immutable per-SKU FIFO opening/receipt/issue/reversal events, tracked original receipt layers, protected quantity and cost integer arithmetic, enforced IndexedDB transaction scopes, and refused to fabricate missing historical costs. Existing `costReconciliation.ts` independently checked saved sale COGS against issue events, movement and tax snapshots. Run 9 builds on these; it does not claim to invent FIFO or redo stock transactions.

## Implementation committed

1. **Complete inverse full-sale/partial-return costing.** `client/src/features/reports/run9CostReturnAudit.mjs` verifies that every sale line with saved FIFO issue evidence and a full-sale reversal has **exactly one** matching cost restoration for the original quantity and financial reversal posting timestamp. An absent cost-return journal, wrong sale/product, wrong quantity/date, extra partial restoration or orphaned restoration is rejected. For cash partial returns, verify the original sale-line issue, exact amount of returned stock, product, source movement, createdAt and unique claim; duplicate or conflicting return evidence fails. Legacy uncosted sale lines remain unavailable rather than being retroactively assigned prices. The audit is invoked in `reconcileSaleCosts` **before** financial totals, and therefore also in the existing portable backup validator.
2. **Supplier invoice cost versus FIFO receipt verification.** `run9PurchaseCostAudit.mjs` matches each saved modern purchase invoice's SKU quantity, price and total to one corresponding stock movement and cost receipt, with exact source ID, saved timestamp, invoice ID and required reporting currency; receipt-cost mismatches, nonexistent purchase references, duplicate cost/movement IDs, invalid sums and foreign business associations reject. Purchases without any old FIFO event are explicitly classified as **legacy unverified**, not assigned invented acquisition prices. Modern purchases with partially missing cost receipts are NOT certified. A valid historical purchase without cost-event lineage is NOT promoted to verified stock cost.
3. **Current stock value from immutable saved receipt evidence.** `run9InventoryValuation.mjs` sums checked per-product known FIFO layer values, tracks unknown acquisition-cost units and products, validates stock against reconstructed event quantities, refuses negative/unsafe/overflow values, distinguishes service SKUs from physical stock, and exposes a full `totalValueMinor` **only if all physical stock units are cost-known**. Editable `product.costPriceMinor` is never used to backfill unknown historical costs. Zero stock without history is zero current value, not a fictional opening receipt.
4. **Report, CSV and backup integration.** `costReconciliation.ts` calls both reciprocal audits, reconstructs current cost state, and returns the new `inventoryValuation` and `purchaseCostEvidence` objects. `getFinancialSummary` reads `purchaseLines` together with purchase, stock, sale and cost tables in the **same read transaction**, scopes to the active company, checks purchase receipt currency against its profile, and returns separate **as-of** inventory values and period COGS. CSV and `FinancialIntelligencePage.tsx` label known/unknown inventory assets and counts of invoice-backed versus legacy-unverified supplier receipts; they do not present incomplete inventory as a certified full value or cash/profit. `backup.ts` supplies the complete purchase and purchase-line snapshots to the same reconciler **before any restore write**.
5. **Low-resource index efficiency.** Cost events are grouped once by product and sale lines once by sale/ID, avoiding a fresh full-history scan per SKU or sale. No data rewrite, schema migration, COGS mutation, payment issuance or automatic corrective stock posting is performed.
6. **Types and testability.** Added explicit `.d.mts` typed interfaces for the three pure cost/valuation auditors. The pure evidence check modules have no browser/local-storage/network/write API. Historical company business-policy snapshots, refundable-item rules, source receipts and saved inventory data formats remain untouched.

## Authored tests and actual execution evidence

**53/53 focused native-style cases passed with exact fetched GitHub source blobs in an isolated V8 compatibility test runner.** Group breakdown:
- `client/src/features/reports/tests/run9CostReturnAudit.test.mjs`: **15** full/partial FIFO restoration integrity cases.
- `client/src/features/reports/tests/run9InventoryValuation.test.mjs`: **11** current known/unknown valuation, zero stock, services, duplicate ID and overflow cases.
- `client/src/features/reports/tests/run9PurchaseCostAudit.test.mjs`: **15** invoice-to-cost/movement proof, legacy, currency, quantity, cost, transaction identity and safe-integer cases.
- `server/tests/run9CostIntegrationAudit.test.mjs`: **12** static checks for real report, backup, UI, purchase/return posting and indexed-replay wiring.

The V8 harness used simulated Node test/assert, `structuredClone` and source-file reads. The **53 checks are not native `node --test`**, Vitest, actual Dexie/IndexedDB, physical Windows, Chromium/Firefox/WebKit, semantic TypeScript checks or a green exact-head GitHub Actions suite.

**New real IndexedDB/Vitest cases authored, NOT EXECUTED: 12** in `client/src/features/reports/run9CostReconciliation.test.ts`. These include positive FIFO opening+purchase+sale and reversal, known/unknown as-of inventory value, changed original receipt/return evidence, supplier cost and saved currency tampering, validated backup rejection, no-history legacy and stock quantity contradictions. Existing `costLedger.test.ts`, `cashPartialReturnPosting.test.ts`, `financialIntelligence.test.ts`, `backup.test.ts` and Run 7/8 relevant tests require actual full rerun.

The reviewer-safe **unexecuted** pinned-Node Windows runner `scripts/RUN9_WINDOWS_READONLY_QA.cmd` prepares native tests, selected Vitest, `pnpm check` and local build logs in a disposable checkout. The unexecuted QA matrix `docs/release/RUN9_INVENTORY_FINANCIAL_QA_MATRIX_2026-10-16.md` specifies 23 synthetic-data FIFO, money, currency, backdate, crash, performance and multi-company tests. No real Windows hardware data was read or modified and no database tables were changed.

## Required acceptance work and remaining risks

1. **All true repository checks are open:** pinned Node 24.19.0 native and client suite, 12 new real IndexedDB tests, existing sale/return/purchase/finance/backup regressions, `pnpm check`, Vite build, Playwright, exact-final-SHA Actions, Windows 8 GB CPU-only behavior, adversarial fake clocks and low-memory performance. Prior PRs had GitHub validation failures before any job steps; new commits are not assumed to fix CI.
2. **Legacy evidence cannot be invented.** Pre-v26 purchase invoices may not have cost event lineage. Explicit counts are unverified. Inventory opened without saved unit cost remains unvalued as a whole. A previously edited present-day unit price never becomes a historical cost receipt.
3. **Currency boundary:** A modern FIFO receipt with saved purchase currency absent or different from the selected company currency fails closed rather than silently mixing denominations. Multi-currency purchases need an explicit authorized exchange-rate/cost capitalization model; no such FX feature is introduced here. Historical opening-stock currency evidence may remain incomplete and requires separate validation.
4. **Financial report limitations:** As-of stock at saved historical costs is distinct from period sale COGS, collections and supplier liabilities; the report is not independently counted stock, replacement value, statutory profit, tax return or externally verified supplier settlement. Correction and refund rules remain configurable per company.
5. **Cross-tab/device security remains unaccepted:** Run 7 raw writer coverage, crash journals and concurrent writes require actual Web Lock/browser, storage-quota and power-loss tests. A source-only reconciliation check is not protection against a hostile local administrator editing browser IndexedDB. Run 8 encrypted backup retention/independent restore remains unaccepted.
6. **Backdates, inventory corrections and policy:** Replayed FIFO sequence is based on immutable posting chronology, not backdated purchase date alone; exact real-data scenarios and negative-stock/refund balances still require physical/IndexedDB drills. No retroactive correction or historic recosting is inferred.
7. **Registers remain unchanged:** 47 historic blockers and 82 acceptance units retain their prior statuses. V19 Run 1 historical acceptance belongs only to the old pinned SHA. Runs **2–9 NOT PASSED**. No actual full V19 release critical gate was closed.

## Next *development* run

The owner-approved 20-run roadmap assigns **V19 Run 10 — Customer receivables: sale-linked credit, partial repayments, overpayment, currency and prepaid-liability reconciliation**. Source work may advance under the owner's continued development cadence; neither that nor this draft makes Run 9 an accepted release gate.

**Conclusion: Run 9 whole-run source development delivered, focused simulated regressions passed; Run 9 acceptance NOT PASSED and V19 commercial release NO-GO.**
