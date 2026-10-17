# Tallybook V19 — Run 19 Real-Device/UAT Acceptance Matrix (Owner Execution Later)

**Authored:** 2026-10-17  
**Source branch:** `v19/run19-device-uat-development-20261017`  
**Status:** **ALL PHYSICAL EXECUTION DEFERRED / NO RESULTS SUPPLIED / NO-GO**  
**Owner device testing is NOT performed by this document or by the source-development agent.** Every status below starts **NOT RUN**. Nothing can be declared verified merely because a button or API exists.

## Operating boundaries

- Use only a **disposable browser profile and sample business/customer data** for destructive sales, refunds, restore, WebAuthn enrollment, receipt printing and power-loss drills. Do not clear or overwrite live records.
- Build the exact source SHA under the owner's later QA authorization; attach app installation hash, Node/tooling version where relevant, OS build, browser version, memory/RAM class, printer/scanner model category (no serial number), operator role label, date and relevant screenshots/log filenames.
- In the installed app, unlock a company owner, open **More tools → Device acceptance** or `/device-uat`, select the actual **Windows** or **Android** platform, enter exact installed source SHA, and use **Record observed outcome** only after performing the step on that device. A scanner field or an API visibility indicator alone cannot prove scanner correctness or device coverage.
- **PASS requires** a factual observed note (20–600 characters), timestamp, filename of an independently retained artifact, and later human inspection. FAIL/BLOCKED also require a factual note. **N/A is allowed only for a scenario that is truly on the other platform**, never as a waiver of an applicable critical check.
- Export a report on every tested physical device. The JSON includes all case rows and a SHA-256 integrity digest but **contains no screenshot bytes, PIN, private customer identifiers or actual credit/payment details**. Keep evidence files beside the export. The digest does not prove authorship, hardware validity or independent acceptance.
- Run later, under separate owner QA authorization, `scripts/RUN19_WINDOWS_EVIDENCE_VERIFY.cmd file.json <exact_SHA>` for integrity-only validation. For *combined* Windows/Android coverage, `node scripts/run19-device-coverage.mjs --sha <exact_SHA> --files windows.json android.json [...]`. Neither tool runs tests or signs off the release.
- Actual payments, real mobile-money provider callbacks, public customer submissions, cloud sync, production deployment, changes to real suppliers and live database restoration **remain prohibited** absent separate express authorization. No results below have been executed as part of this increment.

## All critical acceptance cases (initial status is NOT RUN)

