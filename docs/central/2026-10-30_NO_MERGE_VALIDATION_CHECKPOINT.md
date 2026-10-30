# Main-merge validation checkpoint — 2026-10-30

The owner asked to stop deferring validation and merge the integrated work to `main` **if finished**. The release is **not finished**, so `main` was not changed. The development branch was at `521a11b` for the initial exact-source checks; test-only commit `95feb7a` corrected a stale supplier write-barrier audit and was pushed to the same development branch. The application source is identical between these two commits.

## Evidence obtained

- GitHub `main` remained `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb` when checked; the development branch advanced to `95feb7a`. The development candidate changes 75 files relative to that merge base.
- Native `qa/*.test.mjs` on Windows: **473/473 passed** (`evidence/v54-full-native-exact-head.txt`).
- The updated supplier write barrier audit: **8/8 passed**. It now requires all six guarded supplier liability write paths; this strengthens the stale assertion rather than removing the recovery check.
- Server security tests on Windows: raw failures recorded in `evidence/v54-server-windows-exact-head.txt`. POSIX absolute-path and file-permission guards are incompatible with this Windows test host. One additional stale supplier assertion was corrected in `95feb7a`. No server-suite pass is claimed.
- GitHub Actions run [41004781037](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/41004781037) for `521a11b` completed as failure with **zero job steps**. It supplies no Linux test result. Earlier GitHub notice cited account payment or spending limit; the current run did not provide test logs.
- Client full suite: initial sandbox runs failed before importing tests with Windows `EPERM` while renaming a temporary file. With workspace-local `TEMP` and elevated local test access, the representative sales suite passed **18/18** and the full client suite passed **1,045/1,045 across 134 files** in 1,334.38 seconds (`evidence/v54-full-client-validated-exact-head.txt`). This run used the same application source as `95feb7a`; that later commit only changes a server test assertion.
- Chromium release, local authentication, offline built-app and friends-test password recovery suites passed **3/3, 4/4, 3/3 and 1/1**. Raw logs: `evidence/v54-browser-release-exact-head.txt`, `evidence/v54-browser-auth-exact-head.txt`, `evidence/v54-browser-offline-exact-head.txt`, `evidence/v54-browser-recovery-exact-head.txt`.
- TypeScript semantic check and Vite/PWA client build passed on the same application source before the test-only `95feb7a` commit. The `pnpm` wrapper could not resolve its Corepack download because npm registry DNS was unavailable, so the installed `tsc.cmd` and `vite.cmd` binaries were used directly. See the V54 cursor checkpoint for the focused SQL/browser parity result.

## Release decision

**NO-GO for merging as a completed integration.** The QA signed pull is disabled and its V53/V54 SQL is not applied. Cloud claims are not durably reconciled into a second device's local financial ledger. There are no two real owner/attendant QA accounts, no historical sanitized backup restore evidence, and no Windows/Android end-to-end acceptance. Merging the current branch would put incomplete QA-only source on `main` without making those flows usable on the live website.

Next: complete isolated Auth/device/sync acceptance; restore a representative backup; obtain a real Linux server security run once GitHub Actions can start its job; then review the merge and deployment separately. Do not call the current branch production ready.
