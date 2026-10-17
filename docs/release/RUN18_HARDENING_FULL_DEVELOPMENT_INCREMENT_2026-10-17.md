# Tallybook V19 — Run 18 / R Hardening — One Consolidated Source-Development Increment

**Date:** 2026-10-17 (Asia/Dubai)  
**Branch:** `v19/run18-hardening-development-20261017`  
**Based on completed-source but unaccepted Run 17:** `v19/run17-assistant-analytics-development-20261017` at `c6280f75eb4bc243c761c22990b08b7af403de9e`.  
**Reviewed implementation source HEAD before this final documentation update:** `ca32a1aad1f2aca8f53a23e2e7a026d40acbe746`.  
**Scope verified:** the governing 20-run plan's **R — Hardening**, covering Windows low-resource performance, accessibility, security review, malicious backups and recovery, network failure and formal threat-model controls.  
**Status:** **RUN 18 SOURCE-DEVELOPMENT INCREMENT DELIVERED / MANUALLY INSPECTED; QA, THREAT-MODEL SIGNOFF AND PRODUCTION ACCEPTANCE NOT PERFORMED.**  
**Release:** **NO-GO**. No tests, builds, CI, semantic TS checks, local browser/Windows or Android checks, staging, production deployment, payments or external cloud activity were initiated by this engineering increment, in accordance with the owner's development-only instruction. No merge into `main` occurred.

## Development delivered in this one increment

### A. Low-spec Windows performance and offline-first startup

1. **Route lazy loading:** `client/src/App.tsx` now splits all standard business workspace routes with `React.lazy` and one accessible `Suspense` fallback; the sign-in and error entrypoints remain normally available. No business table writes or data migrations are introduced. Route bundles remain included in the existing Vite PWA workbox `globPatterns` JS/CSS/HTML precache, subject to actual installed-PWA evidence.
2. **Zero hidden Google Fonts dependency:** Removed Google Fonts and `fonts.gstatic` from `client/index.html` and the CSS import in `client/src/index.css`; removed the Google Fonts service worker runtime cache in `vite.config.ts`. CSS retains local/system font fallbacks, so first paint no longer depends on a third-party font request. No proprietary font files are distributed.
3. **Lower recurring staff-check overhead:** `client/src/components/AppShell.tsx` replaces every 15-second deserialization of all company staff entries and credential metadata with a count plus targeted current staff record read; limits background refresh to visible tabs and refreshes on staff session, focus and visibility changes. This is source-level complexity reduction, not an actual CPU or heap benchmark.
4. **Linear-time line aggregation:** `client/src/features/insights/run17Evidence.mjs` eliminates per-sale-line copying of previously accumulated product IDs and repeated linear product lookups. The analytics route remains read-only and permission-scoped; it does not forecast missing sale history.

### B. Service-worker lifecycle and accessibility

5. **No forced app update during POS:** `vite.config.ts` changes `registerType:"autoUpdate"` to `"prompt"`. `client/src/features/reliability/run18UpdatePolicy.ts`, `client/src/components/Run18UpdateNotice.tsx` and `client/src/main.tsx` announce installed updates and apply them only when the user explicitly chooses reload after saving their work. The reload callback dynamically acquires the existing exclusive two-database Web Lock and rejects an outstanding restore marker before activating the update; any active cooperating retail write makes the attempt fail closed. The app cannot promise protection against OS power loss or browser crash.
6. **Keyboard and assistive support:** `AppShell.tsx` binds mobile navigation to its controlled drawer, retains the focus trap and Escape handling, and focuses primary content after route transitions. Global CSS adds visible focus, reduced-motion, forced-colors and higher-contrast handling. `client/src/components/ErrorBoundary.tsx` shows accessible recovery guidance that discourages deleting browser storage during a problem.
7. **Masked backup passphrase dialog:** `client/src/features/backup/useRun18PassphrasePrompt.tsx` replaces plaintext `window.prompt` backup passwords with transient `type="password"` input, keyboard focus confinement, Escape cancellation, masked entry and no application persistence. Browser-managed credential behavior and malicious extensions remain outside the app's control.

### C. Malicious backup, recovery and resource protection

8. **Pre-read import admission:** `client/src/features/backup/run18ImportAdmission.mjs` with declaration rejects invalid/oversize files before `file.text()` and applies a conservative browser-memory hint budget: 12 MiB at <=1 GiB, 24 MiB at <=2 GiB, 48 MiB at <=4 GiB, otherwise the existing 96 MiB encrypted-import bound. The 8 GiB Windows baseline keeps the existing import ceiling. Oversized/unsupported devices fail explicitly; **never truncate** customer, tax, sale, stock or payment records.
9. **Tamper-resistant restore selection:** `client/src/pages/BackupPage.tsx` captures active company during backup export and import/verification, checks it again across file reads, encryption, decrypted preview and verified-file receipt, invalidates a candidate after company switching and rejects simultaneous file reads. Destructive restore continues through the existing exclusive cross-tab Web Lock, durable assistant recovery marker and strict `parseBackup` preflight. The UI announces the read operation and retains explicit destructive restore confirmation.
10. **Preserved existing backup financial integrity:** The Run 8 strict JSON duplicate/unsafe-key rejection, document byte budget, encrypted AES-GCM envelope authentication, foreign-company prevention, schema versioned records (through v33), bidirectional sale and commerce links and no-invented-historical-ledger policies are not weakened. No data deletion, automatic restoration or backup overwrite is introduced by the new guards.

### D. Network failure and security enforcement

