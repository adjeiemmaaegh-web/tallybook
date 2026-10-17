# Tallybook V19 — Run 18 Security, Resilience and Low-Spec Threat Model (Source Review)

**Date:** 2026-10-17  
**Branch:** `v19/run18-hardening-development-20261017`  
**Status:** **DRAFT SECURITY REVIEW, NOT AN INDEPENDENT AUDIT, NOT SIGNED OFF.**  
**Scope:** Source-only Run 18 hardening increment; no production deployment, real device acceptance, security scanning, executable tests, browser measurements or attack harnesses were run.

## Assets and operating trust assumptions

- **Protected assets:** owner/company identity, verified local staff sessions and credentials, POS sales/receipts, customer balances, refund-policy snapshots, FIFO stock-cost provenance, store stock and transfer logs, assistant memory, encrypted backups and any user-supplied backup passphrase.
- **Trusted only when separately verified:** active company ID, unlocked staff session bound to that company, atomically recorded IndexedDB data under recovery barrier and cooperating cross-tab locks, locally decryptable AES-GCM backup with correct contents and business ledger integrity.
- **Untrusted:** filenames, file MIME claims, JSON source fields, browser memory hints, unauthenticated internet requests, client-supplied provider status, AI output, locally entered explanatory notes, externally supplied customer requests, cache availability and navigator.onLine. A web lock is cooperative and cannot prevent malicious code in a compromised same-origin page from writing directly to IndexedDB.
- **Deployment boundaries:** one offline-first per-device source of truth. Real cross-device finance, public commerce and live payment are not active. Signed encrypted relay evidence does not authorize remote stock or money postings.

## STRIDE threat-to-source matrix

| Threat/attack | Source mitigation in this increment | Residual status |
| --- | --- | --- |
| Spoof active company during opt-in sync | `syncFoundation.ts`: company and in-memory staff-session rechecked under coordinated write and Run 7 recovery guard; consent owner-only | Browser-origin compromise and compromised owner's credentials remain out of scope of a source-only check |
| Tamper with or replay local sync evidence | Existing unique operation/event keys, exact identity checks; Run 18 adds same company and consent checks before returning pending evidence | Multi-device idempotency and server membership require real negative-path testing; remote relay remains disabled |
| Block device with an excessively large backup file | `run18ImportAdmission.mjs`: reject by file byte length before read; memory-class budget 12/24/48/96 MiB; reject oversize rather than truncate | Device-memory reports are imprecise; malformed compressed/crypto inputs still require real browser memory profiling |
| Leak backup passphrase through a visible prompt | `useRun18PassphrasePrompt.tsx`: masked password input, transient React state, focus trap and escape cancellation; no app persistence | OS screen capture, malicious extensions and browser password-manager behavior are not controlled by the app |
| Restore selected backup into a changed business context | `BackupPage.tsx`: company identity captured before async file load, decryption, export proof and confirmation; selected candidate dropped on context change. Authoritative restore still uses recovery locks and preflight | Race tests across several tabs, interrupted restore and external unauthorized source mutation remain mandatory |
| Malicious JSON backup graph / duplicate financial fields | Existing bounded lexical preflight, duplicate/unsafe key rejection, full schema/identity/financial restoration validation; Run 18 adds pre-file-read memory gate | Formal fuzzing, truncated file, UTF-8 edge cases and quota exhaustion not run |
| Denial of service by slow or infinite encrypted relay HTTP stream | `run18TransportBudget.mjs`: 15-second header deadline, bounded post-header streamed read, 2 MiB max budget; no implicit resend | Custom transports can ignore AbortSignal; remote receipt loss remains an uncertain outcome and must not be reported as success |
| Spoof remote payment/settlement through analytics | Existing Run 15 and 16 no-live-payment gates; no change to real payment or POS posting paths in Run 18 | Real provider verification, bank matching and merchant payment sign-off are future work |
| Compromise browser through third-party fonts | `client/index.html`, `index.css`, `vite.config.ts`: removes Google Font requests and runtime font cache; local/system fallback | Other approved application services may still use network; dependency supply-chain audit remains open |
| Exhaust CPU/memory on low-spec Windows navigation | `App.tsx`: on-demand routes; `AppShell.tsx`: targeted staff/member check and hidden-tab polling limits; `run17Evidence.mjs`: O(n) group accumulation | Real 2/4/8 GB Windows performance, heap, startup, memory retention, GPU-free operation and PWA cache integrity not measured |
| Interrupt POS write through automatic PWA refresh | `vite.config.ts`: `registerType: "prompt"`; `run18UpdatePolicy.ts`, `Run18UpdateNotice.tsx` and `main.tsx`: owner-triggered update/reload; no silent update-page reload | Uncontrolled browser/OS crashes, Web Locks failure, PWA interruption during install need testing |
| Phishing/clickjacking/metadata referrer leaks | `vercel.json`, `server/index.ts`: X-Frame-Options DENY, nosniff, no-referrer, restricted geolocation policy | CSP/nonces, session/cookie details and OAuth popups need full browser and independent security review |
| Keyboard/screen-reader exclusion | Focus handling on route switch and mobile menu; passphrase dialog masked+focus trapped; reduced motion/forced colors/high contrast in CSS | Automated axe, screen readers, zoom, keyboard-only POS workflows, low-vision and touch target audits not run |
| Unintended exposure of recovery diagnostic details | `ErrorBoundary.tsx`: safe retry guidance, warns not to clear device storage, no raw stack traces | Other exception/toast paths and sensitive browser logs need full security sweep |

