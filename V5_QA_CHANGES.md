# Assistant V5: atomic compound sales

- Compound sale expansions (e.g. "Sell 2 eggs and 1 rice to Kwame, cash") now invoke the existing `completeSale` API once with multiple sale lines.
- The sale, receipt, payment, inventory movements and stock changes are written inside the existing Dexie transaction. No partial product lines can commit.
- All products must pass preview; incompatible customer/payment terms are rejected at confirmation. A shared numeric payment remains unsupported rather than being guessed.
- Ordinary multiline batches continue to use their previous non-atomic sequential execution. This is **not** a blanket atomicity guarantee for all assistant commands.
- Added regression coverage for one sale/two lines and stale preview/product invalidation.

## Verification limits
TypeScript syntax transpilation passed for modified files. Full typecheck, Vitest and browser E2E remain unverified because project dependencies are not installed in this environment.
