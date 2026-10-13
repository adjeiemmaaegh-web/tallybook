# Tallybook V11 — Stage 4 Implementation Completion Review
Date: 2026-10-09
Status: CODING COMPLETE CANDIDATE — NOT PRODUCTION CERTIFIED

## Scope delivered
1. Customer profiles/history, customer groups and read-only retention insights.
2. Customer-specific credit limits, repayment terms, debt ageing and discount caps.
3. Multi-line quotations, statuses, reviewed prices and validated sale conversion.
4. Configurable automatic loyalty earning from new payments, explicit point-value redemption at checkout, and reversal compensation.
5. Independent prepaid-wallet benefit ledger, wallet-only checkout settlement, deposit/refund cash journal, idempotent transfer keys and reversal compensation.
6. Receipt/recovery, reports, CSV backup/restore, company scoping, and V17 additive wallet-transfer migration.
7. POS now shows wholesale pricing consistently in cart preview and the sale ledger.

## Financial semantics
- Wallet deposits are recorded as incoming customer money and a prepaid liability, not earned sales revenue.
- Wallet-only checkout uses existing prepaid value. It creates a sale and wallet debit but no new sale payment row or cash inflow.
- Wallet refunds reduce the wallet liability and record a separate outgoing customer cash movement; they are not operating expenses.
- Configured points are an optional customer policy. An awarded point is not cash. Redemption converts points to a sale discount at the explicitly configured value; no automatic point earning occurs if no earning rule is configured.
- Refund or reversal of a sale compensates its linked wallet and loyalty entries within the same ledger transaction. If already-spent points cannot safely be clawed back, the reversal fails explicitly pending reconciliation.
- Recorded discounts respect customer-specific limits. Staff approval/roles are reserved for Stage 6.
- Existing manual wallet balances from earlier versions remain readable, but new wallet cash transfers use an auditable transaction path.
- Wallet deposit/refund verification uses cashier-entered external references; this build DOES NOT independently confirm settlement with a bank/payment provider.

## Targeted checks achieved in this environment
- 11 isolated wallet/loyalty/sale/reversal service checks passed in the in-memory mock service harness.
- 6 read-only checkout recovery and management reporting checks passed.
- Full TypeScript/TSX syntax scan passed across the current client sources.
- Vitest regression tests added for real IndexedDB wallet/loyalty workflows. NOT EXECUTED.

## Deferred — must run before production
- npm/pnpm dependency installation, TypeScript semantic type checking and production build (required node and vite type packages unavailable here).
- Full Vitest suite against fake-indexeddb/real IndexedDB and transaction rollback testing.
- Browser end-to-end checkout, offline/reload, quote conversion, loyalty and wallet transfer journeys.
- Real-device cash register, scanner, printer and physical connectivity checks.
- Migration tests from V8/V9/V10 and restoring both older V16 backups and V17 backups including wallet transfers.
- Final merge and reconciliation with Manus's independently evolving V9 Stage 2 inventory code and V10 reporting branch.
- Security/access-control acceptance once Stage 6 staff permissions are implemented.

## Go/no-go
Stage 4 coding scope is present and locally testable. It may be used as a development base for Stage 5.
It is NOT approved for production, and combined Stage 2–4 integration remains a final verification dependency.
