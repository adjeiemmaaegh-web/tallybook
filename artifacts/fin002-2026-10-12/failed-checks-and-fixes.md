# Retained failed checks and corrections

1. Initial new supplier test run: 10/11 passed, 1 failed. The orphan event rejection was correct but the test only accepted error text `duplicate|missing`, while the actual error was `Supplier report contains orphan, foreign or invalid currency/date evidence.` The test was corrected to also accept the meaningful `orphan` error. All test cases remain; final 12/12 passes.
2. An initial TypeScript *transpilation* probe passed three changed `.ts/.tsx` files but crashed on a declaration-only `.d.mts` because TypeScript's transpileModule has no emission for that declaration. Replaced the probe with createSourceFile parseDiagnostics, which parses four changed TS files successfully. This was a probe limitation, not a code defect.
3. Full-project `tsc --noEmit`: blocked (TS2688) by absent `node` and `vite/client` type definitions. See `full-tsc.log`. Not counted as a pass.
4. Client Vitest, Dexie/IndexedDB, pinned Node 24/pnpm, production build, Playwright and physical/hardware checks not executed because the complete dependency environment is unavailable. Newly authored client tests remain unexecuted.

The current audit does not claim statutory tax compliance, bank-settlement confirmation, verified historical currency for missing evidence, or a complete profit/cash flow statement.
