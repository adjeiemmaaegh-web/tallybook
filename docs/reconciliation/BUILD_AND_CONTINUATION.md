# Reproduce the development checkpoint

Checkout `development/v19-unified-reconciliation` at commit `99a9100`. Use Node.js 24.19.0 and pnpm 10.34.0 on Windows. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm exec vitest run --maxWorkers=4
pnpm exec playwright test --config playwright.config.mjs
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --prod
```

The full Vitest and offline browser gates are not passing. The verified server bundle was created with esbuild and its log is in `evidence/server-build.txt`. Do not interpret the commands above as a claim of successful completion.

## Continuation order

1. Resolve the 20 paths in `SOURCE_RESOLUTION_REGISTER.md` against their exact Master and branch ancestors, recording each decision and tests.
2. Extend Dexie migration tests for both historical v30 lineages, v34 rows, crash interruption, backup and restore. Retain transaction history.
3. Maintain the now-passing offline Playwright checkout scenarios when source conflicts are resolved. Keep the verified owner unlock, open shift and `requireSaleAttendant` enforced.
4. Triage all full Vitest and native QA failures; rerun the complete suites on stable source. Run browser coverage and dependency checks again after source resolution.
5. Update the 12-stage register and risk assessment. Open a pull request against `main` only when integration is reviewable; do not merge or deploy automatically.

## Open risks

The overlapping backup, credit, purchases, payables, reporting, store and UI paths can change money or inventory semantics. The current v35 migration fixtures cover sample rows but not all real-world histories or restore paths. The Windows native server tests include POSIX path and permission assumptions and cannot be counted as passing. Physical device, cross-browser and operational acceptance remain deferred. Production release is NO-GO.
