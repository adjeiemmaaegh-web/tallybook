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
