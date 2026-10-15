# Tallybook V19 — Run 6 complete development increment: Staff authorization

**Date:** 2026-10-16  
**Development branch:** `v19/run6-staff-authorization-20261016`  
**Starting checkpoint:** Run 5 draft PR #17, SHA `d06bdfe9b390f9f67a466278b4280cd5398a4e35`  
**Development disposition:** Run 6 authorization source implemented in one increment for review; native/end-to-end acceptance **NOT PASSED**.  
**Commercial release:** **NO-GO / INCOMPLETE.**

## Owner's development cadence and release boundary

Following the owner's standing rule, deliver a whole-run code increment now and log unavailable test evidence for a later approved environment. This permits continuing source development, not promoting any unverified V19 acceptance gate. Run 2, 3, 4 and 5 are still open. No cloud identity confers device-local staff authority. Tallybook staff controls remain device-local operational locks, not protection against a hostile user directly editing IndexedDB, local scripts or the machine.

## Code delivered

1. `client/src/features/staff/staffAuthority.mjs` and `.d.mts`: a fail-closed canonical local `owner | supervisor | cashier` matrix. Owner: sell, refund, discount, inventory, reports, staff. Supervisor: sell, refund, discount, inventory, reports. Cashier: sell only. Extra overrides may remove permissions, never elevate beyond the role. Unknown roles, corrupt credential records, duplicate override values, mismatched company, disabled staff, expired/changed shift and mismatched cashier approval reject. Explicit rules for immutable credential bindings, shift ownership and exact one-use approvals.
2. `staff.ts`: PIN-verified and authenticator-verified sessions are bound in memory to the actual saved PIN verifier/salt, role, override permissions and disabled status. Changes after unlock force a fresh unlock on the next authorization check rather than silently inheriting newly granted privilege. Staff locks and switches clear credentials, increment per-company session generation, invalidate pending supervisor approvals and signal the UI. Existing 30-minute rolling idle expiration remains. Unknown role helpers fail closed.
3. Supervisor checkout approval requires a live cashier session **and open, matching shift**. PIN is checked with the existing PBKDF2 verifier/throttle, and approver role/PIN/override is re-read inside a coordinated IndexedDB transaction. Approval issuance now writes a `discount.supervisor.approved` audit event before publishing the 120-second in-memory one-use authorization. Receipt binds exact checkout submission key, cashier identity/session generation, exact discount, subtotal and supervisor's credential state; no PIN is included in the audit.
4. `consumeCheckoutDiscountApproval` is now asynchronous. During the actual `completeSale` write transaction, it rechecks a live cashier permission, matching unclosed shift and current supervisor membership/credential binding and discount permission. Revoked supervisor, role/PIN update, expired or reused approval, cashier session change or closed shift denies the financial posting before stock and payment writes. The sale's existing `sale.completed` audit records the approved supervisor. The preexisting fail-closed on-time failure behavior (a consumed in-memory approval may not be reusable after a rolled-back sale) is retained; approval reissue is required.
5. Shift review and close now validate immutable company/staff/shift relation and open timestamp; close rechecks session after journal/audit preparation, so a stale session cannot commit a second close. Cash amounts remain strict safe integers and existing cash movement reconciliation remains unchanged.
6. Local read-entrypoint authorization: staff `sell` permission inside read transactions and after awaits now covers sale history, customer receivables, customer directory and inventory snapshot. Staff `inventory` permission protects supplier/purchase history; `reports` permission protects expense history. All four report summary entrypoints perform final `reports` revalidation before returning data. Relevant IndexedDB `staffMembers` tables are included in snapshot transactions.
7. `StaffPage.tsx` validates current staff session before populating manager controls, shows only the active staff member's shift records, checks `reports` permission before accessing audit history, and clears stale PIN/selection on account/company changes. This reduces accidental in-app disclosure; directly readable device files remain outside its security boundary.
8. Existing local business data, company profiles, stock movements, historical money, Supabase cloud membership, device synchronization, payments and production DB are not migrated, cleared, uploaded or changed by this increment.

