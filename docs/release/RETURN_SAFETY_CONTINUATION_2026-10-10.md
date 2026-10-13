# Tallybook V19 — read-only partial-return allocation and credit reversal safety increment

**Date:** 2026-10-10. **Release: NO-GO / INCOMPLETE.** Owner-authorized continuation from `TALLYBOOK_V19_PAYABLES_CONTINUATION_2026-10-10_SOURCE.zip` (SHA-256 `74801d82813b54d26391303c9ba4eaa202c02fb6f928fe16ee5624433ae4f822`). The 82 original acceptance units and 22 previous issues are preserved; scoped new FIN-005 records work and remaining obligations. No external services, live funds, deployment, business data or credentials were accessed.

## Production defect contained

`executeLatestSaleReversal` used customer **aggregate** net outstanding to decide whether an original credit sale was unpaid. Repayments are persisted at customer level without original sale linkage: positive remaining debt does not prove which specific sale is still unpaid. Under this ambiguity, a full reversal can incorrectly cancel the original sale's receivable after some of that receivable has already been repaid. Rather than inventing debt allocations, the code now calls `assertDebtReversalIsUnallocatedPaymentSafe` inside the same write transaction. The guard replays credit ledger integrity, checks the original sale identity, rejects preexisting reversals, and **rejects outstanding credit-sale reversals whenever any customer repayment is unallocated**. Fully paid sales remain eligible for reversal. This is conservative and intentionally blocks some legitimate cases until a verified per-sale allocation process is implemented. The latest-sale lookup now receives the already captured business ID instead of rereading it mid-transaction.

## Read-only partial-return arithmetic draft

New `partialReturnPlan.mjs` is a **pure draft calculator only**. It validates the immutable original sale subtotal, discount, total, line quantities/prices and company lineage, then allocates the saved invoice amount across original line IDs by exact integer weighted shares (largest remainder with deterministic tie-breaking). A cumulative per-line quantity calculation gives the increment from previous returns, preserving the exact invoice total when all units have eventually been returned and rejecting duplicate/missing/foreign lines, noninteger quantities, over-return, malformed money and precision overflow. Unknown original tax remains explicitly unknown; presence of a tax snapshot labels only a proportional draft, NOT an approved tax adjustment.

The planner does **not** authenticate previous return rows, persist returns, mutate inventory/cost, record supplier or customer debt credits, reverse loyalty or wallet benefits, send refunds, adjust cash, or claim statutory credit notes. It is **not** connected to a checkout/refund button. Original line allocations and previous return history must be verified in one write transaction before a real posting implementation can use this pure calculator. No partial refund feature is claimed operational.

## Verification

* Baseline Linux Node 22.16.0 and OpenSSL, 185/185 native QA pass.
* This increment Linux native suite **203/203 pass, 0 failed/skipped**; 18 new native partial-return/credit guard tests (including realistic ambiguity and exact cumulative rounding).
* Isolated mock gateway suite **4/4 pass**, not a live provider.
* Changed TypeScript code/ambient module declarations syntax parsed; JS checked by Node. This is NOT TypeScript semantic checking.
* Client `credit.test.ts` has a real IndexedDB integration case asserting failed full reversal does not mutate products/debt/reversals; **NOT RUN** without client toolchain.
* **NOT RUN:** pinned Node 24.19.0/pnpm 10.34.0 installation, semantic `pnpm check`, client Vitest, Vite build, Playwright, browser upgrade/recovery, physical devices, any staging or provider verification. Dependencies are not in this source-only archive. Do not repurpose historical earlier-build evidence as current verification.

## Next dependent work

Implement supported per-sale repayment allocations with linked immutable evidence and mixed historical-record policy, then an atomic partial return/refund ledger with bounded tax/discount/wallet/points/debt/tender splits, exact partial FIFO/batch cost restoration and verified provider refund status. Cover snapshots/migration, backup/restore and cross-company checks; execute full pinned client/real IndexedDB QA and browser offline interruption matrix. Preserve existing unfinished DATA-001/DATA-002 recovery, SEC-001 authorization and all other release gates. Never record a draft as an actual refunded payment or recovered stock.
