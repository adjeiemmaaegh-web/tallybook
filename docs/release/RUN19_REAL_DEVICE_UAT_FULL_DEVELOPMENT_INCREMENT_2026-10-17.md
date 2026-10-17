# Tallybook V19 — Run 19 Real Devices / UAT — Full Source-Development Increment

**Date:** 2026-10-17 (Asia/Dubai)  
**Development branch:** `v19/run19-device-uat-development-20261017`  
**Reviewed Run 19 source HEAD before this documentation commit:** `1d47bda20ace3d1b102882fde8e6aa95a73e9a35`  
**Parent Run 18 source:** `v19/run18-hardening-development-20261017` at `017d473f6a44ca576c73d2d9ad3804300f85ba98`  
**Roadmap scope:** **Run 19 / S — Real Devices and User Acceptance**, including Windows 11 low-spec use, Android/browser workflows, physical barcode scanners and printers, WebAuthn, Mobile Money boundary, offline power loss, secure recovery, cross-tab authorization and owner UAT.

**Development status:** **ONE COMPLETE RUN 19 SOURCE TOOLING INCREMENT DELIVERED / MANUALLY REVIEWED.**  
**Physical UAT status:** **NOT EXECUTED / NOT ACCEPTED**.  
**Overall V19 release:** **NO-GO**. No tests, builds, CI, real Windows/Android devices, scanners, printers, WebAuthn authenticators, real payments, power-cut drills, production deployments, external systems or actual owner signoff were executed/used in this increment. No merge into `main` occurred. This is an honest source-only handover, not a fake statement that a hardware stage passed.

## Source development delivered

### 1. A complete, immutable real-device acceptance contract

`client/src/features/qa/run19Acceptance.mjs` + `.d.mts` define 28 critical scenario IDs across 8 areas: Windows (5), POS (6), hardware (4), offline (4), backup (2), accessibility (3), security (2), and acceptance (2). All begin `not-run`. A manually claimed PASS requires a 20+ character factual observation, a valid UTC timestamp and a separately retained evidence filename. Unknown/missing/duplicate scenario IDs, unsupported statuses, invisible extra fields, forged summary counts, fake release-status fields and inconsistent exact-source-SHA evidence are rejected.

Every device campaign is explicitly **Windows** or **Android**, not both. Off-platform checks may be reported N/A only on that incompatible device and require an explanatory note; applicable critical cases cannot be waived. Cross-platform scenario IDs need independently recorded evidence on the required platform(s). `run19CrossDeviceCoverage` refuses mixing different source commits, reveals missing platform coverage and maintains every reported FAIL as unresolved, regardless of PASS on another machine. **It always returns `releaseDecision:"NO-GO"` and `independentReviewerSigned:false`**. It never pretends programmatic evidence accounting proves real hardware was used.

### 2. Owner-only on-device UAT interface, integrated but release-neutral

`client/src/pages/Run19DeviceAcceptancePage.tsx` is mounted as a lazy `/device-uat` route under `client/src/App.tsx` and the More tools navigation in `client/src/components/AppShell.tsx`.

- Reads only the selected company, app recovery marker and currently unlocked owner identity under a read-only Dexie transaction.
- Requires a real unlocked owner; rejects cashier/supervisor and wrong-company access; rechecks identity on staff unlock/lock, browser visibility/focus and before evidence import/export/recording.
- Clears in-memory drafts on company switch or session revocation; does not write UAT notes to live IndexedDB, finance/credit, staff audit, browser localStorage or any network.
- Captures exact installed Git SHA, device platform, class/RAM, OS/browser, pseudonymous operator role, disposable-data confirmation, no-real-payment and no-deployment acknowledgement.
- Filters all 28 scenario cards and records factual manual PASS/FAIL/BLOCKED/N/A outcomes only after the user submits observations; never auto-pass based on source claims.
- Permits explicit local evidence export and verified re-import without granting acceptance, independent review, signing or production deployment.

### 3. Safe physical diagnostics (manual actions only)

`client/src/features/qa/run19DeviceProbes.mjs` + `.d.mts` expose in-browser feature **visibility**, clearly separate from functionality/compatibility/performance testing: IndexedDB, Web Crypto, SW presence/control, Web Locks, WebAuthn API, storage estimate, print and standalone display. A keyboard-wedge scanner input sandbox accepts a **synthetic** barcode, reports only character count and clears the scanned value, without touching products or persisting the barcode. An isolated test-only printer page prints **TEST PAGE — NOT A SALE, RECEIPT OR PAYMENT**, without company, supplier, customer, bank or tax data. Operator inspection of a physical scan or page is still required to mark the associated checklist result PASS.

These diagnostics never enroll authenticator credentials, request mic/camera access, invoke provider charges, send encrypted relay records, modify POS entries or claim printer/scan success automatically.

### 4. Portable device evidence integrity and independent offline review tooling

- `client/src/features/qa/run19EvidenceEnvelope.mjs` + `.d.mts`: canonical, bounded JSON archive with SHA-256 integrity digest; strict importer rejects unknown roots, tampered counts, schema mismatch, altered digest and unsupported file shape. Digest is **not** a cryptographic signature or hardware proof.
- `scripts/run19-verify-evidence.mjs`: offline Node 24 verifier, requiring a locally saved JSON file and exact expected source SHA; reads no business data and checks report shape/hash only.
- `scripts/RUN19_WINDOWS_EVIDENCE_VERIFY.cmd`: a Windows read-only front end for the archive integrity checker, pinned to Node 24.19.0. It does **not** execute tests or accept a release.
- `scripts/run19-device-coverage.mjs`: offline multi-device summary, rejecting mismatched SHA and evidence hashes, surfacing uncovered Windows/Android scenario groups and all reported FAILs. No independent review status is claimed.

