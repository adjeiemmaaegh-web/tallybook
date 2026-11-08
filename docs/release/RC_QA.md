# Release-candidate verification

## November 9 shared-shop verification

[PR 40](https://github.com/adjeiemmaaegh-web/tallybook/pull/40) passed 981 native/server and 1,165 client tests, five functional Chromium checks, four authentication checks, and three built-app offline checks. The cashier handoff includes navigating directly to Reports and returning to Sales. [Release run](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42535825399).

[PR 42](https://github.com/adjeiemmaaegh-web/tallybook/pull/42) connected the owner Stock screen to transfer request, dispatch, receipt and cancellation. Its release run passed 981 native/server tests, 1,166 client tests and all 12 Chromium checks. Transfer conservation is exercised in isolated PostgreSQL. [Release run](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42536282989).

[PR 41](https://github.com/adjeiemmaaegh-web/tallybook/pull/41) covers overlapping till retries and legacy queue changes during import. [PR 43](https://github.com/adjeiemmaaegh-web/tallybook/pull/43) covers owner access on disconnect and on a rejected membership refresh. [PR 44](https://github.com/adjeiemmaaegh-web/tallybook/pull/44) connects owner-entered orders to quotes, acceptance, closure and matching POS receipts. The order-line read function is exercised only in disposable PostgreSQL during release validation.

Owner evidence remains outstanding for a real OAuth redirect and signed-in return, two-account owner/attendant operation on separate devices, offline restart and reconnect, and restoring a populated synthetic backup on an owner-controlled device. Hosted schema availability also requires independent evidence. CI uses synthetic records.

## Historical release-candidate baseline

Baseline `3caefad023a7004c628c43b0b2e639c4b43ef1ae`. Review [PR 32](https://github.com/adjeiemmaaegh-web/tallybook/pull/32). The current candidate uses the real React routes, canonical policy history and sealed outbox. Branch selection and limitations are documented in [reconciliation](RC_RECONCILIATION.md) and [architecture](RC_INTEGRATION.md).

### Acceptance status at that baseline

All three GitHub workflows passed on application commit `4c3170310ce06f6fe32ae12af983d544172f24e7`. The [complete release run](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42427503560) passed frozen install, preflight, 948 native/server tests, 1,150 client tests, types, build, Chromium release, authentication, built-PWA offline and the dependency audit. [UI branch verification](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42427503566) and [integrated reference UI](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42427503557) passed. The previously timing-out owner-to-cashier handoff passed with the locked-shell assertion. The subsequent documentation and test-discovery changes do not modify the application.

Owner acceptance covers the integrated features described in this report. Hosted two-account configuration, real hardware and browser acceptance remain open. Dedicated shared-shop authoring screens listed below are outside this candidate's verified feature set.

## Results and reproduction

Use the commands in the [README](../../README.md) and the pinned release-validation workflow. Local verification used Linux, Node 24.22.1 and pnpm 10.34.0. GitHub release validation uses Node 24.19.0 and pnpm 10.34.0.

| Gate | Verified evidence |
|---|---|
| Baseline | 939 native passes locally on main. [Main CI](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42286703471) passed native, 1,143 client tests, types and build. Release/auth/offline browser and audit steps failed. |
| Financial and schema | `node --test qa/backend-stage-b-e.test.mjs` passed 9/9. Disposable PGlite with simulated auth roles exercised the complete chain, populated upgrades, competing schema rejection, tenant boundaries, stale counts, transfers, rollback and replay. |
| Candidate native/server and client | 948/948 native including the 9 database tests. 1,150/1,150 Vitest tests across 148 files. Hosted evidence at `bfe6472657fbc807d5be214e89cb515ea70e4aa9` in [release run 42425968421](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42425968421). |
| Typecheck, production bundle, frozen install | Passed locally and in the same hosted run. Both the service worker and the Node server bundle were generated. |
| Browser release and offline | At that SHA, 5/5 release and 3/3 production PWA cases passed. These include Ghana setup, saved quotations, schema upgrade and cash/tax checkout after offline reload. |
| Public reference UI and visual | Both [reference](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42425968388) and [visual](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/42425968404) workflows passed on that SHA. Includes signed-out configured cloud entry and widths from 320 to 1536 pixels. |
| Staff handoff | On that SHA 3/4 auth browser scenarios passed. The owner-to-cashier case timed out with the new cashier unselected in the locked form. `4c3170310ce06f6fe32ae12af983d544172f24e7` closes the previous shell immediately and asserts navigation has disappeared before the cashier enters credentials. |
| Dependency audit | Frozen tree after scoped Workbox glob upgrade: zero moderate/high/critical and one low finding. The moderate threshold is unchanged. |
| Local browser limitation | Playwright Chromium download returned an invalid ZIP. System Chromium 156 failed before page creation because the runner denied a socket. All successful browser results above are from GitHub-hosted Chromium. |

## Blocker register

| Status | Scope | Evidence or remaining action |
|---|---|---|
| Fixed and verified | Canonical financial schema and policy | No change to the ten baseline migrations. Alternative policy histories fail the upgrade gate. Stored sale-time terms survive the canonical upgrade. |
| Fixed and verified | Auth routing and local operation | Public routes do not initialize the ledger. Standalone enrollment/PIN unlock and cloud account entry have separate paths. |
| Fixed and verified | Cached permissions and account changes | Catalogue cache allowlist, enforced local-owner proof and session/tenant regression tests. Strong authorization for writes remains inside PostgreSQL. |
| Fixed and verified | Dependency and assistant visual regressions | The moderate audit threshold passes. Desktop/mobile visual tests exercise the actual assistant after moving offline-speech probing behind a user action. |
| Implemented but unverified | Hosted identity configuration | Source requires 12 characters during signup/recovery. Confirm hosted enforcement, OAuth redirect allowlists, email flows and session revocation with independent accounts on an owner-authorized test project. |
| Blocked | Real-device acceptance | Owner-controlled Windows, mobile, Safari/Edge, printer, physical authenticator and device backup/restore checks remain outstanding. |
| Historical baseline gap | Shared operations authoring | The baseline had transactional RPC coverage only. The November 9 section records subsequent shared-shop workflow changes. |
| Deferred | Previously applied alternative preview schema | Requires a site-specific history and data mapping. Candidate rejects an ambiguous database rather than silently changing policy evidence. |
| Deferred | Repository governance | GitHub reported main unprotected, with no required status checks. Recommended checks are listed in the architecture report. No governance setting changed. |
| Deferred | Full local-ledger encryption and multi-company account claims | The device ledger is plaintext IndexedDB. Multi-company cloud binding needs independently verified ownership and recovery. |

Tracked-source signature scan found zero matches for the checked GitHub token, AWS access key, Supabase secret key and private-key header patterns. This scan did not examine historical commits or hosted settings. Review the inherited release registers separately for historical unresolved commercial gates.
