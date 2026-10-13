# Tallybook V19 — Expanded Retail Web Locks / Prepaid Transaction Authorization

**11 October 2026 | Local engineering continuation | NO-GO / INCOMPLETE**

## Source baseline and scope

Continued from `TALLYBOOK_V19_RETAIL_WRITE_LOCK_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `7a3993c28c4fb96b481bc2936d557364ee43838abc81cd7531fd81d084c34dcd` (929 files). All prior functionality and original 82 acceptance units are preserved. No production or external integration action was authorized.

## Implemented

- Added `withRetailWriteLock` and a Dexie-aware `withCoordinatedRetailWrite` adapter. It acquires the existing origin-wide shared Web Lock **before** entering a new IndexedDB write transaction, allowing exclusive backup restore, company clear and startup recovery to refuse conflicting ordinary retail writes without waiting. An operation invoked inside an already-active Dexie transaction does not request an additional asynchronous browser lock, avoiding accidental transaction closure. The enclosing transaction must be coordinated by its caller.
- Added shared coordination for **25** previously unguarded exported write entrypoints across customer create/update/archive; customer policies/points and prepaid transfers; store creation, assignments, transfer requests/cancellation and observed stock counts; catalogue category/product maintenance, stage-2 catalogue/stock-count/batch operations, CSV import; supplier creation/update/archive.
- Fixed prepaid-wallet posting's pre-transaction authorization window: it now checks the live actor and shift inside the same Dexie write transaction, with staff/shift tables in the transaction and explicit active-company checks before and after posting. Saved wallet transfers are still manually evidenced, **not provider-verified online payments**.
- Added company-switch failure to the prepaid-transfer listing read path.

## Exact testing performed

- Full Linux Node 22/OpenSSL native QA: **392/392 pass**, zero failure or skip; command/exit/log recorded in `artifacts/continuation-2026-10-11-expanded-lock/native-final.log` and `.exit`. Includes **16** new native checks (ten source contracts, five modeled lock behavior checks and one wallet transaction source assertion).
- Independent disabled-by-default mock gateway: **4/4 pass**.
- New JavaScript syntax check, **12** changed/new TypeScript source files syntax parsed with global TS compiler, and isolated .d.mts typecheck pass.
- Full repo semantic `tsc` **blocked** by missing `node` / `vite/client` definitions; AST write inventory **blocked** by absent project TypeScript module. Both failures are retained as logs.
- New `expandedRetailLock.test.ts` is written **but NOT executed**. No React/Vitest/Dexie/IndexedDB browser test, production build, physical crash or multi-tab run has been executed on this modified source.

## Open gates and release decision

The new protection is **implemented-unverified** (`DATA-011`), not a verified closure of `DATA-002`. Other staff, business profile, quotations, debt and raw IndexedDB mutation paths may still bypass the protocol; older unsupported-browser offline writes remain allowed by design and destructive two-DB actions fail closed. Browser migration/recovery, stock/cash exact invariants, offline device tests, all staff authorization, provider and staging work remain outstanding. Cash-return Sales UI remains read-only.

**Decision: NO-GO / INCOMPLETE.** Do not use for production, live refunds or unapproved deployment. New continuation must use the archive generated from this increment, not the previous retail-write-lock ZIP.
