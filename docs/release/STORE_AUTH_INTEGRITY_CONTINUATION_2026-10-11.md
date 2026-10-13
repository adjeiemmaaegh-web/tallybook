# Tallybook V19 — Store/benefit authorization and local store integrity continuation

**Date:** 11 October 2026. **Source input:** `TALLYBOOK_V19_ASSISTANT_HISTORY_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `f055507482bf65e5d3bab101a92bea23bb62d034b54d06868f12190e08a43c60`. **Decision: NO-GO / INCOMPLETE.**

## Changes and evidence

1. **Transaction-bound authority.** Stage 9 store creation, staff assignment, physical count observations, transfer requests/cancellations, and Stage 4 customer policy/manual points adjustments now invoke `requirePermission` *inside* the IndexedDB write transaction that saves the result. All corresponding write transactions include `staffMembers`; this serializes relevant staff changes with guarded writes in the same database. Existing before-write checks alone were exposed to role revocation/company-switch windows. Company context and linked store/product/staff ownership remain checked. Store-directory/assignment reads revalidate company after awaited queries; attendant-store access rechecks permissions inside its read transaction. This is a scoped improvement, NOT a complete role or shift review.
2. **Actor attribution.** The same write transaction saves a staff audit entry for staffed store creation/assignment, stock count observations, transfer requests/cancellations, customer policy changes and manual points changes. A replayed idempotent benefit or already-cancelled transfer does not create a second mutation audit. Offline first-time setup without configured staff is preserved; no fabricated actor is written. Store counts are observations and transfer requests remain proposals, never stock deductions/financial postings.
3. **Independent store metadata audit.** Added a read-only pure `auditStoreRecords` module and wired it into `auditLocalIntegrity`. Checks store identities/status/name/timestamps, assignment references and duplicates, counted quantity/actor/product, transfer lifecycle references, amounts and timestamps, and cross-company or missing references. Existing foreign companies' data is not included in the active-company view. Audit now rejects a company switch during report preparation. This is NOT authoritative per-store stock or multi-device reconciliation.

## Verification boundary

- Baseline Linux Node 22/OpenSSL full native suite: **271/271 passed, zero failed/skipped** (`artifacts/continuation-2026-10-11-auth/native-baseline.log`).
- Final full native Node/QA suite: **281/281 passed, zero failed/skipped** (`native-final.log`); 10 additional independent pure store-integrity tests. Isolated mock gateway **4/4 passed** (`mock-final.log`).
- Changed TypeScript/TSX files syntax checked under Node 22's strip-types parser. This is **NOT a semantic TypeScript build**.
- Added `client/src/features/stores/storeAuthorization.test.ts` Dexie/Vitest integration cases for owner/cashier permissions, audit, store proposals, and customer benefits. **NOT EXECUTED** due missing complete client dependencies and pinned Node 24/pnpm. Those tests are not counted among native successes. Exact attempted commands and failures are preserved in local QA logs.

## Open blockers / warning

- SEC-001 is NOT closed: exhaustive mutation/actor/shift/service reviews and real browser tests remain incomplete. SEC-004 is this scoped authorization increment, implemented-unverified pending client tests.
- STORE-002 is scoped read-only integrity verification, implemented-unverified pending Dexie integration and real migration data. STORE-001 (authoritative store stock, transfers and offline consolidation) is still missing.
- No actual partial return/refund posting, real payment provider, cloud replay, complete cross-tab global recovery lock, physical device certification, or approved staging. 82 acceptance units remain; release **NO-GO**.

**Next:** Run pinned client Vitest/tsc/build/Playwright including added integration tests, then continue finance returns/refunds, cross-tab recovery and complete staff write-service review. Never use stock count observations or transfer requests as stock balances.