## Authored checks and actual execution

- `client/src/features/staff/staffAuthority.test.mjs`: **12** native-style pure policy tests (role matrix, PIN/role override drift, company scope, disabled staff, shift mismatch/closed/future date, approval generation/amount/expiry).
- `server/tests/run6AuthorizationEntrypoints.test.mjs`: **7** native-style static drift tests covering the guarded sensitive reads, reporting, writes, stale credentials, exact supervisor approval, shift close and sale discount DB revalidation.
- **19/19** committed tests executed successfully in an isolated JavaScript V8 compatibility runner against the fetched exact branch sources. This is **NOT native Node `node --test`**, real IndexedDB/Vitest, browser, TypeScript semantic check or GitHub Actions.
- `client/src/features/staff/staffRun6.test.ts`: **13 authored, unexecuted Vitest/IndexedDB cases** for stale PIN/role, locked session, supervisor shift+audit, disabled/changed supervisor, closed shift, role/permission mutation, sale posting positive/denied and shift integrity.
- `client/src/features/staff/run6ReadEntrypoints.test.ts`: **5 authored, unexecuted Vitest/IndexedDB cases** spanning bootstrap, locked staff, cashier vs reporting permissions, owner and revoked permission.
- Existing `client/src/features/staff/staff.test.ts` updated to provide an open shift and await DB-validated supervisor approval consumption; **not executed**.
- Total new focused tests authored: **37** (19 isolated-run + 18 Vitest unexecuted). Do not treat the 19 mocks as native test acceptance.

## Deferred QA and remaining Run 6 blockers

1. Full native Node 24/pnpm tests, semantic TypeScript `pnpm check`, all Vitest, Vite build, Playwright/offline browser and exact-final-SHA CI; rerun and fix any failures. Historical Actions jobs on predecessor branches failed pre-execution (zero job steps); this run has no green exact-head proof.
2. Real Windows low-spec device and supported browsers: genuine IndexedDB transactions, PIN enrollment/unlock/disabled staff, WebAuthn, reopen/reload, tab contention, shift open/close, supervisor PIN delay and live checkout rollback. Test multiple company histories and preserve saved records.
3. Run the 18 new IndexedDB/Vitest tests and existing staff/checkout regression cases, then exercise a full owner/supervisor/cashier action matrix over **all** local service entrypoints. These specific read/write modules have new source guards, but the entire large local/assistant ecosystem is not exhaustively proven.
4. Device-local staff authority is not tamper-proof: IndexedDB staff hashes and role values remain editable to a user controlling the machine; failed PIN attempt counters are only in memory and can reset on restart. Legacy companies without any staff still allow pre-staff local operations to preserve backward compatibility. An accidental removal of all staff records could revive legacy behavior; before commercial release design and test a durable governance-activation marker with complete appMeta/write-transaction coverage and a safe recovery path.
5. Confirm coordinated Web Locks across all writers, staff session expiry during mutations, crash/power-loss and cross-tab approvals, authenticated UI/audit read secrecy, PIN strength/rate limiting and independent security review. Supervisor approval is memory-only by design and not replay-safe across independently malicious processes, though real discounted sale posting rechecks current stored credentials.
6. Canonical cloud membership (`owner|attendant`) is separate from local staff (`owner|supervisor|cashier`). No automatic cloud-staff role mapping, shift privilege or synchronization is authorized; the cross-tenant/remote revocation gates of Runs 2–5 remain open.
7. Historical release blocker register (**47 issues**) and acceptance register (**82 units**) remain at prior classifications; this source increment does not automatically promote any gate. No SQL migration, live payment, staging, branch merge to `main`, production data transfer or deployment.

## Final disposition

**Run 6 development implementation delivered as one increment for review. Run 6 acceptance NOT PASSED; Runs 2–5 remain unaccepted. Commercial NO-GO.** Proceed to the next *development* run under the owner's cadence without claiming a release pass.
