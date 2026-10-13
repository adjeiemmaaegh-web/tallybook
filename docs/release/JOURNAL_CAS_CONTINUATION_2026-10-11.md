# Tallybook V19 — Recovery journal state-integrity continuation

**Date:** 11 October 2026. **Source baseline:** `TALLYBOOK_V19_COMPANY_CLEAR_CONTINUATION_2026-10-11_SOURCE.zip` SHA-256 `8de6ea472408b00f726758a9584592839f2de4559b2c2938a2597d0de37c163c`. **Release decision:** NO-GO / INCOMPLETE.

## Problem and scope

Previous cross-IndexedDB company clearing and backup restore preserved a durable assistant preimage. Recovery replayed the preimage without confirming that the assistant database still contained only changes attributable to the interrupted operation. A different tab could write in the meantime and have those edits overwritten by automated rollback. This increment adds **conservative stale-write detection**, not a cross-database commit or global tab lock. It does not change database schema 27.

## Changes

- Version-one journal format now supports optional `after` (the complete expected assistant postimage), recorded by new backup restores and company clears. Existing markers lacking `after` remain parseable. Existing markers are NOT assumed to authorize an unknown postimage.
- The serializer validates both snapshot ownership, duplicate identities and the same 32 MiB joint byte limit; no historical values are invented.
- The assistant snapshot apply routine compares exact expected preimage fields inside the SAME assistant IndexedDB write transaction before changing anything. Ordering of rows/JSON keys is normalized for comparison.
- On startup, a pending journal can be cleared untouched if the preimage is already present; it may roll back only when the assistant state matches the journal's exact postimage. An unexpected state leaves the journal and assistant data untouched and blocks startup/restore until manual reconciliation.
- The business company-clear and backup restore paths supply their pre/post snapshots and use the guarded write; preserves other companies' scoped records.

## Tests and limitations

- Linux Node **22.16.0**, OpenSSL available: complete native suite `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` passed **265 / 265**, 0 failed/skipped. Six new pure journal tests cover before/after compatibility, invalid cross-company/duplicate postimage, joint journal limits, and stable field comparison. Full command output: `artifacts/continuation-2026-10-11-journal-cas/native-full.log`.
- Separate mock gateway suite passed **4 / 4**. Four changed TS files syntax-parsed, and recovery JavaScript syntax passed; `tsc --noEmit` **DID NOT PASS** because installed client type dependencies (`node`, `vite/client`) are absent. Exact error retained.
- Four new Dexie/Vitest integration tests for unexpected concurrent edits, stale write abort, unchanged marker cleanup and older-format fail-closed behavior were **WRITTEN BUT NOT EXECUTED**. No browser session, database interruption, cross-tab stress or physical power-cut test was performed; pinned Node24 and pnpm/frozen install/build unavailable.
- A separate tab can still edit records **after** the assistant operation has completed and **before** the retail journal marker is deleted. Full global cross-tab cooperation, recovery under quota pressure and assistant audit retention policy remain open under DATA-002. Pending old journals without `after` can require manual reconciliation even when they arose from a valid operation; this is an explicit data-preservation tradeoff.
- No actual partial return/refund, online payment, staging, production deployment or external service was created.

## Next steps

Run client Vitest/semantic TS/build and actual IndexedDB process termination and multi-tab recovery matrix; design an explicit cross-tab mutation lock/fail-closed policy for all assistant writers. Decide assistant audit retention with the owner. Continue finance refund/tender/stock/FIFO correctness. Maintain **NO-GO**.
