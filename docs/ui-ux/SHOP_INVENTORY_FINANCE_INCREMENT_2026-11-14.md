# Tallybook — follow-on shop finance / inventory UX increment, 2026-11-14

**Baseline:** merged/verified PR #89 (main `6e3749ba2b296b8c3d7882063e616d5606727c8d`). The next increment is additive and does not change production SQL, payments, live financial records or staff authorization.

## Implemented source
- Stocktake: authoritative read state, no false empty-session conclusion after failure, exact numeric variance preview (surplus/shortage/equal), confirmation describing product, store and intended adjustment; server still rechecks snapshot.
- Expenses: server load state and search/status filter, exact BigInt sum of posted (non-voided) records, no rounded unsafe JS monetary totals; ambiguous client-write responses retain submission ID and fail closed if form changes.
- Quotations: recent history/status/search, server 50-record cap disclosure, 1–90 day validity check matching SQL, ambiguous retry protection and non-overflow estimates; no stock reserved or money moved.
- Reports: cleared stale daily/profit figures on period/store/network change, invalidated in-flight responses and omitted owner-private profit when online scope is lost.
- Tests: pure money/count/quote helpers plus component integration, outage and posted-data boundaries.

## Not represented as complete
- The existing stocktake RPC is **one store × one product per count**, not an atomic all-products stocktake snapshot.
- Expense and quote history APIs return recent records and are **not unrestricted all-history exports**.
- There is no public checkout, payment settlement execution, new bank connection or public marketing storefront in this increment.
- Hardware, real staff/device and signed-in production financial acceptance remain separate gates.
- Deployment may only be asserted after exact production commit verification and Vercel success.

**Release:** NO-GO until latest source commit passes pinned Node24, TypeScript/React tests, browser/responsive/visual CI.