## Source-review limits and high-severity open items

1. **No exploit verification or formal sign-off.** This is a review of edited source; it is not penetration testing, independent code audit, approved threat-model closure or evidence of a verified secure release.
2. **Release still NO-GO.** Historic 82 acceptance units and 47 blocker statuses remain unchanged. This report does not turn any issue to PASS.
3. **No real-device measurements.** Browser SW cache completeness, 8 GB or lower Windows startup, memory pressure, browser sleep/crash, screen readers, printer/scanner setup and payment/offline edge cases require owner-controlled actual devices.
4. **No real-world cross-tab crash proof.** IndexedDB and assistant recovery have a durable marker and Web Locks, but cooperating locks are advisory. Rapid tab closure, power cut between databases, quota errors and external same-origin attackers remain acceptance cases.
5. **No CSP sign-off.** A strict Content-Security-Policy is not asserted here because currently configured authentication, microphone/voice, third-party integrations and dynamic resources require a verified allowlist. Adding arbitrary CSP could break real workflows; an independently reviewed policy is an open security gate.
6. **No provider or public storefront authorization.** HTTP response hardening does not enable disabled Run 14 relay, Run 15 payment provider or Run 16 guest storefront. A source-only hardened endpoint is not authorization for cloud transport.
7. **Hard low-memory rejection is explicit.** The file admission cap refuses large imports on constrained devices rather than risking a partial destructive restore; a separately verified backup and better-equipped offline restore device are needed for oversized companies. No business records are truncated.
8. **Source-only corrections may still contain defects.** Semantic TypeScript, Node, Vite, Dexie transaction execution, React browser runtime and PWA production-bundle review were intentionally deferred by owner instruction.

## Owner-controlled future acceptance probes (NOT EXECUTED)

- Linux/pinned Node and Windows 11 strict TypeScript/build/syntax full suites on the **exact final SHA**; pinned pnpm.
- Compare cold/warm PWA install, all lazy route pre-caching, airplane-mode refresh and service-worker update prompt with active unsaved form and while POS/backup operations are ongoing.
- On 2/4/8 GB Windows devices check CPU, heap, render/focus latency, memory pressure and stale route transitions; specifically ensure low-memory refusal is understandable and does not corrupt records.
- Backup inputs: forged Content-Type/file size, truncation, duplicate JSON keys, nested billion-laughs-like arrays, invalid UTF-8, wrong passphrase, modified AES-GCM auth tag, SHA receipt mismatch, cancellation mid-import, repeated verification and same-company/cross-company concurrent restore.
- Multi-tab ownership, PIN/shift revocation races, shared write lock support and unsupported Web Locks, startup interrupted restore marker, quota exhaustion and forced OS power cut.
- Network fixture: HTTP timeout, streaming no Content-Length, infinite chunk stream, oversized chunks, redirects, wrong origin/MIME/status, revoked tenant consent, wrong device scope, duplicate receipt, replay, forged ciphertext signature and unknown-outcome retry.
- Browser accessibility: NVDA + Chrome/Edge on Windows, keyboard-only, pinch/200% zoom, high contrast, forced-colors, reduced-motion, route-load focus, popup focus trap and modal close/restore.
- Security: SAST/DAST, dependency/CVE/SBOM review, source map/secrets checks, OAuth popup compatibility with frame/referrer/permission headers and a deliberate signed CSP design after all legitimate origins are known.
- Recovery drills must document exact observed before/after record counts, hashes and staff signoff; no skipped/blocked assertions may be reported as PASS.

**Signoff:** **OPEN — NOT APPROVED.** Owner's source-first development instruction authorizes this source increment only; no testing, deployment, payments, staging, security approval or external publishing is implied.
