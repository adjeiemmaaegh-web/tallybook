# Multistore — Tallybook Stage 9 development journal

**Last reviewed:** 2026-10-14 (Asia/Dubai)  
**Development branch:** `stage9/multistore-integration-20261014`  
**Parent brand:** Alchemy; **product:** Tallybook  
**Release status:** **NO-GO / INCOMPLETE**. This branch is for development and later owner-run PC testing, not live multi-store commerce.

## Owner's working agreement

Development continues round by round. The owner will download the GitHub project to a Windows PC with Git, Node.js and pnpm installed and run full acceptance tests after the implementation rounds. Scarce GitHub Actions/Vercel usage must not halt source development. Static code inspection and targeted tests remain useful but **cannot guarantee bug-free behavior**, particularly for accounting, migrations, authentication, two-device offline operation or concurrency. Never report a test as passed unless it actually ran, and never turn incomplete product availability flags on merely to appear finished.

**Production safety:** Keep `main` as the active production branch; changes for Stage 9 are made to this separate development branch. A Vercel preview may still be automatically built from branch pushes. Do not deploy the branch to production, update live Supabase financial schema or modify real business records as part of these development rounds.

## Source identity and progress

- Original verified baseline: `8390c59acb40dbd8e497848674a2558bed3a5fa8`; IndexedDB schema v28; Node `24.19.0`; pnpm `10.34.0`.
- Main advanced to `1d772d70163ce4b01d95f325321b64e651d17a81` with premium navigation. The integration preserves this newer shell rather than replacing it with the older cloud PR's AppShell.
- First reviewed integrated candidate: `1adec3bc9e1bb0ec6e67be5abb1b87907384e25c`. Newer refreshed candidates include `65e4151f5a3260cd185129cc62521a4abbd6aadf`, `94f5fcba22d19c2847bb5c25c365410ebac085d3`, and most recent source candidate **`49c765b787e60259f4f8e10c60f6aba390374306`**.
- Cloud PR #4 was incorporated from pinned `779a934fc0c4739db940e71bf2bec5f8c189154c`; security PR #7 from pinned `4488b050ed964fd3cc623200ec67c6fa2ab00a93`. Do not automatically merge the original draft PRs again: that would double-apply or overwrite reviewed integration changes.
- Canonical actual Supabase identity model: `businesses(id,owner_id,...)` and `business_members(business_id,user_id,role)` with `owner | attendant`. This is NOT the earlier hypothetical `company_memberships` table. External `attendant` maps to internal `staff` **only** for the inactive identity policy. Client checks are not a replacement for server-side transaction authorization and RLS.
- Current round: **Round 1 / identity and authorization — PARTIAL**. AuthGate remains opt-in and disabled by default, and local business data is not automatically bound to any signed-in user. Server ownership/recovery modules are staged, not remotely activated.
- Updated premium account nav points to `/account`; the local PIN lock permits `/account` and `/staff` to render without granting sale, stock or other business operations. See `docs/release/STAGE9_ROUND1_LOCKED_ACCOUNT_REVIEW_2026-10-14.md`.
- Round 0 evidence: [Issue #8](https://github.com/adjeiemmaaegh-web/tallybook/issues/8). Round 1 ongoing: [Issue #9](https://github.com/adjeiemmaaegh-web/tallybook/issues/9).

## Stage 9 work still required

| Round | Delivery | Current assessment |
|---|---|---|
| 0 | Baseline, branch and dependency evidence | Completed |
| 1 | Authenticated identity, company membership, safe legacy data binding, store and device access | Partial; server/API/binding and comprehensive tests outstanding |
| 2 | Historical finance and inventory migration, verifiable store opening balances | Missing |
| 3 | Authoritative store stock movement ledger and invariant tests | Missing |
| 4 | Real request/dispatch/receipt transfers with idempotency | Missing |
| 5 | Store-bound attendant checkout, company-specific refund rules | Missing |
| 6 | Durable device sync and offline conflict/replay safety | Missing |
| 7 | Store financial reporting and owner-wide consolidated totals | Missing |
| 8 | Full migration, security, financial, device and recovery acceptance | Missing |

Earlier Stage 9 `S9-01..05` local store directory, assignments, observations, transfer requests and local reports exist, but are *not* authoritative multi-store commerce. `S9-06..10` were missing in the baseline register; `S9-11` acceptance remained implemented-unverified.

## Code review and QA evidence

- Previous baseline main GitHub Actions run `38390091431` passed **773 client Vitest tests**, **471 Node tests**, six browser/offline tests, semantic TypeScript, build and dependency audit. Those results are **not** evidence of this integrated branch.
- A focused cloud-membership model suite was reported **8/8** using a local Node 22 mirror in prior work; this does **not** certify the current combined tree.
- A subsequent static inspection of the exact prior candidate checked eight routing/guard source invariants and passed **8/8**. These are code inspections, **not executed browser or integration tests**.
- Changed source is staged with native `qa/stage9-cloud-membership-contract.test.mjs` and `qa/stage9-auth-shell-contract.test.mjs`, plus Vitest tests for security and cloud. **Full tests on the combined branch have not run.** Node 24, Windows, real OAuth, two authenticated users, Dexie migration/restore, concurrency and crash recovery remain unverified.
- Known limitation: automatically previewing this branch can consume Vercel usage. Vercel previously showed SSO protection for non-custom-domain previews, **not a guarantee that previews will not build**.

## Windows PC test recipe — run later, after round development

Use PowerShell in a new **test-only folder**. If the repository has already been cloned, fetch and switch branches without deleting the existing working copy or resetting stored data:

```powershell
git clone https://github.com/adjeiemmaaegh-web/tallybook.git tallybook-multistore-test
cd tallybook-multistore-test
git fetch origin
git switch --track origin/stage9/multistore-integration-20261014
node --version
pnpm --version
corepack enable
pnpm install --frozen-lockfile
pnpm test
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm exec playwright test --config playwright.offline.config.mjs
```

**Windows shell note:** The `qa/*.test.mjs` wildcard expansion varies across shells. If the native Node command does not discover tests, use the repository's CI workflow from `.github/workflows/release-validation.yml` as the canonical command executed in a compatible shell, or run `node --test` with explicit file paths. Running on Windows should use an isolated test workspace with synthetic business data—not a browser profile containing live records.

Record: OS/Node/pnpm versions, Git SHA (`git rev-parse HEAD`), failing test and stack trace, browser errors, IndexedDB migration/backup restore results, and two-device activity logs. Do not turn on real payments or connect production records while testing.

## Open risks — must resolve before release

- Authentication: verify real Google OAuth completion, sign-out/account switch, revoked sessions, stale offline identity, tenant RLS and local-company ownership proof. A signed-in user must not automatically see someone else's cached business.
- Recoverability: explicit backup + restore drill before any binding, no silent ownership claims, rollback for interrupted migrations.
- Server writes: validate live membership, staff/store permissions and fresh device grant on every money/stock mutation; client gates alone are not security.
- Stock and finance: no duplicated sale or transfer, no negative phantom quantities, no last-write-wins financial conflict, preserve historical unit cost and per-company configurable refund policy.
- Version drift: source PRs and `main` may evolve during rounds. Review new deltas rather than blindly overwrite integrated work.
- CI/Vercel quotas: prefer focused local validation during coding; deferred owner PC acceptance does not convert an untested feature into 'passed'.

## Round-by-round update protocol

At the end of each development round, **update this same `Multistore.md`** with exact commit SHA, touched modules, invariants/code-review findings, tests actually executed, untested items, observed failures, blockers, data migration impact and instructions for the next round. Leave the release at NO-GO until the owner completes and reviews the acceptance suite. Do not claim all bugs are gone solely from inspection.


## Round 1 continuation — offline account fail-closed (2026-10-14)

**Change:** `client/src/auth/AuthGate.tsx` no longer treats a localStorage offline-user marker as authorization to mount an arbitrary local ledger while the optional authentication gate is enabled. This previously allowed cached account A's marker to open cached device records even with no verified company binding. Marker changes from other tabs, including switching to another nonempty user, now close the session view. Two existing Vitest regression cases have been changed to assert fail-closed behavior.

**Tradeoff:** Enabling mandatory cloud AuthGate now blocks offline ledger access when the session cannot be verified. This is intentional and temporary until a separate, recoverable, company-specific offline ownership binding/grant is designed, implemented and tested; it does not change ordinary offline-first behavior because the mandatory AuthGate flag remains **off** by default. Do not remove this guard merely to restore offline access; finish the explicit local account binding and per-device proof first.

**QA:** Source reviewed and regression test cases updated, but full Vitest, browser, types and multi-account tests are deferred. Production is untouched. Round 1 remains PARTIAL and release NO-GO.
- **Follow-up hardening:** cached non-null `getSession()` while offline and offline auth listener sessions also cannot grant ledger entry when the mandatory AuthGate is enabled; added dedicated Vitest regression for the cached offline session path. No full suite executed yet.

## Round 1 continuation — trusted ownership clock (2026-10-14)

- In `server/trustedCompanyOwnership.mjs`, a server-only ownership operation previously checked recovery expiry and wrote binding/audit timestamps using separate clock calls.
- Updated `operate` to obtain one positive safe-integer time value inside the transaction, deny invalid clocks, and reuse the timestamp for proof expiry, binding creation and ownership audit. This is not a client grant or a deployment.
- Added two Node regression test cases in `server/tests/trustedCompanyOwnership.test.mjs` for shared audit/binding timestamp and an expired-recovery boundary.
- Review limitation: no complete Node/Vitest/build/browser execution was performed on this branch. A server-issued and independently reviewed recovery proof remains mandatory. Local company binding, authorization, and finance sync are not active.
- Commit history on `stage9/multistore-integration-20261014` preserves this patch. **Round 1 PARTIAL / Release NO-GO.**

## Round 1 continuation — consistent owner membership during transfer (2026-10-15)

- **Finding:** `transferOwner` validated the old owner's `business_members` row, then fetched the same row a second time for demotion. Re-reading is redundant and risks using a different, unvalidated object if the adapter changes or has a faulty implementation.
- **Fix:** retain `currentOwnerMembership` returned by the first transactional read. Validate it as an active owner and use that same record when updating the former owner to `attendant`. The destination membership, server-issued transfer proof, company owner update, recovery consumption, and audit remain required within the same transaction.
- **Regression added:** `server/tests/trustedCompanyOwnership.test.mjs` tracks transactional membership reads and asserts exactly one lookup per actor/recipient and correct persisted roles, proof consumption and audit.
- **Verification:** source reviewed; new test is written but not executed on the full repository yet under the agreed owner-PC deferred QA plan. No Vercel/Supabase operations or production change. **Round 1 remains PARTIAL; release NO-GO.**

## Round 1 continuation — cloud-company binding uniqueness (2026-10-15)

- Found that private PostgreSQL `getBinding(companyId,localCompanyId)` searched for a specific local ID even though `company_local_bindings.company_id` is the unique primary key. Rebinding the same company to a different local ID should be recognized as an existing association before insert.
- Updated the read to lock and inspect any binding matching the cloud company ID; report the actual existing local company ID and reject inconsistent multiple rows. The database primary key remains the authoritative concurrency defense.
- Added a native Node regression for attempted rebind with a different local ID and parameterized lookup.
- GitHub-backed source review only; the new regression and full acceptance suite remain unexecuted. No database migration, live writes, production promotion, or feature activation. Round 1 remains partial; release NO-GO.

## Round 1 continuation — conditional ownership updates (2026-10-15)

Review found that the PostgreSQL ownership-transfer UPDATE verified only the cloud company ID, rather than also verifying the expected former owner. The service now passes the validated former owner to the adapter. The SQL operation checks both company ID and previous owner ID and requires exactly one row; otherwise its transaction fails closed. Updated the pure service transaction test double to enforce the same rule and added a native SQL predicate regression. The change affects inactive server-side ownership recovery only, not production data or schema. Full Node, Windows, TypeScript, browser and database integration tests are still deferred, and the release remains NO-GO.

## Round 1 server-side store/device authorization foundation (2026-10-15)

- Added `server/storeDeviceAuthorization.mjs`: server-only fail-closed authorizer that independently resolves an active identity and demands a fresh authoritative membership, active store, active device grant, company/store/device/user matches, grant expiry, and role-specific operation. It never reads local browser state and denies unrecognized actions. Owner may access management/stock; attendant is scoped to reads and a future sale capability.
- Added `server/tests/storeDeviceAuthorization.test.mjs` with positive, negative, revocation, wrong-tenant/device, expiry and no-cache cases, and `docs/security/STAGE9_ROUND1_STORE_DEVICE_AUTHORIZATION.md`.
- **Not yet connected:** authoritative device-grant table, trusted grant-issuance endpoint, verified local binding UI, and service-level write-path enforcement. Client UI AuthGate cannot by itself isolate local IndexedDB account data. The new security code is inert and must not be represented as full completed Round 1.
- Tests were written but have not been executed on the combined branch. Full acceptance remains owner-PC deferred. No live DB modification or production deploy. Release NO-GO.

### Round 1 server-only scope adapter draft
Introduced `server/storeDeviceBoundaryPostgres.mjs`, SQL contract `docs/security/STAGE9_ROUND1_STORE_DEVICE_SCHEMA.sql`, and native SQL reader tests. The SQL is review-only and deliberately not installed: it introduces canonical store scopes and expiring, revocable store/device grants, private to the trusted server. Real issuance and account-to-local binding remain required before any data access. These modules are not connected to HTTP financial writes or local IndexedDB; implementation is NOT ready to claim Round 1 complete.

## Round 1 continuation — owner-approved store/device enrollment lifecycle (2026-10-15)

**Branch:** `stage9/round1-enrollment-lifecycle-20261015`; **implemented/tested code commit:** `d43da289b6020219279a3c8be1048a05521cb8bd` (branched from `cea840632e8b4f03ceabe7ae899d0d7c5bfe3da2`).

- Added server-only `server/storeDeviceEnrollment.mjs`: active authenticated owner issues a 10-minute one-use invitation to an existing member for an active store; the independently authenticated target can redeem once for an 8-hour scoped device-grant handle, or the current owner can revoke it. Token only stored as SHA-256 digest; all actions auditable and wrapped in a serializable transaction.
- Added `server/storeDeviceEnrollmentPostgres.mjs` and `server/storeDeviceEnrollmentCoordinator.mjs`. The coordinator reuses the trusted Supabase getUser/session verification; mutations also re-check and lock the server-owned `auth.sessions` row **inside** the transaction, reducing revocation race risk.
- Added an **unapplied** SQL contract at `docs/security/STAGE9_ROUND1_ENROLLMENT_SCHEMA_REVIEW.sql`, and three native regression test modules. **19/19 focused native Node 22.16.0 tests executed and passed** using transactional/SQL doubles. The seven newly committed code/test/schema file Git blob hashes matched the locally tested files (7/7). The underlying existing Supabase resolver was also mirrored from its exact Git blob.
- Security boundary: grants remain expiring bearer handles **without cryptographic hardware/device proof**; per-store member assignment, authoritative PostgreSQL integration, encrypted recovery, and protected route/write-path wiring are still missing. These new modules remain inactive, and SQL was not run or deployed.
- **Unverified:** live Supabase/PostgreSQL serialization/RLS, Node 24/Windows, full repository native/Vitest/TypeScript/build/Playwright, browser IndexedDB migration, multiple devices, revocation under real concurrency.
- Detailed notes and next implementation steps: `docs/security/STAGE9_ROUND1_ENROLLMENT_REVIEW_2026-10-15.md`. Release status unchanged: **Round 1 PARTIAL; Stage 9 NO-GO/INCOMPLETE**. No staging, production, cloud migration, payment or live financial authorization.



## V19 full 20-run handover added to Stage 9 roadmap (2026-10-15)

**New required dependency reference:** `docs/release/STAGE9_20_RUN_ROADMAP_ALIGNMENT_2026-10-15.md`, reconciled against the authoritative [FULL_20_RUN_HANDOVER_2026-10-15.md](https://github.com/adjeiemmaaegh-web/tallybook/blob/security/auth-company-boundary-20261013/docs/release/FULL_20_RUN_HANDOVER_2026-10-15.md) (document blob SHA `69d85f15b3959a899f6b398acbb8678d073260b9`).

**IMPORTANT: Different numbering.** The *nine Stage 9 rounds (0–8)* are a multi-store implementation breakdown. They are **not equivalent to, and cannot replace**, the owner's *20 sequential V19 development/acceptance runs (1–20)*. V19 Run 1 previously passed at its historical SHA; V19 **Run 2 remains OPEN and NOT PASSED**. Its requirements must be implemented, actually tested and rerun at the exact final commit before declaring Run 2 PASS or advancing to V19 Run 3. Source preparation on other Stage 9 review branches does not constitute any accepted V19 run.

**New crosswalk and mandatory backlog:** The alignment file preserves every V19 run (2 identity/ownership; 3 membership; 4 authentication; 5 tenant access; 6 staff; 7 crash atomicity; 8 backups/migrations; 9 inventory costing; 10 receivables; 11 refunds; 12 supplier/tax; 13 multi-store; 14 sync; 15 payment sandbox; 16 public commerce; 17 assistant/BI; 18 hardening; 19 hardware/UAT; 20 staging/release), maps them to Stage 9 rounds, and names the evidence required to close each gate.

**Immediate acceptance priority:** Restore actual CI or reproduce it on a trusted local/Windows runner, complete server-vouched backup/restore ownership proof and direct-TLS-only private integration, validate real Supabase owner/attendant/RLS and two-account/two-company isolation on disposable test resources, preserve the offline local businesses, and run complete exact-head client/native/types/build/Playwright/offline/audit checks. In particular, PR #12's **19/19 focused mock-based native passes** do *not* pass V19 Run 2 or Stage 9 Round 1.

**Registers unchanged:** 47 V19 blockers (3 implemented-and-tested, 35 implemented-unverified, 6 missing, 3 blocked) and 82 acceptance units (1 implemented-and-tested, 60 implemented-unverified, 18 missing, 3 blocked), verified against the security branch's release JSON. The handover's pinned implementation `4488b050` has since become security branch head `60c4c77` via a **documentation-only** commit; do not conflate either with the Stage 9 branch or assume successful tests at the newer SHA.

**Production constraints:** No silent legacy-company binding, cloud sign-in requirement for offline-only customers, unauthorized global refunds/tax, live SQL re-application, production/staging deployment, financial sync/payments or merge. The owner must separately approve restricted environment tests and activation. **V19 Run 2 NOT PASSED; Stage 9 Round 1 PARTIAL; overall release NO-GO.**



## V19 Run 2 — transaction-bound independent recovery verification (2026-10-15)

**Branch:** `v19/run2-transactional-recovery-20261015`, stacked on Stage 9 review head `359ea1666225d802629f868c52af48ef283f2b02`. This is still a **draft**, and not a passing V19 run or deployed change.

- **Root cause:** the former recovery issuer trusted reviewer/evidence callbacks checked *outside* the approval-issuance transaction. Its proof/authorization could become stale before writing the approval.
- **Code:** recovery issuance now requires a fresh live `auth.sessions` row lock, an active authorized reviewer row, and the exact independently reviewed evidence row lock within the SAME SERIALIZABLE transaction. The record is consumed conditionally with the approval and audit; duplicate/revoked/stale/foreign proof fails closed. Server coordination no longer accepts injected callback-based reviewer/evidence claims.
- **Review-only schema:** `docs/security/STAGE9_RUN2_VERIFIED_RECOVERY_SCHEMA_REVIEW.sql` defaults newly inserted evidence to **pending**, not verified; it proposes restrictive RLS-protected reviewer/evidence tables and restore-manifest/receipt/transfer-review digests; **not applied** to Supabase or any real database. Such digests are only record identifiers, not evidence that a genuine restore was performed. Legitimate external verification and reviewer enrollment remain missing.
- **Executed focused QA:** local Linux Node 22.16.0 **20/20 passed, zero failures/skips** across four Run-2-focused test files. The three unchanged core dependencies and all eight changed source/test/schema files matched exact GitHub Git-blob hashes in the local test mirror. Updated rerun log SHA-256 `393f70e3d4de869368494c3429c8151371b487d66a4a162bdfef634497d36f4d`. These tests used SQL doubles/memory transactions, not real Supabase/PostgreSQL or Windows.
- **Detailed evidence:** `docs/release/RUN2_TRANSACTIONAL_RECOVERY_EVIDENCE_REVIEW_2026-10-15.md`; owner V19 handover crosswalk remains `docs/release/STAGE9_20_RUN_ROADMAP_ALIGNMENT_2026-10-15.md`. No changes to 47 release blocker statuses or 82 acceptance unit statuses.
- **Still required for Run 2:** independent proof creation and real backup/restore drill; owner confirmation and recoverable account-link UI; approved disposable database/RLS concurrency tests; real private server/Edge endpoint and rate-limit/CSRF controls; full exact-head native/client/types/build/browser/offline/audit acceptance. GitHub Actions budget/runner pre-job failures remain unresolved.

**Status:** V19 **Run 2 NOT PASSED**; Stage 9 Round 1 **PARTIAL**; commercial release **NO-GO**. Do not advance to V19 Run 3 or enable any live cloud/financial function.


### Run 2 verification follow-up — pending evidence safeguards (2026-10-15)

Source review caught an unsafe evidence-table default and corrected it before any deployment: newly created recovery evidence now starts as `pending`, with a separate explicit review transition required for `verified` status. The issuer rejects pending/revoked/consumed records; SQL schema guards check that there is no implicit verification. The rerun recorded **20/20 focused Node 22 tests passing**, log SHA-256 `393f70e3d4de869368494c3429c8151371b487d66a4a162bdfef634497d36f4d`. No genuine evidence issuance, independent backup/restore drill, reviewer provisioning, real PostgreSQL migration or full release QA was executed. **Run 2 NOT PASSED; Stage 9 Round 1 PARTIAL; commercial release NO-GO.**


## V19 Run 2 continuation — ownership session revocation inside transactions (2026-10-15)

**Root cause:** Before this increment, local-company cloud binding and owner transfer relied solely on the outer Supabase session resolver, leaving a revocation gap before an otherwise authorized SERIALIZABLE database mutation. Recovery-approval issuance had already been strengthened, but binding/transfer had not.

**Correction:** The trusted ownership service now requires `sessionId` with `userId` from server-verified Supabase Auth; before reading the company or its membership, it calls a live `auth.sessions` row check **inside the same serializable transaction**. The PostgreSQL ownership adapter reuses the existing expiry-aware parameterized `FOR SHARE` session lookup from the recovery-approval adapter. This does not accept a browser-selected company/owner or confer access without an approved recovery record.

**Verification scope:** Added six unexecuted native regression cases across ownership service, transaction adapter and private coordinator. Executed **8/8 isolated JavaScript V8 behavior checks against exact committed code** (six negative/SQL, two positive; first harness's stale reference errors were corrected) and **5/5 isolated syntax parses** of changed JS/test files. These are not the full Node/Vitest/type/build/browser/real-DB test matrix and are not acceptance evidence for the final branch SHA. Prior recovery-evidence 20/20 local Node results apply to an earlier commit only.

**Release controls:** V19 Run 2 **OPEN / NOT PASSED**; Stage 9 Round 1 **PARTIAL**; 47-blocker / 82-acceptance-unit historical registers unchanged. No migration, live Supabase access, production route, cloud sync, payment, staging, merge to `main` or deployment authorization.


## V19 Run 2 continuation — transaction-time JWT expiry (15 October 2026)

Review-only security hardening was committed to draft PR #13: the verified Supabase JWT expiration is now propagated by `server/supabaseOwnershipSession.mjs`, and the private company-binding, owner-transfer and recovery-approval services deny authorization when the transaction starts at or after the JWT deadline, even if `auth.sessions` has not yet expired. The previous transaction-bound session lock remains mandatory.

Four new `node:test` regression cases were authored; **native Node execution remains unverified**. Six isolated V8 checks of proposed source passed before commit; the **52 checked-in test cases** across six native-test modules were executed on exact source/test checkpoint `159adbed868ef9503553ce0744b4fcb8d704eba3` through a **V8 compatibility harness**, passing **52/52** after harness repairs. This is **not** Node/CI, real Supabase/PostgreSQL, backup/restore or release acceptance. GitHub Actions run `38773123967` failed before steps; the exact final-head full suite remains unexecuted.

Evidence and required recovery/owner-link/database/CI gates: `docs/release/RUN2_JWT_EXPIRY_CONTINUATION_2026-10-15.md`. No live database migration, connection, HTTP route, payment, cloud activation, deployment or merge to `main`. Historic 47 blocker / 82 acceptance-unit statuses are unchanged. **V19 Run 2 OPEN / NOT PASSED; Stage 9 Round 1 PARTIAL; commercial release NO-GO.**

### Run 2 reviewer self-approval gap closed (15 October 2026)

The trusted recovery issuer now rejects an approved ownership-transfer reviewer who is also the transfer recipient. A corresponding reviewer/recipient inequality constraint was added to the **review-only, unapplied** verified-evidence SQL schema. One negative native regression was authored. All **53** checked-in focused test cases passed in an isolated V8 compatibility harness at source/test checkpoint `f512e718c0a37b0a659666a34c4d1d7bdacd331f`; **native Node/CI/real PostgreSQL/Supabase acceptance has not been executed**. Details: `docs/release/RUN2_JWT_EXPIRY_CONTINUATION_2026-10-15.md`. No live DB changes or deployment. **Run 2 OPEN / NOT PASSED.**


## V19 Run 3 — entire cloud-membership source increment (15 October 2026)

Per the owner's updated cadence, Run 3 source development proceeded while Run 2 independent acceptance remains open. Starting point: draft Run 2 `939e06de8eb313b64211beeb1c94e26859b4af5b`; separate review branch `v19/run3-cloud-membership-20261015`. Implemented canonical `owner|attendant` targeted invites, independent recipient redemption, member/invitation revocation, owner listing, atomic private SQL audit, strict service tenant/session checks, review-only RLS and legacy-RPC lockdown SQL, default-disabled private API and opt-in UI with cloud company selector. No local POS/IndexedDB record changes.

Run 3 authored **23 native-style focused cases**; isolated V8/mocked tests passed **23/23** (12 service, 5 SQL adapter, 6 HTTP). This is **not** native Node/CI or real PostgreSQL/Supabase acceptance. Vitest, types/build, full CI, live two-account RLS and Windows/browser tests remain deferred. Gated test-only real RLS probe was prepared but not executed. See `docs/release/RUN3_CLOUD_MEMBERSHIP_FULL_INCREMENT_2026-10-15.md`. Source work delivered; endpoints and SQL are unapplied/default-off. **Run 2 OPEN/NOT PASSED; Run 3 OPEN/NOT PASSED; Stage 9 PARTIAL; commercial release NO-GO.** No production DB/payment/deployment or `main` merge.


## V19 Run 4 — AuthGate, account changes and cloud session revocation (16 October 2026)

Per the owner's whole-run development cadence, Run 4 source was authored on a dedicated branch from Run 3 draft SHA `e68619ff14937d4ce19951002f5a4c5e12f5f897`. A verified ephemeral session controller now demands Supabase `getUser()` and a matching unexpired session; the cloud-only AuthGate additionally requires an approved, default-OFF private `auth.sessions` probe. Signed-out cached tokens cannot reauthorize cloud UI; account switching, stale requests, token rotation, expiry, offline, and cross-tab/focus revalidation are handled without changing the existing offline ledger or claiming local encryption. Cloud membership and owner-link responses are rechecked against the initiating account/token.

New focused Node-style tests: **29/29** in isolated V8 compatibility execution (22 controller, 7 server probe). React/Vitest UI cases: **10 authored, not executed**. Native Node/CI, semantic TS/Vite, browser/Windows and genuine Supabase/PostgreSQL revocation tests are DEFERRED / NOT EXECUTED, per owner instruction. Complete paths, evidence limits and QA matrix: `docs/release/RUN4_AUTH_SESSION_FULL_INCREMENT_2026-10-16.md`.

**Run 4 source delivered for review; ACCEPTANCE NOT PASSED.** Run 2 and Run 3 acceptance remain open; 47 historic blockers/82 units unchanged; commercial release NO-GO. No live SQL, cloud financial sync, payments, `main` merge, staging or deployment.


## V19 Run 5 — Tenant data authorization source and GitHub write diagnosis (16 October 2026)

Run 5 branch `v19/run5-tenant-authorization-20261016` was created from Run 4 draft `f983c7c924b1454c0cf0d2b215498887fd47d01e`. The first large combined GitHub mutation returned a generic safety-check block, leaving no source/test files. Smaller standalone GitHub create-file calls succeeded without disabling any safety mechanism, beginning with policy commit `834271e4ffe105cb87b58bcf190aa5237d45b0ff`. Exact internal trigger is unknown. Committed: canonical owner/attendant tenant action policy, live session plus membership checking inside serializable transaction, default-off cloud resource route + runtime and read-only Supabase RLS catalog review. `27/27` focused cases passed in isolated V8 compatibility tests (10 policy, 9 authorizer, 8 route). Native CI/Node/browser, real PostgreSQL and two-tenant Supabase RLS tests remain NOT RUN. Existing legacy local financial, backup, assistant and sync routes are not all automatically gated by this new cloud layer; full path coverage and cloud table RLS integration remain open. See `docs/release/RUN5_TENANT_AUTH_AND_WRITE_BLOCK_DIAGNOSIS_2026-10-16.md`. Runs 2–5 NOT PASSED, Stage 9 partial, release NO-GO. No live SQL, payments, cloud finance sync, production deployment or main merge.


## V19 Run 6 — local staff authorization, supervisor shifts and audit (16 October 2026)

Owner-authorized whole-run implementation on draft `v19/run6-staff-authorization-20261016` based on Run 5 `d06bdfe9b390f9f67a466278b4280cd5398a4e35`. Reconciled local `owner|supervisor|cashier` permissions with the **separate** cloud `owner|attendant` schema. The Run 6 increment binds unlocked sessions to current PIN/role/overrides, denies stale session after role/PIN change, checks current shifts, writes audited supervisor discount approval, and verifies the approver and cashier during **the actual sale transaction**. Local service reads for sales, customer, inventory, supplier/purchases, expenses and reporting now consult current staff authority; StaffPage limits shift/audit data to the verified actor. Existing stored transactions, stock, receivables and historical ledger formats are unchanged.

`12/12` pure policy plus `7/7` static entrypoint regression cases passed in isolated V8 JavaScript runners; **18 new Vitest/IndexedDB cases authored but unexecuted**, and an existing staff suite updated. Full native Node 24/pnpm, semantic TypeScript/Vite, Playwright/real browser, low-spec Windows and complete exhaustive service entrypoint acceptance are unverified. Memory-only PIN rate limiting, locally editable IndexedDB and legacy no-staff bootstrap behavior remain security boundaries; cloud sign-in does not authenticate local staff or encrypt local data. Handover: `docs/release/RUN6_STAFF_AUTH_FULL_INCREMENT_2026-10-16.md`.

**Source implementation delivered for review only — Run 6 NOT PASSED.** Runs 2–5 open, Stage 9 PARTIAL, commercial NO-GO; no live SQL, payments, cloud financial sync, deployment or `main` merge.


## V19 Run 7 — cross-IndexedDB snapshot consistency, write barriers and crash recovery (16 October 2026)

Owner-authorized full-run source continuation based on Run 6 draft SHA `23b06f9f6fb5b94cc4441f3ce83f7ca3037d7bab`. Run 7 preserves the existing `restoreRecoveryJournal` preimage/postimage and main-ledger commit decision; adds a fail-closed recovery state classifier for interrupted restore/clear, an exclusive Web Lock spanning retail plus assistant **backup reads**, source-company-bound backup metadata, and recovery-journal checks **inside** critical retail write transactions for sales, repayments, purchases, supplier liabilities, expenses, wallet transfers, refunds/reversals and inventory/catalogue adjustments. If Web Locks are unavailable, coherent two-DB backup export now refuses to proceed while routine legacy offline operations remain as before. Exact source paths, compatibility and risks are in `docs/release/RUN7_CROSS_DB_ATOMICITY_FULL_INCREMENT_2026-10-16.md`.

Focused **38/38** native-style cases passed in isolated V8 simulation (not native Node or actual IndexedDB); **16** browser/IndexedDB cases authored and NOT EXECUTED. Native pinned Node/pnpm, semantic TS/React/Vite, actual multi-tab low-spec Windows, disk/power interruption and browser acceptance remain DEFERRED. Advisory Web Lock participation is not exhaustive; raw IndexedDB and auxiliary local service mutations need audit. Backup export timestamp is **not proof the customer retained/recovered the downloaded file**. Run 7 source development delivered; Runs 2–7 **NOT PASSED**, historical blocker/acceptance status unchanged; V19 commercial **NO-GO**. No live data sync, payment activation, staging, main merge, database SQL or deployment.


## V19 Run 8 — encrypted local recovery and verified-file migration (16 October 2026)

Whole-run source increment from Run 7 draft head `ccb03e864d24917f6f1edcaeb322b8ebb9bd3e0e`. Local ledger IndexedDB schema remains **v28**; no live data migration or Supabase operations. Added explicit table-introduction compatibility for older portable backup files, reject-unknown future money and assistant fields, duplicate/unsafe JSON key preflight, AES-256-GCM encrypted-v2 outbound envelopes with fixed authenticated PBKDF2-SHA256 parameters and old encrypted-v1 **read** compatibility. Every new backup is encrypted, including legacy no-staff companies. Portable plaintext imports require a warning; unexpected encrypted versions do not fall back to plaintext.

The backup UI now requires an actual file to be reselected, SHA-256 byte matched, decrypted, ledger-validated and company-bound before writing `verifiedBackupReceiptV2`. Old click-only `lastBackupAt` records are not read as verification; company restore/delete invalidates the relevant new proof. File re-selection **does not prove off-device retention or a backup of transactions posted after that file was created**. Source-level test evidence: `62/62` isolated V8 checks passed; `20` genuine IndexedDB/WebCrypto tests authored **unexecuted**. Windows QA command and synthetic-data browser fault matrix written **unexecuted**. Full native Node/pnpm, TypeScript/Vite, Playwright, low-spec Windows, crash/reinstall, independent real-file restore and exact-head CI remain open. See `docs/release/RUN8_MIGRATION_ENCRYPTED_BACKUP_FULL_INCREMENT_2026-10-16.md`.

**Run 8 source development delivered, acceptance NOT PASSED. V19 Runs 2–8 remain unaccepted; commercial NO-GO.** No SQL, cloud finance sync, payment activation, staging, deployment or merge to `main`.


## V19 Run 9 — historical FIFO, supplier invoice cost and financial reconciliation (16 October 2026)

The owner-authorized whole-run development increment is stacked on Run 8 draft SHA `f1884ff3925f75755a0b97824c557b096ed2e102` in `v19/run9-inventory-financial-reconciliation-20261016`. The already-implemented local FIFO cost ledger, original receipt layers and company-specific transaction policy are preserved. Run 9 adds a fail-closed **full/partial return-to-original-cost reverse linkage check** (one restored cost event per costed fully reversed sale line, unique matching partial-return cash/stock evidence); a **supplier invoice line vs purchase stock movement vs immutable cost receipt** audit with saved currency and safe-integer totals; and as-of known/unknown inventory assets kept separate from period COGS. Legacy purchases without cost-event lineage are counted as unverified, not backfilled using currently editable unit costs. Real finance snapshot now reads purchase lines transactionally, and CSV/UI show known assets, unknown units, and invoice cost-verification coverage. Portable backup preflight shares the same reconciliation, so a tampered purchase or cost return cannot be silently imported. Cost events are grouped per product and sale lines per sale for lower-resource processing. No local database schema upgrade or cloud money integration.

Source-level tests: **53/53 isolated V8** (15 return integrity, 11 valuation, 15 supplier invoice/cost, 12 integration contracts), **not genuine Node/IndexedDB**. Another **12 IndexedDB/Vitest** regressions authored but **not run**. A safe read-only pinned-Node Windows QA command and detailed synthetic inventory/finance acceptance matrix were added but **not run**. Full native Node, pnpm, semantic TypeScript, actual browser/8 GB Windows, multi-tab crash, backup restore and CI acceptance remain open. See `docs/release/RUN9_INVENTORY_COSTING_FULL_INCREMENT_2026-10-16.md` and `docs/release/RUN9_INVENTORY_FINANCIAL_QA_MATRIX_2026-10-16.md`. Existing 47 issues / 82 acceptance units unchanged.

**Run 9 development source delivered; Runs 2–9 NOT PASSED, Stage 9 partial, V19 release NO-GO.** No live Supabase financial SQL, cloud sync, payment activation, staging, deployment or `main` merge.


## V19 Run 10 — full-history customer debt and prepaid cash/liability conservation (16 October 2026)

Owner-authorized full-run **source-development** continuation from Run 9 draft PR #21 `e80592b71ffec349f35b6092966093df8397ee57`, on `v19/run10-customer-receivables-20261016`. Two new pure audits: `run10ReceivablesAudit.mjs` reconciles **each** customer’s actual credit sales, negative reversals and repayments before totaling the company, preventing a hidden one-customer overpayment masked by another person's debt. It retains optional exact sale-level allocations and historical unknown customer-only allocations, recorded currency and posting-time evidence, uniqueness, and cross-business ownership. `run10PrepaidCashAudit.mjs` separately conserves prepaid deposits, recorded cash refunds, wallet-funded sale consumption, genuine wallet-sale reversals and stored-value customer liability without treating a wallet purchase as an additional external collection or claiming bank/processor confirmation.

The existing `recordRepayment` write now participates in the origin shared Web Lock before opening a Dexie transaction, rechecks selected company, and validates its proposed payment against the exact saved customer ledger inside the posting transaction. The management report reads customers with existing financial records in the same read transaction and displays audited as-of totals; CSV/UI separate linked/legacy repayments and recorded prepaid cash/consumption. Dashboard/end-of-day and portable backup **prewrite validation** also require valid full customer credit conservation and wallet funds evidence. IndexedDB schema stays v28, no exchange-rate conversion, cloud financial SQL, automatic historical allocation, payment activation, unconditional refund or live customer data mutation.

**42/42 focused checks passed in isolated V8 only** (16 customer credit, 12 prepaid conservation, 14 static integration); **12 real saved-data Vitest/IndexedDB cases authored but NOT EXECUTED**. Windows pinned Node 24.19.0 QA command and two-company financial/crash drill matrix are documented but NOT EXECUTED. Full native Node, client tests, semantic TypeScript, Vite, Playwright, actual Windows 8 GB CPU-only, browser Web Locks/crash, independent backup restore and exact-final-SHA CI remain required. See `docs/release/RUN10_RECEIVABLE_PREPAID_FULL_INCREMENT_2026-10-16.md`. **Runs 1–10 have been developed in source, so 10 development runs remain (11–20), but Runs 2–10 acceptance remain NOT PASSED and commercial V19 NO-GO.** Historical 47 issues/82 acceptance units unchanged; no deployment, staging or `main` merge authorized.


## V19 Run 11 — independent per-company refund restrictions, historical policy revisions and exact return evidence (16 October 2026)

Author-approved full source-development increment stacked on Run 10 draft PR #22 at `55fc621f1179bd620d4bfa30851742f84c8a6629`, branch `v19/run11-company-refund-policy-20261016`. Every new and legacy business is **NO REFUNDS by default** until the authorized owner explicitly saves an opt-in revision. Each company separately configures whether exact local full-sale reversals or narrow physically confirmed cash-only partial restocks are permitted, plus a return age (1–3650 days). A settings UI saves reasoned, ordered owner policy revisions and staff audit in the same IndexedDB transaction, without replacing previous revisions. Other company profile edits preserve policy history. At sale posting an immutable return-policy snapshot is saved; new refund posting must match both sale-time and current eligible policy, within the stricter age window, and records the decision-time snapshot in its existing signed money/tax/stock/FIFO return journal. Unsupported customer/provider/card/wallet/batch/service partial refund lanes remain prohibited regardless of preferences.

Original sale history, earlier refunds and company records are **not rewritten**. Legacy refund events without explicit prior policy evidence remain **historically unverified** in management report, CSV and backup import; future returns from sales lacking original terms fail closed. Read-only full reversal/cash-return previews obey policy and the POS hides ineligible cash-return buttons. Portable restore preflight rejects structurally invalid, forged, future-dated or mismatched company policy decisions before any data mutation. No schema version bump (v28 retained), FX, payment gateway, live cloud money or automatic refund payment.

Source tests: **48/48 pure/static native-style cases passed ONLY under isolated V8 mocks** (23 per-company policy, 10 historic audit, 15 entrypoint contracts), not native Node or real IndexedDB. **12 new Dexie/Vitest tests authored but UNEXECUTED**, plus previously positive refund and credit fixtures updated for explicit opt-in and not run. Read-only pinned-Node Windows QA command and complete synthetic business/no-refunds/cash/stock/tax/restore matrix authored, **NOT RUN**. Full Node/pnpm, semantic TypeScript, browser, low-spec Windows, legal review, concurrent tab, crash/backup and exact-head CI remain open. Source handover: `docs/release/RUN11_COMPANY_REFUND_POLICY_FULL_INCREMENT_2026-10-16.md`; QA matrix: `docs/release/RUN11_COMPANY_REFUND_POLICY_QA_MATRIX_2026-10-16.md`.

**Run 11 whole-run SOURCE development delivered. Runs 2–11 acceptance NOT PASSED. V19 release NO-GO. Nine development increments remain (Runs 12–20); next is supplier payable/tax.** No live Supabase SQL, provider refunds, staging, production deployment or `main` merge authorized. Historical 47 blockers / 82 acceptance units unchanged.


## 16 October 2026 — V19 Run 12 full-run source development: supplier payable settlements and invoice tax

The owner authorized continued complete-source-run work from draft Run 11 PR #23 exact head `8f91b8b55c06ac831866660dd352a695c803a8fe`; engineering branch `v19/run12-supplier-tax-reconciliation-20261016`. This is **source development, not accepted release gating**.

Run 12 retains prior separately recognized payable events, manual supplier payments and noncash supplier credits and extends them with independent company/supplier/original-purchase identity and chronology conservation; proposed recognition/settlement re-audits **inside** their atomic RW transaction, same-company and staff/shift checks, idempotent replay and recorded-currency controls. Unrecognized stock receipts remain **unknown liability**, not assumed paid. Supplier manual payments, credit notes and operating expenses stay distinct and are reported **per saved denomination**, with no false provider-confirmed payout, duplicate-disbursement net or FX. Expenses now join the existing shared Web Lock and atomic staff/company/currency verification, and new sale/purchase FX mismatches are blocked after preserving exact historical idempotent retries. Supplier event grouping and per-invoice lookup avoid avoidable expensive scans on low-spec Windows.

Tax still defaults OFF and remains owner-configured, registered, inclusive/exclusive **single-rate only**: new sales now save `taxConfigurationAtSale` (explicit OFF or the exact original registered policy), and independent BigInt reconstruction verifies original invoice discount/tax/total without using today's settings. Earlier sales with no saved tax-configuration snapshot stay *historical unverified*, never retroactively exempt/registered. Backup preflight independently validates both supplier and tax evidence before any restore writes; management CSV/UI show supplier due/cash/manual-reference gaps, tax ON/OFF and legacy uncertainty, with legal/statutory limitations.

Evidence **60/60 isolated V8 mock/native-style tests PASS only** (20 supplier, 19 tax, 21 source integration); **16 real Dexie/Vitest tests authored NOT EXECUTED**. The pinned-Node 24.19.0 Windows readonly command `scripts/RUN12_WINDOWS_READONLY_QA.cmd` and complete `docs/release/RUN12_SUPPLIER_TAX_WINDOWS_QA_MATRIX_2026-10-16.md` were committed **UNEXECUTED**. Native Node/full pnpm client/TypeScript/build/browser, 8 GB CPU Windows, multi-tab race, supplier original currency after owner change, old backup, recovery/crash and exact SHA GitHub Actions still require observed evidence. See full `docs/release/RUN12_SUPPLIER_TAX_FULL_INCREMENT_2026-10-16.md`.

**Run 12 whole-run SOURCE development delivered; 12 of 20 runs developed, 8 remain (13–20). Runs 2–12 acceptance NOT PASSED; commercial V19 NO-GO.** Historical 47 blocker / 82 acceptance-unit statuses unchanged. Next development run **Run 13 — multi-store inventory/transfers/attendant scope**. No live Supabase SQL, provider payments, tax filing, staging, external deployment or `main` merge authorized.