| ID | Physical action and expected observation | Proof to retain | Status |
| --- | --- | --- | --- |
| R19-W01 | On 8 GB Windows 11 CPU-only host, install/open the normal user app without Python, Node, manual AI weights, admin developer terminal or GPU; demonstrate POS and offline save | OS/RAM screen; startup logs; screenshot | NOT RUN |
| R19-W02 | On actual 2 GB and 4 GB Windows profiles if available, open sales, customer, stock and reports while resource constrained; an unsupported large backup must refuse without data loss | Task Manager memory graph and refusal text | NOT RUN |
| R19-W03 | Measure cold/warm launch, home-to-POS, inventory and backup route focus/interaction response on real CPU baseline; write timing and session behavior | Local timestamps, Task Manager/Performance recording | NOT RUN |
| R19-W04 | Install PWA once online; disconnect fully, reload home/stock/sales/customers/backup and lazy routes; show data remains local | Browser offline screenshot + route sequence | NOT RUN |
| R19-W05 | Offer a newer source build during an active sample checkout or backup; app must not auto-reload; block update under competing retail lock/restore marker | Update banner and lock-denial screenshot | NOT RUN |
| R19-P01 | Disposable sale using exact tax/discount and product units, save receipt and replay same submission; one sale and correct stock/currency/tax | Redacted sample receipt and before/after ledgers | NOT RUN |
| R19-P02 | One refund-disabled company and one opt-in company; verify original policy snapshot, allowed reversal and rejected wrong-company/cash corrections | Saved policy and sample reversal audit | NOT RUN |
| R19-P03 | Sample credit sale, multiple repayments and prepaid wallet; verify exact original-sale allocation, no false negative/duplicate or money invention | Reconciliation records with synthetic customers | NOT RUN |
| R19-P04 | Supplier receipt, payable recognition, manual supplier settlement and FIFO inventory cost; refuse duplicate/orphan event | Synthetic purchase/cost/payable journals | NOT RUN |
| R19-P05 | Activate store-mode on disposable data; transfer request → dispatch → receive; reject wrong staff store or negative stock; check store-specific POS | Store ledger/reconciliation and staff role captures | NOT RUN |
| R19-P06 | Reserve customer order and sell only exact cart via POS; ensure mock “succeeded” state does not post genuine financial receipt | Local mock isolation screenshot and sale link | NOT RUN |
| R19-H01 | Scan one synthetic code and a rapid duplicate using a physical keyboard-wedge scanner into Run 19's disposable field; only field length appears, not stored scan | Scanner model category, keyboard test notes, video/screenshot without scan text | NOT RUN |
| R19-H02 | Press test printer button; select physical receipt printer; verify readable print and paper feed. **Printed diagnostic is NOT a financial receipt** | Photograph of fixed TEST PAGE only | NOT RUN |
| R19-H03 | On disposable account, enroll real authenticator, lock/unlock, revoke and retry on Windows/Android; never export PIN/private key | Redacted positive/negative auth screens; device class | NOT RUN |
| R19-H04 | Record actual availability and provider/device boundary for Mobile Money without live charge; no sandbox outcome may become cash | Screen showing mock-only/provider-disabled labels | NOT RUN |
| R19-O01 | Switch network off while entering/saving a sample sale, reconnect; retain local receipt, no false upload or settlement acknowledgment | Airplane-mode/adapter state and saved receipt count | NOT RUN |
| R19-O02 | On **disposable sample profile only**, interrupt cross-database restore/recovery safely, reopen; journal prevents unrelated write and source records reconcile | Recovery marker logs, before/after sample dataset hashes | NOT RUN |
| R19-O03 | Quota restriction, private profile or storage eviction drills in disposable browser; no silent truncation, unsupported profiles must warn/fail closed | Storage refusal and safe recovery guidance | NOT RUN |
| R19-O04 | Simultaneous tabs, staff lock mid-sale, company switch, stock transfer race; no wrong business write or invisible double commit | Ordered browser logs, synthetic ledger counts, role snapshots | NOT RUN |
| R19-B01 | Download encrypted backup; locate actual saved file, reselect, decrypt, verify fingerprint and original business identity | Encrypted archive SHA, verify receipt, screenshots (no keys) | NOT RUN |
| R19-B02 | On separate throwaway profile, restore versioned backup and tampered JSON; reject wrong tenant and preserve independent companies/assistant data | Schema/restore preflight logs and normalized counts | NOT RUN |
| R19-A01 | Navigate entire POS by keyboard/NVDA, open/close dialogs, 200% zoom, high contrast and reduced-motion setting | Accessibility audit screenshot, keyboard route/contrast observations | NOT RUN |
| R19-A02 | Android Chrome mobile PWA installation, offline POS/backup UI, company switch and phone touch targets on actual device | Android version, offline capture, viewport screenshot | NOT RUN |
| R19-A03 | Edge, Firefox, Safari where supported: install/load/read/restore policy; unsupported Web Locks must block destructive cross-DB operations safely | Browser-specific screen and compatibility observations | NOT RUN |
| R19-S01 | On disposable company, owner/cashier/supervisor authorization matrix, PIN/WebAuthn revoke, same-company session and cross-company denial | Negative auth examples with fake staff/companies | NOT RUN |
| R19-S02 | Observe Run 14 sync, Run 15 payments, Run 16 public commerce and Run 17 actions disabled; no network or financial posting by fake events | Disabled gate/safe operator UI snapshots | NOT RUN |
| R19-Q01 | Independent reviewer inspects **exact installed source SHA**, OS/browser/device claims, physical artefacts and each negative path; records review decision outside app | Signed external review report and exact SHA | NOT RUN |
| R19-Q02 | Human merchant/attendant performs scripted everyday work on real supported devices, notes failure/retry/accessibility issues and signs UAT outside app | Task timing/role labels, issue log and owner signature | NOT RUN |

## Cross-platform coverage logic and hard pass restrictions

Every **Windows**-only item must have an independently checked observation from a real Windows device, every **Android**-only item must have one from an Android device, and every **Both** item must have independent coverage on **both platforms**. Use separate SHA-matched manifests per physical device/profile; never label a Windows observation as Android. Any FAIL stays open even if another device reports PASS. Where an optional browser/device cannot be accessed, record BLOCKED, do not manufacture N/A for an applicable case.

The in-app diagnostic only detects browser API *presence*; it does not run the printer, WebAuthn, browser crash, POS, settlement, backup integrity, scanner or network QA. The printer diagnostic uses a test-only nonfinancial page and the scanner field discards scanned content. Do not attach personally identifying images, actual receipts, credentials or live transaction IDs.

## Example owner walkthrough order (not executed)

1. Install the exact Run 19 source on a **disposable** 8 GB Windows device using later approved setup; confirm true normal-user startup and offline cache.
2. Unlock a test owner on sample business A; navigate /device-uat; enter source SHA and Windows platform.
3. Perform the relevant physical Windows checks; take redacted screenshots/logs and enter observed notes and evidence *filenames*. Export Windows JSON (offline).
4. Repeat separately on Android; export a separate Android JSON with same SHA, exact mobile platform and separate device/browser label.
5. Run the offline verifier and cross-device coverage summary **later**, inspect actual referenced files, document failures and rerun corrected code only with newly recorded precise SHA.
6. Owner and independent reviewer sign a separate controlled acceptance sheet **after** evidence matches; no code-level flag automatically grants sign-off. Send approved result to Run 20 operations/release decision.

## Owner signoff / findings register — explicitly blank

- Exact SHA physically installed on all supported devices: **NOT VERIFIED**
- Actual Windows, Android, scanner, printer, WebAuthn, Mobile Money device execution: **NOT PERFORMED**
- Defect list, severity, regression closure, retained screenshots and hash evidence: **NOT COLLECTED**
- Independent security and financial reviews: **NOT SIGNED**
- Owner/merchant UAT signature: **NOT SIGNED**
- Release authorization: **NO-GO**
- No live payments, external cloud operation, staging or production deployment authorized.
