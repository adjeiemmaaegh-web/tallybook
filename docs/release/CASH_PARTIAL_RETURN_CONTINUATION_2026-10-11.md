# Tallybook V19 — bounded cash partial-return transaction continuation

**Date:** 11 October 2026. **Release:** **NO-GO / INCOMPLETE**.

**Verified starting input:** `TALLYBOOK_V19_PARTIAL_FIFO_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `ef7d3bb023c9abe68cc86dbbbe6f57292ce251c5f1e6b0974a4b544f65659aa3` (801 source/evidence files). No pre-existing files deliberately removed.

## Changes and narrow scope

- **Schema 28:** append-only `cashPartialReturns` journal with per-sale sequence, company-scoped unique submission key, original sale/receipt, currency, saved-tax/discount component amounts, strictly sale-line-linked quantity, stock movement and exact original FIFO restoration event IDs.
- Added transaction-only `recordConfirmedCashPartialReturn` service for a *supervisor/owner authorized, locally recorded* refund. This is NOT a payment gateway call and does NOT physically pay cash. Its caller must affirm that the exact amount has actually been paid and that the returned stock was inspected and accepted as restockable. The service rejects missing or wrong confirmation amount/disposition; original receipt/payment tampering; duplicate/refunded intents; excessive or foreign return quantities; invalid cost source; orphan cost and stock history; closed/changed company; stale permissions and unsafe integer arithmetic. Original sale, receipt and payment stay immutable.
- Posting changes original item stock, appends matched stock movements, restores exact original FIFO receipt allocations, writes the immutable money return and staff audit inside a single **main IndexedDB** write transaction. A late failure must roll back all *database* changes. Cross-device power-loss and actual movement of physical cash remain outside any database transaction.
- First supported lane ONLY: fully paid cash original sale, no customer/debt/wallet/points, no provider, no service lines, no existing batches or batch allocations, restockable tracked stock, saved original currency, verified tax evidence when a tax snapshot exists. It does not handle credit/customer, damaged/non-restockable, partial tender, refunds into wallets, Mobile Money/card, supplier-linked, or cash-provider settlement. A refund UI is **not enabled**. Staff cashier role has no refund permission under existing policy; owner/supervisor only.
- Full-reversal selection excludes previously partially returned sales. Read-only original FIFO-cost reconciliation now accepts only event-ID/source-ID/quantity/date-matched return finance evidence; unmatched cost reversals still fail closed. Management revenue, original tax, cash outflow, period COGS, CSV, shift cash totals, backup import/restore and integrity checks now include these returns. Unsupported original finance/event permutations remain blocked.

## Evidence and release boundaries

- **Native Linux Node 22/OpenSSL regression:** 310/310 passed, zero failed/skipped, including 10 new independently run pure return-ledger tests (`artifacts/continuation-2026-10-11-cash-partial-return/native-final.log`).
- **Isolated simulated gateway tests:** 4/4 passed, separate (`.../mock-final.log`). Mock success does not authorize a live payment.
- **Modified TS syntactic parser:** 9/9 succeeded, JS syntax succeeded. **Semantic TypeScript blocked** by missing `node` and `vite/client` definitions; full client Vitest, IndexedDB, production build, browser, migration and physical cash tests **NOT RUN**. Source-level client integration tests for rollback, strict refund eligibility, backups and financial reports were written but not executed; no claims of their passing.
- **No user-visible refund feature is activated.** The new exported service is an unfinished, intentionally restricted integration boundary. It must not be used with real customer data before complete integration tests and operational review.
- **Full accounting remains incomplete:** refunds to customer/credit, wallet, loyalty, card/MoMo, damaged stock, batch allocations, cross-tab recovery, independent full-history audit, owner return policy, cost unknown legacies and full physical-device testing are still blockers. All externally dependent launch gates remain open. Do not deploy or publish.

Retain the original 82 acceptance units and all prior blockers; add scoped `FIN-013` as **implemented-unverified**, with broad `FIN-001`, `FIN-002`, `FIN-005`, `DATA-002`, `SEC-001` and other release blockers still open. Continue on this new source archive only.
