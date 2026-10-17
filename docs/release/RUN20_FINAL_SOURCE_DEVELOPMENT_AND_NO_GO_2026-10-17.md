# Tallybook V19 — Run 20 Staging, Operations and Release Decision — Full Source-Development Increment

**Date:** 17 October 2026 (Asia/Dubai)  
**Branch:** `v19/run20-operations-release-development-20261017`  
**Parent developed source:** `v19/run19-device-uat-development-20261017` at `1b6dd6738c6d248ea7469f119a135a729d312295`.  
**Reviewed implementation HEAD prior to documentation:** `2c2168813e3b6f60901d17f5e71a5198edeaffe2`.  
**Roadmap:** **Run 20 / T — Staging, Operations and Release Decision**.  
**Source work:** **ONE CONSOLIDATED FINAL ROADMAP SOURCE INCREMENT DELIVERED, MANUALLY REVIEWED, UNCOMPILED, UNTESTED.**  
**Actual release acceptance:** **NO-GO / INCOMPLETE**.  
**External scope:** Zero staging or production deployment authorized/executed; no provider charges/refunds, no cloud financial sync, public commerce, external staging account, DNS, secrets, live business data, `main` merge or real hardware checks. The owner's source-first instruction expressly deferred executable QA and approvals. The development stage is not release signoff.

## Full Run 20 source implementation

### A. Release policy, evidence and financial safety

1. `client/src/features/release/run20ReleaseGates.mjs` + `.d.mts` declare 20 mandatory gates **OPS-01–OPS-20**, each with exact-source SHA, observed date, reviewer role, factual note, status and artifact filename requirements. Duplicate/missing cases, invalid roles, impossible chronology and forged row content are rejected. A self-reported PASS remains unverified and is not approval. The **decision always calculates NO-GO**; it cannot enable staging, deployment, live payments, public commerce, trusted cloud financial sync, automatic promotion or merging to `main`.
2. A separate explicit deny-by-default `assertRun20ExternalActionAllowed()` rejects staging deploy, production deploy, provider activation, public storefront publication, cloud ledger sync, promotion and merge actions. Existing Vercel Git deploy remains disabled. This is intentional to separate source development from later independent commercial/owner authorization. No fake completed go-live step is implemented.
3. The historical V19 release requirements—full 82 acceptance units and authoritative 47-issue register—are **not** silently reclassified to PASS. The Run 20 gates are an additional review index, not a replacement or shortcut for those original records.

### B. Owner-only local operations integration

4. `client/src/features/release/run20LocalDiagnostics.ts` integrates with the existing company identity, staff roles, IndexedDB main metadata, durable restore marker, verified encrypted-backup receipt and optional manual `auditLocalIntegrity()` report. It uses read-only DB access and rechecks company/unlocked owner identity across asynchronous reads. It records the actual available schema metadata separately from the code-supported schema number; missing metadata is NOT invented. Storage-quota and online flags are expressly *browser hints*, not proof of a healthy remote service.
5. `client/src/pages/Run20OperationsPage.tsx` implements an owner-only read-only operations workspace. It exposes recovery marker status, backup receipt recency, optional explicit financial integrity audit, supported/saved schema, source-bound gate worksheet, Run 19 device-manifest coverage and local report import/export. It does not modify sales, customer debt, supplier liability, financial taxes, staff, store inventory, backup history, external hosting or production configuration.
6. The new page is lazily registered as `/release-operations` in `client/src/App.tsx` and appears under **More tools → Release operations (owner only)** in `AppShell.tsx`. Company/session changes clear evidence drafts and close privileged access. Source review fixed stale owner-state callbacks and the file-selection DOM `FileList` invalidation bug before handover.

### C. Private portable evidence and cross-device trace

7. `client/src/features/release/run20WorksheetEnvelope.mjs` + `.d.mts` export and re-import a bounded local-only JSON worksheet with SHA-256 over normalized content; the importer recomputes **NO-GO** from canonical entries, rejects wrong format, mismatched digest and tampered decision fields. A matching digest is a file integrity check **only**, not authenticated authorship or signoff.
8. `scripts/run20-verify-release-worksheet.mjs` and `scripts/RUN20_WINDOWS_RELEASE_EVIDENCE_VERIFY.cmd` provide future read-only, exact-source-SHA cross-checking. They never run application tests, request credentials, contact cloud services, execute live payments, launch browsers, install packages or deploy.
9. The operations page can import one or more Run 19 local Windows/Android archive files, check their hashes with the existing Run 19 source and show remaining physical platform/case coverage gaps and reported failure counts. It does not verify screenshot authenticity, print output or actual real hardware, and cannot sign the Run 19 UAT.

### D. Safe staging, monitoring, rollback and future execution controls

