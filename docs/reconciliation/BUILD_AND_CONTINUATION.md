# Reproduce the development checkpoint

Checkout `development/v19-unified-reconciliation` at the package manifest commit. Use Node.js 24.19.0 and pnpm 10.34.0 on Windows. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm exec vitest run --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --reporter=dot
pnpm exec playwright test --config playwright.config.mjs
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --prod
```

The complete client Vitest run passed 995/995 in 124 files with the serialized invocation above. The build and both browser suites passed. Native Node on Windows remains non-green at 746 passed, 62 failed, 1 skipped. See `evidence/verification-final-summary.md` and the raw native log.

## Continuation order

1. Triage all 62 native Windows failures from `evidence/native-node-windows-final.txt`, then run the POSIX security tests in their supported runtime without relaxing file, path, or authorization checks.
2. Extend Dexie migration tests for both historical v30 lineages, v34 rows, crash interruption, backup and restore. Retain transaction history.
3. Maintain the passing offline Playwright checkout scenarios. Keep verified owner unlock, open shift and `requireSaleAttendant` enforced.
4. Validate the 82 governing acceptance units, physical devices and cross-browser recovery. Open a pull request against `main` only when integration is ready; do not merge or deploy automatically.

## Open risks

The source-overlap decisions are recorded, but broad real-world financial and inventory acceptance remains open. The current v35 migration fixtures cover sample rows but not all real-world histories or restore paths. Windows native tests include POSIX path and permission assumptions and cannot be counted as passing. Physical device, cross-browser and operational acceptance remain deferred. Production release is NO-GO.
