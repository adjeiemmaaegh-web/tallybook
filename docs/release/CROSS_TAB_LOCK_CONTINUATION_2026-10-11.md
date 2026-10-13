# Tallybook V19 — cross-tab assistant/recovery coordination (11 October 2026)

**Release decision: NO-GO / INCOMPLETE.** Scoped DATA-009 implementation on the verified `TALLYBOOK_V19_SNAPSHOT_SAFETY_CONTINUATION_2026-10-11_SOURCE.zip` (SHA-256 `f4a57d2c74274680334bd85a50ef6d73675ede8369b14ff2ef8dc6a7723e5115`). No physical browser, deployment, payment, or real customer dataset was used.

## Implementation

- `crossTabDataLock.mjs` uses the browser's origin-wide Web Locks API with one fixed lock key. Backup restore and company deletion hold an exclusive lock for the full journal, assistant snapshot, main ledger commit and recover-on-failure sequence. Startup on a Web Locks-capable browser also obtains an exclusive gate before deciding there is no pending journal, preventing startup between another tab acquiring the lock and saving its marker. Pending-journal replay requires the exclusive lock. A held lock rejects a competing operation immediately; lock release is automatic on success/failure. Never implement a time-based lease that could expire during a legitimate IndexedDB commit.
- Ordinary assistant workflow/alias/history mutations request shared locks before opening their IndexedDB write transactions, preventing cooperating writers from changing assistant state during a destructive operation. They retain ordinary offline use when Web Locks are unavailable.
- Unsupported browsers fail closed for destructive two-database operations, including actual pending-journal recovery. Regular startup with no journal and ordinary offline assistant writes remain possible. **Recovery/restore/clear need a browser with Web Locks in a secure context (localhost or HTTPS).** Do not clear the recovery marker manually, clear browser data, or use a different origin to work around this failure.
- A small browser-test shim models lock contention in jsdom only. It does not certify real cross-tab locking; an additional unexecuted client regression asserts conflicting restore/clear/write requests fail without changing a journal or assistant records.

## What this does not solve

`DATA-002` remains **missing**: general retail mutations and any raw IndexedDB writers do **not** all participate in the lock; shared company identity across tabs and cross-DB crash linearizability are not fully established. Web Locks are advisory, require real browser support and must be tested with multiple real contexts/tabs, shutdown/reload, concurrent stock/checkout, and quota failures. Existing legacy pending journals still require validated recovery. The strict lock can refuse an operation on unsupported browsers; that is intentional rather than silent unsafe execution.

The 82 acceptance units are unchanged. The cash return Sales UI remains strictly **read-only**. No stage is accepted as production-ready based on isolated native tests.

## Reproducible QA (Linux Node 22.16.0 / OpenSSL)

- `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`: **366/366 pass, 0 fail/skip**, previously 361/361. Five new native mock-Web-Locks unit tests. See `artifacts/continuation-2026-10-11-cross-tab/native-final.log`.
- `node --test server/tests/paymentGateway.test.mjs`: **4/4 pass** separately; mock only.
- Seven changed TS/TS test/setup/declaration files syntax parsed successfully. Isolated `tsc --strict --noEmit` for the new Web Locks declaration passed.
- **Unverified:** full client TypeScript semantic check, Dexie/Vitest, PWA production build, historical migration/browser/real cross-tab and physical interruption. Node 24.19.0 and pnpm 10.34.0/pinned dependencies not available. npm registry returned `EAI_AGAIN`; full repository typecheck reports missing `node` and `vite` type definitions. See retained QA logs.

Release remains **NO-GO / INCOMPLETE**, with all external provider, hardware, cloud, staging, production payment, and deployment gates open.
