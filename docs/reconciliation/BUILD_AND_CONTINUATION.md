# Reproduce the development checkpoint

Checkout `development/v19-unified-reconciliation` at commit `5616d24`. Use Node.js 24.19.0 and pnpm 10.34.0 on Windows. From the repository root:

```powershell
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm exec vitest run --maxWorkers=4
pnpm exec playwright test --config playwright.config.mjs
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --prod
```

The offline browser gate passed 3/3 at the batch-merge checkpoint. Full Vitest and native QA remain failing or incomplete. The latest combined build command did not return after Vite reported a successful client build; the earlier complete client/server build evidence is in `evidence/build-after-batch.txt`. Do not interpret the commands above as a claim of successful completion.

## Continuation order

1. Resolve the remaining paths marked pending in `SOURCE_RESOLUTION_REGISTER.md` against their exact Master and branch ancestors, recording each decision and tests. Recheck the already reconciled paths after each related change.
2. Extend Dexie migration tests for both historical v30 lineages, v34 rows, crash interruption, backup and restore. Retain transaction history.
3. Maintain the now-passing offline Playwright checkout scenarios when source conflicts are resolved. Keep the verified owner unlock, open shift and `requireSaleAttendant` enforced.
4. Reconcile the obsolete global-cloud-gate assumptions in `client/src/auth/auth.test.tsx` with the current cloud-route-only `AuthGate.test.tsx`. Triage the other full Vitest and native QA failures; rerun complete suites on stable source. Run browser coverage and dependency checks again after source resolution.
5. Update the 12-stage register and risk assessment. Open a pull request against `main` only when integration is reviewable; do not merge or deploy automatically.

## Open risks

The overlapping expenses, inventory, sales, store, and UI paths can change money or inventory semantics. The current v35 migration fixtures cover sample rows but not all real-world histories or restore paths. The Windows native server tests include POSIX path and permission assumptions and cannot be counted as passing. Physical device, cross-browser and operational acceptance remain deferred. Production release is NO-GO.