11. **Bounded encrypted relay requests:** `client/src/features/sync/run18TransportBudget.mjs` + `.d.mts` provide AbortController-backed 15-second request deadlines and a second absolute stream-read deadline, streamed byte-bounded JSON (< 2 MiB), no unbounded response buffering, rejection of declared oversize and malformed JSON. Integrated into the three manual Run 14 HTTPS operations in `run14RelayTransport.ts`. Timeout never changes a pending event to acknowledged, retries itself or posts financial events.
12. **Coordinated consent and queue authorization:** `client/src/features/sync/syncFoundation.ts` moves owner consent and local event queuing under `withCoordinatedRetailWrite` + the Run 7 restore barrier, requires the currently active company and verified in-memory staff identity, rechecks ownership, saved company consent and device status; listing pending events also checks recovery and validates every saved event. Cloud transmission stays disabled.
13. **Safe browser/server response headers:** `vercel.json` and `server/index.ts` stage `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a basic geolocation/microphone/camera Permissions-Policy; Express disables `X-Powered-By`. Strict CSP remains **open** pending verification of real OAuth, voice, external assets and tenant service origins, rather than inventing an allowlist that breaks app workflows.
14. **No unauthorized Git deploys:** `vercel.json` source now specifies `git.deploymentEnabled:false`; owner-approved deployment settings may be re-enabled only in a separate release increment. No Vercel action/deployment was invoked by this turn. This source edit itself does not prove whether an external platform has independently processed earlier commits.

### E. Traceable security analysis

15. **STRIDE-style threat model and security gap register:** `docs/security/RUN18_HARDENING_THREAT_MODEL_2026-10-17.md` records local ledger assets, trust boundaries, untrusted inputs, replay/DoS/tampering/identity threats, source mitigations, residual risks and exact future proof needed. **It is not a signed independent security audit** and never declares a production or hardware acceptance pass.

## Source review and corrections made before this handover

- Found and removed both CSS **and** HTML external Google Font requests and removed the corresponding SW cache, rather than relying on one CSS edit.
- Reviewed on-demand React route loading against the PWA production asset precache and changed service-worker auto-restart policy to manual approval.
- Corrected a passphrase hook's unused import and added company rechecks immediately before file-proof eligibility and after user verification.
- Corrected staff-shell polling from whole-record deserialization to indexed count + one member while preserving disabled-staff denial and unlock/focus notification.
- Added actual post-header stream deadline after recognizing a header-only timeout was insufficient against a slow or malicious server.
- Reviewed that backup candidates are disarmed on company switch, selection cancellation or rejected import; the destructive transaction path itself remains backed by recovery markers.
- Verified by static source inspection only that the Run 14 transport stays release-gated and never claims server ack on timeout.
- Kept a deliberate limitation: strict application CSP is not asserted as safe without real browser OAuth/voice/asset verification. Likewise low-spec Windows runtime and actual File/IndexedDB quota behavior remain unmeasured.

## Run 18 acceptance gates — NONE executed

| Gate | Exact acceptance to perform later | Status |
| --- | --- | --- |
| R18-01 | Strict source semantic types, Vite production+server bundle, native and client suites on this exact final branch SHA | Deferred |
| R18-02 | Windows 11 2/4/8 GiB cold/warm startup, 100k+ sale-line handling, memory and CPU metrics | Deferred |
| R18-03 | Offline installed PWA all on-demand routes without network, user-controlled update during active sale/backup | Deferred |
| R18-04 | IndexedDB concurrent tabs, lock-denied and no-Web-Locks behavior, recovery barrier and crash journal rollback | Deferred |
| R18-05 | Backup corrupted payload, AES-GCM tampering, malicious duplicate JSON, unsupported format, memory cap and cancel | Deferred |
| R18-06 | Distinct companies in backup import/verification/restore, owner session switch and cross-tab race | Deferred |
| R18-07 | Encrypted relay no response, slow headers/chunks, malformed MIME/body, oversized responses, resumed pending event | Deferred |
| R18-08 | Staff owner revocation, consent off-on races, wrong company or device, duplicate sync operation | Deferred |
| R18-09 | NVDA/Edge/Chrome real keyboard screen-reader testing, route focus, dialogs, 200% zoom, contrast/motion | Deferred |
| R18-10 | Security scanner/SBOM/CVE, session policy, OAuth/microphone correctness and reviewed Content-Security-Policy | Deferred |
| R18-11 | Windows and Android store/receipt/scanner/printer/physical device workflow and owner UAT | Run 19, blocked on owner devices |
| R18-12 | Owner-approved signed threat model, independent penetration review, rollback and release acceptance | OPEN / NO-GO |
| R18-13 | Formal staging operations, cloud/payments/publishing approvals and final GO/NO-GO | Run 20, not authorized |

Historical V19 82 acceptance units and 47 blocker statuses remain unchanged; edited source, even after manual inspection, is not executable evidence. No check is recorded as passed.

## Handover

**Run 18 source-development is delivered in one increment.** Full security hardening *acceptance* is explicitly incomplete, not silently postponed under a PASS label. Do not merge to main, re-enable Git deployment, activate Run 14 encrypted network, authorize real Run 15 payments, publish Run 16 commerce or call Run 17 assistant analytics financially audited without separately evidenced sign-off.

**Next planned source-development run:** **Run 19 — Real Devices/UAT**. Its actual acceptance necessarily requires owner hardware and user participation. Under a development-only continuation, source harnesses, manual UAT scripts and evidence capture tooling can be prepared, but no simulation can substitute for executed real-device acceptance.
