# Stage 9 — V16 Multi-Store & Mobile Attendants: Development Audit

**Status: INCOMPLETE. Do not certify or release Stage 9.**

## Scope and current implementation
- 9.1 Store identity and business scoping: implemented in local IndexedDB v22 (`storeLocations`). Owners with `staff` permission can add distinct named stores. Names unique per business.
- 9.2 Attendant assignment and local authorization: implemented in `storeAssignments` with duplicate protection, business and staff membership validation, and runtime check `requireAttendantStore`.
- 9.3 Mobile attendant sales on separate devices: NOT implemented or tested. Existing sales remain company-scoped rather than store-scoped; no separate-device staff enrollment or location-bound POS ledger exists.
- 9.4 Offline per-device queues and cross-device sync: NOT implemented or tested. Stage 8 cloud work is unfinished; no trusted replicated posting pathway.
- 9.5 Inventory by store and inter-store transfers: NOT implemented; the existing stock quantity is company-scoped. Transferring products without store-level stock balances and cost reconciliation would be unsafe.
- 9.6 Owner dashboard consolidated from stores: NOT implemented. Reporting store-level totals from company-wide sale records would be misleading.
- 9.7 Full verification: NOT achieved. No real IndexedDB v21→v22 migration, full Vitest, production build, browser/device offline replay or concurrent sale QA.

## Source and safety decisions
Base: `tallybook-stage23-historical-costing-preview.zip`. Existing Stage 8 code preserved. No new financial ledger writing, cross-device posting or stock movement. Owner/admin store creation uses existing local staff permission. `requireAttendantStore` checks current staff authorization and company-scoped assignment. Company switching invalidates staff sessions via existing mechanism.

## Executed in this round
- `node --test server/tests/*.test.mjs`: **109 passed, 0 failed**.
- `node scripts/stage9-isolated-qa.cjs`: **9 assertions passed** using an isolated mocked DB; NOT an IndexedDB integration test.
- TypeScript parser on changed `.ts/.tsx` files: **0 parsing errors**.
- `npm run check`: **blocked**, missing `node` and `vite/client` type definitions.
- `npm run build`: **blocked**, `vite: not found`.

## Prioritized blockers for Work / production validation
1. Install exact lockfile dependencies and run full client suite, semantic TypeScript check, production build.
2. Implement and migration-test store-scoped product on-hand and purchase/stock movement attribution; preserve historical COGS.
3. Integrate store/device/staff attribution with atomic checkout, refunds, and immutable idempotency keys.
4. Complete Stage 8 authenticated replication, device provisioning, server acknowledgements, offline replay, conflict remediation, revocation.
5. Test real phones and separate devices offline/online, simultaneous sales, store transfers, backup/recovery and owner dashboards.

**Stage 10 not started.**
