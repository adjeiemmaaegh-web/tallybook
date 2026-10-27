# Tallybook V19 source integration — 2026-10-27

## Git result

- GitHub `main` was fast-forwarded from `1d772d70163ce4b01d95f325321b64e651d17a81` to verified application commit `03a89a2f699fa34eea019f8ee1020448f0eb7efd`. A later evidence-only commit may advance both branch tips without changing that verified application tree.
- GitHub `development/v19-unified-reconciliation` received the same application commit. The finance branch `a2c445f0f1eee41bcfb9926991ff9c23e77e88c6` is preserved as the second parent of merge commit `c9f736bb9ef023d1bfaf34604eb946f4728a7336`.
- An independent, non-shallow Windows clone remains at `work/tallybook-local-clone`. It contains 39 original remote branch heads and the full source history; no branch was deleted or force-pushed.
- The uploaded Master archive SHA-256 is `873b5a363ead6f378b0d36490cf3e6a18192e70922683ba10ba1db0be8140e70` and was not changed.

## Exact automated verification

| Gate | Result | Raw log |
|---|---|
| Client Vitest, serialized | 1,030 passed / 1,030, 132 files | `evidence/2026-10-27/final-client-full-2026-10-27.txt` |
| Native QA with Windows fixture permissions | 435 passed / 435 | `evidence/2026-10-27/final-native-full-2026-10-27.txt` |
| Focused server authorization and supplier-tax audits | 48 passed / 48 | `evidence/2026-10-27/final-server-focused-2026-10-27.txt` |
| TypeScript semantic check | Exit 0, no diagnostics | `evidence/2026-10-27/final-typescript-2026-10-27.txt` |
| Vite production build and PWA precache | Exit 0 | `evidence/2026-10-27/final-build-2026-10-27.txt` |
| Chromium owner/auth, release/schema and offline suites | 4/4, 3/3, 3/3 | `evidence/2026-10-27/final-browser-*.txt` |
| Windows local preview | Build and static assets passed; loopback GET returned HTTP 200 | `evidence/2026-10-27/final-local-preview-2026-10-27.txt` |
| Full clone integrity | `git fsck --full` exit 0; only dangling historical objects | `evidence/2026-10-27/final-git-fsck-2026-10-27.txt` |

The first merged full client run had 1,023 passes and two failures. The supplier test fixture lacked saved timestamp evidence, and a denied reversal retry had an imprecise error message. Both were corrected, their focused suites passed, and the complete final run above passed. The initial failure log is retained as `evidence/2026-10-27/stage22-client-full-2026-10-27.txt`.

The package lockfile was unchanged. A fresh dependency audit was not completed because Corepack requested a download of pinned pnpm 10.34.0; see `evidence/2026-10-27/final-dependency-audit-status-2026-10-27.txt`. No passing audit is claimed for this final commit.

## Release boundary

The repository has `git.deploymentEnabled: false` in `vercel.json`. Vercel's latest deployment ID remained `dpl_Dz5u1VudvVRvtYkCFqf5r8NeonP7` immediately after the main push. The public domain still serves its previous deployment; no Vercel promotion or production release was performed. Main now holds the integrated **development source**, not a production acceptance decision.

The 82-unit acceptance register is unchanged. Remaining blockers include live owner/attendant account binding and RLS exercise, representative backup/migration checks with real data, the 43 optional-sync server security cases needing Linux, the complete Watchdog event contract, and supervised Windows/Android workflows. Deferred features must remain development-only until their own acceptance. See `OUTSTANDING_READINESS_BLOCKERS.md` and `BRANCH_DISPOSITION_2026-10-27.md`.
