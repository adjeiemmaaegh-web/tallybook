# Release Checklist — Release Candidate 1

## Release position

This checklist records the verified release-candidate state for the offline-first Tallybook application. It is suitable for real-world owner testing. It is **not** a claim that every device, browser, or business environment has been independently certified.

| Release criterion | Status | Evidence |
| --- | --- | --- |
| Business records remain in IndexedDB, not localStorage | PASS | Database schema and local-workflow regressions. |
| Setup, stock, customers, sales, payments, receipts, debt, reports, and backup workflows are available | PASS | Full regression suite and isolated browser flows. |
| Cash, part-paid, and credit sales remain atomic and duplicate-safe | PASS | Sales and reliability tests. |
| Repayments, debt balances, and reports reconcile to saved records | PASS | Credit and reports tests. |
| Offline sale, reopen, and cached app shell behavior are verified | PASS | Stage 8 isolated browser check. |
| Backup export, validation, replace confirmation, and full restore are verified | PASS | Stage 9 tests and isolated browser check. |
| Local record check is read-only and reports inconsistencies | PASS | Stage 11 integrity tests and isolated browser check. |
| Keyboard skip link, focus treatment, route announcements, and responsive screens are verified | PASS | Stage 10 tests, keyboard check, and visual checks. |
| Dependency audit has no critical, high, moderate, or low findings | PASS | Stage 11 production dependency audit. |
| Production PWA build, manifest, service worker, and client route fallback are verified | PASS | Final production build and route check. |
| Local browser timing sample | PASS | Managed local preview: 278 ms navigation load, 276 ms DOM content loaded, and 368,826 B transferred. |
| Deep production PWA audit | PASS | Service worker controlled the production-origin app; cached shell reloaded while an uncached network request was blocked. |
| Deep route and source-boundary audit | PASS | Released and unknown routes recovered as intended; no remote business-record API or business localStorage use was found. |
| Performance threshold on representative low-end devices | NOT TESTED | Requires owner-device testing; no artificial claim is made. |
| Cross-browser and OS installation behavior | NOT TESTED | Requires testing on the owner’s target browsers and devices. |
| Installed-app icon appearance on the owner’s phone | NOT TESTED | The header mark is visually checked; installed PWA icon appearance requires an actual device install. |

## Installation and first use

Open the supplied web address while connected once, then use the browser’s install or add-to-home-screen option if it is available. After the first successful load, open **Business** to save the business profile, then **Stock** to add products before recording a sale. Use **Backup** to download a local copy immediately after meaningful work.

## Deployment handoff

The release build and static-route fallback have been verified. After human approval, open the project management panel and use **Publish** to release the checkpoint; this preparation step does not publish automatically. Before sharing the published address, load it once on the owner’s intended phone, complete the first-run setup, and download a local backup.

## Release decision

> **Release candidate only.** Approve real-world use after the owner completes the manual test steps in this checklist on the intended device and keeps a verified local backup.