Operator-generated actual PNGs/logs/print samples remain outside the JSON and must be retained and examined independently; report filenames do not prove these files exist. No claim of tamperproof or authenticated custody is made.

### 5. Authored, intentionally UNEXECUTED negative-path acceptance contract tests

`qa/run19-evidence-contract.test.mjs` contains source-ready native Node negative cases for missing/repeated entries, unsubstantiated PASS, forged waived Windows tests, Android PASS on Windows, changed source SHA, tampered archive, unknown extra fields and cross-device coverage. **Tests were written but not run.** They prove nothing until later executed on exact reviewed SHA.

### 6. Complete owner-operated physical acceptance matrix

`docs/release/RUN19_DEVICE_UAT_MATRIX_2026-10-17.md` documents all 28 scenarios, requested observable pass criteria, sample-only environment, evidence filename types, exact SHA matching, separate Windows/Android campaigns, physical scanner and printer operation, actual WebAuthn and mobile device UAT, power interruption, corrupted backup, multi-tab contention, versioned finance integrity, independent review and signoff. Every physical status starts **NOT RUN**. No real secret, customer personal data or merchant bank credential should be attached.

## Manual source-review findings and corrections committed in this increment

1. **Incorrect single-device scope:** initial 28-case model expected one operator to pass both Windows and Android on one device. Corrected to per-platform evidence with separate cross-device coverage and explicit N/A rules for incompatible platforms only.
2. **Misleading hardware detector acceptance:** feature-detection and print-dialog availability are explicitly tagged *not a test*; PASS requires a separate recorded physical observation and retained filename.
3. **False-pass and tampering protection:** export/import contract rejects PASS without evidence, wrong SHA, altered summary, missing case IDs, repeated keys and silent future-version fields. Always NO-GO until independent owner decision.
4. **Owner/staff revocation:** page now reauthorizes after staff-session or window focus/visibility changes, disarms in-memory draft evidence on lock/company switch, and rechecks owner before local report import/export and manual recording.
5. **Off-platform UI mismatch:** corrected the default recorded outcome to match visibly selected N/A on an incompatible device, rather than recording blocked erroneously.
6. **Privacy/data safety:** no scanned barcode or financial receipt is retained; no payment, cloud, production, external provider or business-record mutation path was introduced.
7. **SHA256 limits:** report digest checks accidental alteration only; screenshots, device claims and human signoff remain unverified. Neither cross-device coverage nor count completion can switch the release gate.

This list reflects **manual source inspection only**, not semantic TypeScript, JS syntax, browser, production-build or automated regression proof. Additional implementation mistakes may remain and must be found when executable QA is later authorized.

## Acceptance gate register (zero executable evidence)

| Gate | Required separately observed evidence | Status |
| --- | --- | --- |
| R19-G01 | Exact final source SHA, pinned Node 24, pnpm TypeScript/full native/Vitest production build and browser automation | NOT RUN |
| R19-G02 | Actual Windows 11 8 GB CPU baseline launch, low-spec 2/4 GB, cold/warm startup and memory | NOT RUN |
| R19-G03 | Actual Android Chrome PWA install, offline use, touch, device switching and local backup | NOT RUN |
| R19-G04 | Physical scanner and printer correct behavior and retained proof | NOT RUN |
| R19-G05 | Real WebAuthn enrollment, lock/unlock, revoked credentials and PIN roles | NOT RUN |
| R19-G06 | Real local sale/purchase, cost/credit/tax/store/return idempotent financial reconciliation using disposable data | NOT RUN |
| R19-G07 | Actual offline crash, power loss, quota, backup restore recovery and simultaneous tabs | NOT RUN |
| R19-G08 | Browser matrix Firefox/Safari/Edge, screen-reader/keyboard/zoom and accessibility usability | NOT RUN |
| R19-G09 | Mobile Money boundary verified without authorizing real-money movement | NOT RUN |
| R19-G10 | Device evidence JSON verified against retained physical artifacts with exact source SHA | NOT COLLECTED |
| R19-G11 | Independent security/finance/device reviewer and owner UAT signatures | NOT SIGNED |
| R19-G12 | Release decision and staging/operations authorization (Run 20) | NO-GO / NOT AUTHORIZED |

Historical 82 acceptance units and 47 blocker status counts remain unchanged: authored source, procedures and unexecuted tests are not test evidence. Run 18 source hardening is inherited but not declared accepted; Run 13–17 financial/network/public/provider release gates remain closed.

## Next phase and explicit approval boundary

**Run 19 source-development tooling, operator interface and full 28-case plan are delivered in this single consolidated increment.** Actual real hardware/UAT execution is **not complete**, and must not be described as PASS until physical owners independently perform, observe and record it. Development-only continuation can proceed to **Run 20 — Staging, Operations and Release Decision Source Work**, but this does not authorize real staging, live payments, cloud deployments, external public commerce, data export, commercial release or a `main` merge. Run 20 must preserve NO-GO until full acceptance and separate express owner sign-off.
