# Tallybook V19 — Core retail write cross-tab coordination

**11 October 2026 — NO-GO / INCOMPLETE**

This continuation started from `TALLYBOOK_V19_CROSS_TAB_RECOVERY_CONTINUATION_2026-10-11_SOURCE.zip`, verified SHA-256 `1d84f81669ae9ed6d331954e08506ff5b67ad86dee56849344245f508d905f5c` (918 files). All previous source paths remain in the next archive.

## Scoped implementation

Selected direct core financial/stock mutation entrypoints now request the existing origin-wide *shared* Web Lock **outside** their Dexie write transaction: `completeSale`, `completePurchase`, `adjustStock`, `recognizeUnpaidPurchase`, `recordSupplierSettlement`, `executeLatestSaleReversal`, and the narrow `recordConfirmedCashPartialReturn`. Accepted quotation conversion acquires the shared lock around its *outer* transaction. Nested checkout from quotation conversion reuses Dexie's active transaction rather than waiting on a lock inside that transaction, which can invalidate transaction lifetime.

Recovery/restore/company clear still use the *exclusive* counterpart from the prior increment. Competing retail writes are refused before starting any IndexedDB transaction when exclusive recovery is active and Web Locks are supported. Shared retail writes can coexist with one another; per-record concurrency and authorization are still enforced by the existing IndexedDB service transactions. Unsupported browsers retain ordinary offline retail operations, but destructive two-database restore/clear remains disabled.

**Important scope:** This does **not** globally coordinate other inventory/catalogue/customer/staff/store writers or raw IndexedDB writes. Those can still race a recovery. The work does not certify multi-tab operation, genuine IndexedDB crashes, browser process interruption, or secure-context support. `DATA-002` remains missing. `DATA-010` is implemented-but-unverified.

## Verification and release boundary

Native tests exercise Web Lock contention and inspect the eight exported entrypoints for before-transaction wrappers. These are **not** executable client integration tests. The additional Dexie/Vitest test is written but remains unexecuted. Full Node/QA, isolated mock-gateway, changed-source TypeScript syntax, repository semantic typecheck, and package-install outputs are retained under `artifacts/continuation-2026-10-11-retail-lock/`.

Do not activate payment gateways, publish commerce, enable the Cash Return screen's posting action, restore real business data, or deploy externally. All previous owner restrictions remain unchanged. **NO-GO / INCOMPLETE** pending full end-to-end client/migration/authorization/retail-recovery verification and external gates.
