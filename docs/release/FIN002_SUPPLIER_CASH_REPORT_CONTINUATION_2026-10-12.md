# V19 FIN-002 — Historical supplier reconciliation and sale tender verification

**Local source increment, 12 October 2026 — release remains NO-GO / INCOMPLETE.**

Starting point: `TALLYBOOK_V19_ADMIN_AUTH_RECOVERY_CONTINUATION_2026-10-12_SOURCE.zip`, SHA-256 `ed4e6be8d7c275de2d44c53118a2754dbdcff6b9da3efcc21a8256d5cc038df3`. No older handover was used.

## Implemented

- New independent read-only `supplierReporting.mjs` reconstructs recognized supplier-liability balances **as of the complete saved history**, and separates **period** manually recorded supplier payments by the transaction's saved currency. Supplier credits lower liability but are not cash. Purchase status without a recorded explicit recognition stays **UNKNOWN**, not paid/settled. Chronological reconstruction checks that a settlement cannot predate recognition even if IndexedDB returns arbitrary key order.
- The financial management report now snapshots supplier purchases and payable entries in its existing company-scoped read transaction, displays recognized payables and period supplier payments separately by currency, and adds explicit unknown-liability counts in UI/CSV. It deliberately does NOT subtract multi-currency supplier payments from a single unlabeled collections-minus-expenses number. The dashboard/CSV now accurately label that amount as excluding supplier payments.
- New `saleTenderReconciliation.mjs` independently reconstructs the saved checkout's total, amount paid, outstanding, prepaid wallet portion and matched original payment records across the **full saved history**, before management report summation. It catches duplicate/orphan/foreign sale payments, mismatched tender/customer and missing, excessive, fractional or unsafe amounts. It does not claim that local card/MoMo labels mean provider settlement.
- Added 21 native regression tests plus unexecuted Vitest management-report tests for supplier cash/credit/liabilities, multiple currencies, unknown historical purchase status, payment integrity, safe integer bounds, chronology and CSV labels.

## Acceptance remains open

`FIN-002` remains `missing` as a whole: complete financial-event reconstruction for all wallet/loyalty/customer/refund/tax/expense/multi-store cases, authoritative opening liabilities, independent statutory tax rules and registration/filing evidence, and complete full client/IndexedDB testing have not been delivered. Local owner tax defaults remain OFF; no rate was assumed. The other five previously missing issue IDs are unchanged.

## Executed checks

- Linux Node 22.16.0/OpenSSL native QA: **424/424 passing**, 0 failed, 0 skipped. Source `artifacts/fin002-2026-10-12/native-full.log`.
- Isolated mock-payment contract: **4/4 passing**. Source `artifacts/fin002-2026-10-12/mock-gateway.log`.
- Four changed TypeScript/TSX/declaration files parse; new MJS files syntax-check. Client Vitest/semantic project TypeScript/production build/browser checks not run. Full-project `tsc` fails because installed project `node` and `vite/client` type declarations are missing. Evidence is retained in `artifacts/fin002-2026-10-12`.

No external service, payment, deployment or customer data was used. The output source archive is for continued development, not production use.