10. `scripts/run20-inspect-source-config.mjs` is an authored read-only local source configuration inspector that checks Node/package script baselines, Vercel Git deployment flag, manual PWA update source, server security headers and the six external activation policies. It was corrected to resolve repository paths correctly on Windows. It is **not** executed during this run and does not touch external hosting or data.
11. `docs/release/RUN20_STAGING_OPERATIONS_ROLLBACK_2026-10-17.md` is the end-to-end owner-gated future operations playbook: roles/approvals, exact SHA and artifact custody, separate owner-approved private synthetic staging, safe secrets/TLS, monitoring definitions, P0/P1/P2 incidents, provider-timeout unknown states, exclusive restore marker recovery, verified encrypted backups, schema-aware application rollback **versus** data restoration, record-count/conservation evidence, service recovery/revert rehearsal and independent final approval. Nothing was provisioned or tested.
12. `docs/release/RUN20_FULL_TRACEABILITY_AND_BLOCKERS_2026-10-17.md` reconciles the 20 *developed* source domains against still-open release acceptance, enumerates the critical named FIN/DATA/CLOUD/STORE/COM/PAY/HW/OPS release blockers, retains the 82-unit and 47-issue historic inventories as unresolved, and refuses to manufacture test evidence or a GO percentage.
13. `qa/run20-release-gates.test.mjs` authors negative-path cases for all gates NOT RUN, missing/duplicated cases, all PASS manually claimed but still NO-GO, forged GO, tampered SHA, future/invalid observations and forbidden external actions. **These are unexecuted test source files only.** No automation, CI or compilation was run.

## Final manual source review and corrections

- Separated the **currently saved IndexedDB schema metadata** from the code's supported schema; missing historical metadata is displayed as unavailable instead of represented as current.
- Fixed an implicit-`any` source typing issue in the new operations page; exact-source, owner identity and session checks remain enforced for every sensitive local report action.
- Replaced the old stale React owner/session closure with a current ref and event-driven reauthorization; company switching clears in-memory release worksheets and device evidence.
- Copied selected device `FileList` entries before resetting the browser input, so a legitimate local import does not race with the input's file collection reset.
- Added a Windows drive-letter-safe file URL conversion in the source preflight script instead of treating an encoded URL pathname as a filesystem path.
- Denied staging and promotion even when all manually entered PASS claim rows exist; deployment requires separately approved future release controls and independent evidence.
- Ensured all planned source scripts explicitly document **NO deployment, NO payment, NO external operations, NO release approval**.
- Kept the application offline-first; no change to company refund policy, sale/credit/tax posting, supplier settlement, FIFO stock, return snapshots or store inventory journals was authorized by the Run 20 UI.

**Manual inspection is not a substitute for executing semantic TypeScript, native/client suites, real database migration, browser install, Windows hardware, Android, scanner, printer, independent security audits, staging incident drills or restore recovery. Those gates are all open.**

## Final acceptance gate register — everything requiring executable or real-world proof remains OPEN

| Area | Source delivered | Evidence not yet supplied |
| --- | --- | --- |
| Full exact-head native/client/types/build/CI/browser and security | QA commands and source policy | No checks run on Run 20 head |
| Full 82 acceptance units + 47 issue record closure | Source trace report | Not reconciled or accepted at final SHA |
| Finance/tax/supplier/credit/customer policy | Earlier functional source inherited | No complete exact-head financial conservation proof |
| Recovery/backup/restore | Local diagnostics and rollback playbook | No real crash, encrypted off-device custody or full restore rehearsal |
| True company/staff/store/cloud isolation | Earlier permission/store sources inherited | Real hardware, cross-tab and RLS/tenant proof absent |
| Public commerce/live payments | Explicitly inactive | No owner/provider/contract authorization |
| Physical Windows and Android UAT | Owner-tooling and 28-case matrix inherited | All device acceptance cases NOT RUN |
| Security, privacy, licensing and accessibility | Source controls and threat model | No independent signoff |
| Staging/monitoring/release rollback | Full future operating runbook | No isolated environment provisioned, monitoring run or rollback observed |
| Final owner GO/NO-GO | Explicit NO-GO policy | GO has not been authorized |

## Final Run 20 decision

- **Source-development roadmap:** Runs 1–20 have source development work recorded, including this final consolidated Run 20 increment. Historical Run 1 passed only on its original earlier SHA, not this final candidate.
- **Acceptance status:** Runs 2–20 not certified on this final source. Hardware/security/full-client/browser/recovery and blocker gates still open. Source-development completion is **not** 20/20 acceptance.
- **Commercial release:** **NO-GO / INCOMPLETE**.
- **Owner approval:** None for staging, cloud deployment, live provider payments, external customer commerce, remote financial sync, production or merging to `main`.
- **Next permitted phase:** Owner may separately authorize a *future controlled QA and actual device acceptance campaign*, then review exact-SHA source, failures and release decision. This handover is a delivered development artifact, not a request for permission to deploy.

No user action is required to understand this status: the final roadmap development increment is committed while the release remains blocked by evidence and authorization, not silently described as complete.
