# Tallybook V19 / Stage 9 — Full 20-run roadmap reconciliation

**Date:** 2026-10-15
**Status:** Source roadmap alignment; no acceptance gate passed by this document.
**Primary V19 source:** [Full 20-run handover](https://github.com/adjeiemmaaegh-web/tallybook/blob/security/auth-company-boundary-20261013/docs/release/FULL_20_RUN_HANDOVER_2026-10-15.md)
**Handover blob SHA:** `69d85f15b3959a899f6b398acbb8678d073260b9`.
**Source branch inspected:** `security/auth-company-boundary-20261013` at `60c4c77ac1d8ca56fd6257e4c0f1913fee79bb2d`. The handover calls its authored implementation SHA `4488b050ed964fd3cc623200ec67c6fa2ab00a93`; the one subsequent branch commit changed **only the handover file**, not implementation code.
**Stage 9 source:** `Multistore.md`, based on `stage9/multistore-integration-20261014` at `cea840632e8b4f03ceabe7ae899d0d7c5bfe3da2`, with review-only enrollment in PR #12.
**Full-release decision:** **NO-GO / INCOMPLETE**.

## Which plan governs what?

Tallybook has **two distinct numbered work breakdowns**:

1. The **20 V19 runs** are the *overall acceptance and release workflow*. Their order and the explicit RUN PASS requirement govern whether the team may advance to the next **V19 run**. Run 1 is accepted at its historical pinned commit, and **Run 2 is OPEN, NOT PASSED**. The project must not report Run 3 as passed, started under this sequential gate, or release-ready while Run 2 is open.
2. **Stage 9 rounds 0–8** are an *implementation plan for multi-store identity, migration, stock, POS, sync, reporting and acceptance*. Stage 9 Round 0 was completed as a planning/baseline step; Stage 9 Round 1 contains partly written, mostly inactive code. Stage 9 Round 1 is **not V19 Run 1**. No Stage 9 code-only milestone satisfies or bypasses any V19 release acceptance gate.

**Priority reconciliation:** The 20-run handover is the stricter owner's release-process instruction: implement, execute actual full and targeted checks on the exact candidate SHA, fix, rerun, record a verified PASS, **then** advance. Previous discussions allowing owner-PC testing to be deferred still allow source drafts and tests to be prepared while blocked, but **do not authorize changing Run 2 to PASS, beginning V19 Run 3, or switching on cloud commerce**. If the owner wants a different sequence, document and obtain explicit authorization for a new acceptance process instead of silently relaxing this gate.

## Current accepted evidence and open Run 2

- **V19 Run 1:** historical green `fe9c5abad0e752454f9ecfe1dd795318334dac68`; handover records **791 client Vitest, 471 native and six Playwright** tests plus types/build/audit. This is evidence for that SHA alone.
- **V19 Run 2:** historic passing run `38559838667` at `e463816bd9525d3706352669edd051ac1e04c12f` does **not** accept the later head. Current PR #7's latest CI jobs failed *before execution* with zero steps; distinguish infrastructure/budget/runner failure from a source test failure or a passing check.
- Actual Supabase schema uses `businesses.owner_id`, `business_members(business_id,user_id,role)`, roles `owner | attendant`; no separate unapproved company-membership role table should be invented. The handover describes project `qfyydfxwvifdvffdfgeu` and applied identity/recovery migrations. **Do not reapply those migrations or modify any live Supabase records**; new Stage 9 store/device SQL proposals remain **unapplied**.
- **Release blocker inventory verified against security branch:** 47 issues (**3 implemented-and-tested, 35 implemented-unverified, 6 missing, 3 blocked**), and 82 acceptance units (**1 implemented-and-tested, 60 implemented-unverified, 18 missing, 3 blocked**). They are the recorded historical classification, **not fresh passes** for the Stage 9 branch. Preserve the 47/82 register while reconciling improvements.
- **Run 2 existing code is not a complete working product:** local preview/preparation checks, trusted ownership/recovery issuer, serializable adapter, Supabase session verification, reviewer-audit writes and a composition module exist. Missing active authoritative reviewer/evidence directory, independently verified restore proof and real restore drill, private Postgres connection/runtime endpoint, production-equivalent RLS/session test, safe local company binding UI, and full final-head acceptance.
- **Stage 9 PR #12** contributes server-only owner-approved device invitations, redemption, revocation, private adapter and `19/19` local mock-backed Node tests. **It is neither a Run 2 PASS nor a completed device-authorization endpoint**. Hardware possession proof, per-store membership authorization, app integration, review-only SQL migration and true database/Windows tests remain open.

## Mandatory V19 run sequence

The following preserves the subject, sequence and acceptance intent of the authored V19 handover rather than substituting Stage 9's round numbers:

| V19 run | Area | Work and mandatory evidence | Current status |
| --- | --- | --- | --- |
| **1 — A** | Baseline and CI | Historical pinned client/native/browser/types/build/audit | **Accepted only at historical SHA** |
| **2 — B** | Identity and offline company ownership | Verify real sessions, owner/reviewer and server-vouched restore evidence; backup/restore drill; explicit local-cloud bind; transfer, replay/rollback/cross-tenant tests; exact-head full CI | **OPEN — NOT PASSED / next acceptance gate** |
| **3 — C** | Cloud company membership | Canonical `businesses` and `business_members`, invite/revoke roles, strict server-side RLS, two-user/two-tenant negative tests | Not started as accepted V19 run |
| **4 — D** | AuthGate and session | Safe sign-in/out/switch, expired/revoked sessions, stale operations, offline local-only preserved | Not started |
| **5 — E** | Tenant authorization | Enforce tenant ownership/roles on reads/writes/reports/backups/imports/assistant/sync; table-level RLS | Not started |
| **6 — F** | Staff authorization | PIN/role/supervisor approvals, shift safeguards, stale authorization, exhaustive permission tests | Not started |
| **7 — G** | Cross-IndexedDB atomicity | Main/assistant crash journals, Web Locks, cross-tab and interrupted-write recovery | Not started |
| **8 — H** | Migration, backup, restore | Version compatibility, backup encryption review, size/malformed-data checks, rollback, Windows/browser recovery drills | Not started |
| **9 — I** | Inventory costing | Historical FIFO and corrections, negative-stock/returns/backdates, exact inventory/report reconciliation | Not started |
| **10 — J** | Customer receivables | Sale-linked credit, partial repayments, overpayment, currency and prepaid liability reconciliation | Not started |
| **11 — K** | Returns and refunds | **Company-opt-in** policy including no-refunds, immutable policy snapshots, authorized partial/full corrections, stock/cash/tax integrity | Not started |
| **12 — L** | Supplier payables and tax | Settlements, expenses, liabilities, off-until-configured taxes, currencies, configurable Ghana/GHS defaults | Not started |
| **13 — M** | Multi-store | Store-scoped stock, transfers, attendant roles, concurrent oversell prevention, authoritative reconciliation | Not started |
| **14 — N** | Optional secure sync | Explicit opt-in tenant and device access, encrypted/integrity-checked replication, idempotent offline conflict/replay | Not started |
| **15 — O** | Payment gateway sandbox | Only after owner chooses provider and grants separate sandbox approval; signature/idempotency and mock checks | Blocked on owner selection/approval |
| **16 — P** | Public commerce | Customer ordering, reservations, delivery, tenant-safe cancellation/returns | Not started |
| **17 — Q** | Assistant and analytics | Audited, explainable BI grounded in actual ledger and per-role authorizations | Not started |
| **18 — R** | Hardening | Low-spec Windows performance, accessibility, security and recovery attack reviews | Not started |
| **19 — S** | Real hardware/UAT | Real Windows/Android/browser, power-loss/offline and scanner/printer/WebAuthn/MoMo trials | Blocked on owner test devices and authorization |
| **20 — T** | Staging/operations/release decision | Approved isolated staging, monitoring/restore/rollback drills, full blocker and traceability closure, explicit GO/NO-GO | Blocked on explicit owner approval |

**Every V19 run:** complete code, positive/negative and saved-data regressions, **execute** full and targeted checks against the *exact final SHA*, fix/rerun, publish logs and database/browser evidence, update `docs/release/blockers.json`, `traceability.json` and release docs, then record PASS or NOT PASSED. A passing subset, skipped runner or mock-only proof never constitutes full acceptance.

## Crosswalk: where Stage 9 rounds belong in the 20-run roadmap

| Stage 9 round | Purpose | Main V19 dependency/run | Consequence |
| --- | --- | --- | --- |
| 0 | Baseline and planning | V19 Run 1 and current Run 2 handover reconciliation | Stage 9 round planning done; no V19 acceptance implied |
| 1 | Authenticated owner/company/store/device grant boundary | Runs **2–5**, with staff and device portions of **6** and **13** | Continue only as implementation under **open Run 2** until full gate passes; PR #12 stays draft/inactive |
| 2 | Historical company/store data mapping and opening balances | Runs **8–9**, prerequisite of **13** | Never attribute unsupported historical store origins or invent stock/costs |
| 3 | Store-authoritative inventory ledger | Runs **9, 13** | Enforce immutable movements, valuation, negative-stock and replay protections |
| 4 | Real stock transfers | Run **13**, with sync contract from **14** | Reserve/dispatch/receipt and reverse atomically without value loss |
| 5 | Store-specific POS and attendant financial postings | Runs **6, 10–13**, later payments **15** | Staff scope, company refund policy, exact money and stock invariant tests |
| 6 | Offline multi-device sync/recovery | Runs **7–8, 14**, security prereqs **2–5** | No last-write-wins financial conflicts, no revoked-device replication |
| 7 | Store/consolidated financial reporting | Runs **9–14, 17** | Independently reconcile reports to inventory, receivables, payables, cash and tax |
| 8 | End-to-end acceptance | Runs **18–20**, plus all earlier run gates | Owner PC, hardware, database/RLS, migration and UAT before deployment approval |

Cross-cutting: company-configured refund restrictions, Ghana/GHS and payment-method **defaults** rather than forced policy, minor-unit money, auditable history, offline-first local business operation, low-cost Windows hardware and explicit release safeguards.

## The actual next work queue — do not skip Run 2

1. **Protect versions and history:** inspect current `main`, the exact PR #7 security branch SHA and current Stage 9 PR #12; avoid blindly cherry-picking the old PRs or overwriting premium Home/Clementia work. Keep incompatible development streams separate until reconciled.
2. **Restore test execution:** resolve GitHub Actions pre-job runner/budget restrictions or run in trusted, reproducible owner PC/independent runner. Record Node 24.19.0, pnpm 10.34.0, locked dependencies, exact SHA and complete logs. Run client Vitest, native Node, `pnpm check`, build, Chromium migration/offline browser, dependency audit.
3. **Complete real Run 2 authorization/recovery:** trusted independent reviewer/evidence directory, verified backup/restore drill, owner acknowledgment, expiry/revocation/replay/unique binding, private server coordinator and default-off TLS/CSRF/rate-limited endpoint if chosen. Avoid introducing service-role keys in browser.
4. **Test isolated real identity/database behavior** in an approved disposable test setup: two users/two companies, canonical owner/attendant memberships, RLS and REST denial, concurrent owner transfer/binding, stale/revoked sessions, evidence mutation, rollback after partial failure, race/crash/retry and audit consistency. Do not use the production Supabase project.
5. **Protect local-only offline business:** real IndexedDB/backup/restore validation, no forced cloud sign-in or silent migration, no cross-account cached-data exposure if cloud-account mode is enabled, documented recovery and no false claim that sign-out encrypts local files.
6. **Close Run 2 only with evidence at its final SHA.** Then advance to V19 Run 3. The later Stage 9 rounds must be coordinated with their V19 runs in this crosswalk rather than declared independently release-ready.

## Source control and open questions

- The linked handover remains the *authoritative historical V19 handover*, but is not proof of acceptance at the newer branch SHA or Stage 9 review SHA. Its pinned `4488b050` and the observed `60c4c77` drift by a documentation-only commit. Always fetch and compare heads before work.
- Validate the actual Supabase schema and migration history **read-only** before attempting any change; handover's six zero-row business tables and one auth user are a snapshot dated 2026-10-15, not an assertion of perpetual emptiness.
- Some Stage 9 code and the owner's testing-deferred workflow were prepared while Run 2 was open. Preserve and review those implementations, but mark them **draft/unaccepted** until the 20-run acceptance contract is satisfied.
- No live payments, deployment, financial replication, staging, cloud schema change, branch merge or destructive operation is authorized by this roadmap reconciliation.

**Decision:** V19 **Run 2 OPEN / NOT PASSED**. Stage 9 **Round 1 PARTIAL**. Overall V19 and Stage 9 commercial release **NO-GO / INCOMPLETE**.


## Owner amendment — complete-run development, deferred acceptance (15 October 2026)

The owner has explicitly changed the **development cadence**: implement an entire V19 run in one increment and, when test infrastructure is unavailable, record each unexecuted test for later rather than stopping source development. The earlier instruction in this historic crosswalk that forbade even *starting* Run 3 source development while Run 2 acceptance was open is superseded **for implementation scheduling only**. Acceptance and release tracking remain evidence-based and sequential: no Run 2 or Run 3 PASS may be claimed while their actual gates remain open, and no untested feature may be activated in production.

Under this revised cadence, draft Run 3 source was developed on `v19/run3-cloud-membership-20261015`, based on draft Run 2 head `939e06de8eb313b64211beeb1c94e26859b4af5b`. Run 3 implements canonical owner/attendant invitations, one-use redemption, revoke/list operations, private PostgreSQL adapter, opt-in routes/UI, guarded isolated RLS review SQL, and authored negative tests. The exact evidence and deferred QA are in `docs/release/RUN3_CLOUD_MEMBERSHIP_FULL_INCREMENT_2026-10-15.md`. **Run 2 NOT PASSED; Run 3 NOT PASSED; Stage 9 partial; commercial NO-GO.**


## 16 October 2026 — Run 4 whole-run source implementation (development scheduling)

Following the owner's superseding directive, V19 **Run 4** was implemented as a full development increment on `v19/run4-session-lifecycle-20261016` based on draft Run 3 head `e68619ff14937d4ce19951002f5a4c5e12f5f897`. The historical requirement to accept Run 2 before commencing *source development* of Run 3/4 is superseded **only for coding cadence**. Acceptance, tenant isolation and commercial release remain evidence-based; no unexecuted checks are PASS.

Run 4 implements cloud-only, verified Supabase AuthGate; sign-in/out/account switching; fail-closed timer/refresh, revoked-session and pending-operation handling; protected read-only private auth.sessions probe with default-off runtime; and guarantees offline ledger routes remain usable without cloud auth. Related Run 2/3 cloud request clients reject responses after account/token changes. Authored **22** controller plus **7** server native-style cases, with **29/29** passed in isolated V8 harness, and 10 authored, unexecuted React/Vitest cases. See `docs/release/RUN4_AUTH_SESSION_FULL_INCREMENT_2026-10-16.md` for exact limitations.

**Run 2 NOT PASSED; Run 3 NOT PASSED; Run 4 NOT PASSED. Stage 9 partial; commercial NO-GO.** Cloud server runtime, live DB, staging, payments and deployments remain unauthorized. Next development run under owner's cadence: V19 Run 5, tenant-scoped authorization.


## 16 October 2026 — Run 5 tenant authorization and safe GitHub commit continuation

The owner requested diagnosis after one combined Run 5 GitHub source/test write was blocked by a non-specific safety check. The exact rejection rule is not available. The destination branch was accessible and neither file had been created. Follow-up **separate, reviewable GitHub write calls succeeded** and committed the Run 5 tenant-action policy, serializable trusted authorizer, default-off cloud resource route/runtime, 27 regression tests and a read-only RLS catalog review. See `docs/release/RUN5_TENANT_AUTH_AND_WRITE_BLOCK_DIAGNOSIS_2026-10-16.md` for exact findings and untested items.

**27/27 source-level tests passed in isolated V8 mocks**; not native Node, real Supabase/PostgreSQL, full CI, browser or production evidence. This is a development-only authorization boundary and does **not yet gate all legacy financial/backup/assistant/sync paths**. Table-level RLS on all future data models remains to be designed/verified against the actual schema. V19 Runs 2–5 all **NOT PASSED**, commercial release **NO-GO**. No cloud sync or payment activation, schema migration, deployment or merge to `main` occurred.


## 16 October 2026 — V19 Run 6 device-local staff authorization implementation

Per the owner's superseding whole-run coding cadence, a dedicated draft Run 6 source increment followed Run 5 draft PR #17 at `d06bdfe9b390f9f67a466278b4280cd5398a4e35`. Local staff (`owner|supervisor|cashier`) PIN/role/permission state is now tied to an in-memory verified session credential, so revoked credentials/overrides require fresh unlock. Supervisor discount approval is transaction-audited, bound to the exact cashier, shift, checkout and credential state, and revalidated **inside discounted sale posting**. Critical sales, receivables, inventory, customer, supplier, expense and reports **read** paths gained post-await and transaction-scope local staff guards; the staff UI no longer loads other staff shift records or audit history before verifying an authorized actor. Existing financial posting and shift cash reconciliation preserve their invariants.

Tests authored: **12 pure staff authority**, **7 static entrypoint audit** and **18 browser IndexedDB/Vitest cases**. The 19 pure/static tests passed in an isolated V8 runner, **not native Node or real IndexedDB**. Vitest, real browser/Windows, semantic TS/build and exact final-head GitHub CI remain deferred. Significant remaining risks include locally editable IndexedDB, memory-only PIN throttling, no durable owner/staff-governance marker preventing accidental full-directory deletion from reviving legacy no-staff behavior, and incomplete whole-repository exhaustive permission QA. See `docs/release/RUN6_STAFF_AUTH_FULL_INCREMENT_2026-10-16.md`.

**Run 6 source development delivered; acceptance NOT PASSED.** Runs 2–5 remain NOT PASSED; Stage 9 incomplete; commercial V19 NO-GO. No automatic live payments, cloud sync, schema application, deployment or `main` merge.


## 16 October 2026 — V19 Run 7 whole-run crash recovery and cross-IndexedDB source increment

Following the owner-authorized full-run coding cadence, Run 7 source was implemented from Run 6 draft PR #18 at `23b06f9f6fb5b94cc4441f3ce83f7ca3037d7bab` on branch `v19/run7-cross-db-recovery-20261016`. Existing durable assistant preimage/postimage journal and startup recovery remain authoritative. Run 7 adds a pure fail-closed crash-stage state classifier used by recovery, exclusive cross-tab locking for **retail-plus-assistant backup export**, post-read company and pending-journal rechecks, exact company-scoped backup receipt bookkeeping, and **transaction-bound pending-recovery gates** across key retail financial, refund, liability, inventory and catalogue write paths.

New focused native-style tests: **12 recovery classifier, 11 cross-tab lock simulation, 7 durable marker barrier and 8 static write-path cases = 38/38 passed in isolated V8** against Run 7 source blobs. Authored but unexecuted browser/IndexedDB tests: **5 backup consistency, 6 posting barrier, 5 crash-stage reopen = 16**. Genuine Node `node --test`, full `pnpm check`/Vitest/build, real browser/Windows, multi-tab power-loss and exact-head GitHub Actions are **NOT EXECUTED / DEFERRED**. Important outstanding issues: incomplete exhaustive Web Lock participation across raw/legacy writes, non-Web-Locks browser backup now failing closed, no physical backup retention proof, and incomplete real cross-DB crash acceptance. Full handover: `docs/release/RUN7_CROSS_DB_ATOMICITY_FULL_INCREMENT_2026-10-16.md`.

**Run 7 source delivered for review; acceptance NOT PASSED. Runs 2–6 remain NOT PASSED; commercial release NO-GO.** Historical 47 issue statuses and 82 acceptance units unchanged; no live SQL, financial sync, payments, `main` merge, staging or deployment.


## 16 October 2026 — V19 Run 8 encrypted backup, historical migration and restore assurance

Owner-authorized whole-run **source-development** continuation follows Run 7 draft PR #19 at exact `ccb03e864d24917f6f1edcaeb322b8ebb9bd3e0e`. Run 8 preserves existing IndexedDB v28 and durable two-DB restore journal, but adds explicit 39-table historical schema compatibility; pre-import rejection of duplicate/unsafe/deep/unknown JSON, unknown future financial tables and missing current tables; strict authenticated AES-256-GCM encrypted-v2 outbound format with original encrypted-v1 read compatibility; mandatory encryption for every new export; and a reselected-file SHA-256/decrypt/validation proof before a local backup status is marked verified. Historical `lastBackupAt` timestamps without verified-file receipt are no longer trusted for backup readiness. Restoring/deleting a company invalidates its earlier verified receipt; no schema version bump. Legacy unencrypted JSON remains readable only with explicit warning.

`62/62` new focused native-style cases passed **only in an isolated V8 compatibility runner**, not native Node or real WebCrypto/IndexedDB. `20` new IndexedDB/Vitest cases authored, **not executed**. A pinned-Node Windows read-only QA command and multi-browser/restore/power-loss test matrix have been committed but **not run**. Open blockers include PBKDF2 and low-spec CPU review, real encrypted file retention, independent restore, current-ledger freshness before destructive company clear, exhaustive cross-tab coverage, real Windows/browser crash tests, semantic TS, build, full CI and full suite. Detailed handover: `docs/release/RUN8_MIGRATION_ENCRYPTED_BACKUP_FULL_INCREMENT_2026-10-16.md`; drill: `docs/release/RUN8_WINDOWS_BROWSER_RECOVERY_DRILL_2026-10-16.md`.

**Run 8 source increment delivered for draft review; acceptance NOT PASSED. Runs 2–7 remain NOT PASSED. V19 release NO-GO.** No production data, live Supabase, payments, cloud sync, staging, deployment or `main` merge were authorized.


## 16 October 2026 — V19 Run 9 whole-run inventory costing and financial reconciliation development

The owner-authorized *source* increment follows Run 8 draft PR #20 at exact baseline `f1884ff3925f75755a0b97824c557b096ed2e102`. Dedicated branch `v19/run9-inventory-financial-reconciliation-20261016` preserves the existing v28 local IndexedDB FIFO and its legacy cost-unknown treatment; Run 9 adds **complete inverse full-sale/partial-return FIFO cost checking**, **supplier invoice-to-immutable-cost/stock receipt and currency checking**, **as-of known vs unknown inventory valuation**, and scoped financial report/CSV/backup validation. Missing modern cost restorations, tampered supplier price/quantity, duplicate/orphan receipt references, mixed acquisition currencies and unsafe integer sums fail closed; genuinely old purchases without cost history are counted as unverified rather than filled from editable current prices. Grouped product and sale indexes reduce repeated large-history scans. No new live schema, product mutation, cloud sync or payment posting.

Evidence: **53/53 native-style focused cases passed only in isolated V8** against fetched branch sources (15 full/partial returns; 11 inventory valuation; 15 supplier invoice/receipt reconciliation; 12 static report/backup/UI contracts). **12 new real IndexedDB/Vitest cases authored, NOT EXECUTED**; pinned-Node Windows read-only QA command and detailed two-business synthetic review matrix committed, **NOT EXECUTED**. Full Node/pnpm/TypeScript/Vitest/build/Playwright, 8 GB Windows performance, crash/rollback and exact-head CI remain deferred and required. Detailed report: `docs/release/RUN9_INVENTORY_COSTING_FULL_INCREMENT_2026-10-16.md`; test matrix: `docs/release/RUN9_INVENTORY_FINANCIAL_QA_MATRIX_2026-10-16.md`. The 47-blocker/82-acceptance status is unchanged.

**Run 9 source delivered for review; acceptance NOT PASSED. Runs 2–8 remain NOT PASSED; V19 commercial NO-GO.** Next V19 *development* run under owner cadence: **Run 10 — customer receivable, repayments, currency and prepaid-liability reconciliation**, with earlier acceptance gates still open. No live Supabase SQL, payments, commercial deployment, staging or merge into `main`.


## 16 October 2026 — V19 Run 10 full-run customer receivables and prepaid-money source increment

The owner-authorized **development** increment proceeds from Run 9 draft PR #21 at exact `e80592b71ffec349f35b6092966093df8397ee57`, on branch `v19/run10-customer-receivables-20261016`. The program contains **20 V19 runs; Run 10 is the tenth source-development increment, leaving Runs 11–20 (10 development runs)** after this increment. This percentage of authored development is **not** a commercial acceptance percentage. The nine Stage 9 rounds are a distinct workstream, not a substitute.

Run 10 adds independent full-history *per-customer* credit checks so one customer's overpayment cannot be hidden by another customer's debt, exact partial sale-linked repayment versus legacy unknown allocation counts, unique saved repayment identities, foreign/orphan/duplicate reversal and currency/time boundaries, prepaid deposited cash vs external refund vs wallet spent/reversal vs liability conservation, and shared Web Lock participation for the customer repayment posting. The authoritative repayment transaction checks the proposed payment again before writing; customer history/target reads reject switched-company results. Dashboard, management, CSV and backup preflight now apply the relevant audits to full scoped customer snapshots. No bank/provider settlement confirmation, FX, invented historic allocation, new schema or automatic refund is created.

**42/42** focused source/contract cases PASSED using **isolated V8 shims only** (16 credit, 12 prepaid, 14 source-level integration), **not native Node or actual browser/IndexedDB**. **12 saved-data Vitest/IndexedDB tests authored, NOT EXECUTED**; pinned Windows 24.19.0 read-only QA runner and two-business fault/recovery matrix committed **NOT EXECUTED**. Full pnpm/native/client/TypeScript/Vite/Playwright, Windows performance, real cross-tab, power loss, independent portable restore and exact-head CI are all required before actual acceptance. Handover: `docs/release/RUN10_RECEIVABLE_PREPAID_FULL_INCREMENT_2026-10-16.md`; Windows QA matrix: `docs/release/RUN10_CREDIT_PREPAID_WINDOWS_QA_MATRIX_2026-10-16.md`.

**Run 10 source DEVELOPMENT delivered for review; ACCEPTANCE NOT PASSED. Runs 2–9 remain NOT PASSED; commercial V19 NO-GO.** Historical 47 blockers/82 acceptance units unchanged. Next development source run: **Run 11 — per-company configurable returns/refunds** including no-refund companies; still no authorization to deploy, apply SQL, activate payments, stage, merge `main` or change real customer records.
