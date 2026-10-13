# Windows Vite build failure: colliding TypeScript / MJS module names

**Observed on 2026-10-12 on owner Windows Node 24.19.0:** Vite transformed 1,933 modules then failed because `CashReturnReviewDialog.tsx` imported `getCashReturnReview` from an extensionless path that resolved to `cashReturnReview.mjs` instead of `cashReturnReview.ts`. The `.mjs` file intentionally exports only pure preview calculations; the actual IndexedDB reader is exported by `.ts`. The same collision affected the supplier-payable page: `supplierPayables.ts` implements database actions while `supplierPayables.mjs` exports pure reconciliation.

## Fastest owner action

1. Download **FIX_TALLYBOOK_V19_WINDOWS.cmd**.
2. Save it **directly inside** the existing `tallybook_fixed` folder containing `START_TALLYBOOK_WINDOWS.cmd`; for the reported owner environment the folder was `C:\Users\adjei\Music\TALLYBOOK\tallybook_fixed`.
3. Double-click the fix. It checks and updates seven *source import statements* and then starts the existing local launcher, using the owner's existing `node_modules`.
4. If the browser opens, **use fictional sample records only**, then run `CHECK_TALLYBOOK_WINDOWS.cmd` separately. Send the next error text if Vite, TypeScript, or browser checks fail.

The patch is idempotent, requires no access to real data and does not remove dependencies, backups or browser storage. It deliberately does not disable refunds or weaken financial protections. For a noninteractive alternative, use the source archive with these same changed import paths.

## Exact change

Where `.ts` and `.mjs` share a basename, replace extensionless imports with explicit `.ts` imports, including client tests and TypeScript type-only imports. Specifically: `CashReturnReviewDialog.tsx`, `cashReturnReview.test.ts`, `PurchasesPage.tsx`, `supplierPayables.test.ts`, `backup.ts`, `financialIntelligence.ts` and `TallybookDB.ts`. The Vite plugin Zod comment warnings preceding the original failure were nonfatal and require no workaround.

Added `qa/window-build-extension-collisions.test.mjs` to reject the same mistake in future. Its baseline run failed (seven ambiguous import occurrences); after correction it passed. All financial modules remain otherwise byte-identical.

## Local evidence and limitations

- Original 1,037-member launch ZIP verified by SHA-256 (`fbcd58177a1ccc1b9d87f5b0a410ec8281365e9c24cc3651812bdc1977eedd3a`).
- Linux Node 22.16 native suite **464/464 passed**, zero failures or skips (previous 463/463).
- Separate simulated gateway suite **4/4 passed**.
- Seven changed TypeScript/TSX files parsed successfully with global TypeScript 5.8.3, not semantically checked against installed dependencies.
- **Not yet run here:** Vite production build, full client Vitest, full semantic TypeScript, real Windows browser/PWA/IndexedDB. The owner has installed dependencies on Windows, so the next actual Vite build on that machine is the decisive check.
- The 82 acceptance units and 47 release blocker statuses remain **unchanged**. Commercial status **NO-GO / INCOMPLETE**. No provider, staging or production deployment authorized.
