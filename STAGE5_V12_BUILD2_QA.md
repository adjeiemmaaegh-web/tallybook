# Stage 5 V12 — Build 2: Company-scoped assistant conversation state

## Changed
- Clear remembered customer/product/supplier, previous query, open drafts, pending financial actions, parked assistant draft, batch plan, reversal token, and app navigation context whenever the active business changes.
- Reject action callbacks created under a different business profile, asking user to start again; do not submit a financial mutation.
- Invalidate stale pending tokens when the active business changes.
- Add two Vitest regression cases for cross-company pronouns and financial confirmations.

## Verification
- Two modified TypeScript source files parsed successfully using TypeScript transpilation diagnostics.
- New test cases have NOT been executed. Full Vitest/typecheck/production build, real IndexedDB and browser tests are deferred until dependencies are available.
- This is a development build, not Stage 5 completion.

## Next Stage 5 work
- More multi-turn clarification/slot-filling test coverage; richer offline utterances and quote/loyalty/wallet assistant previews; precise record evidence and audit review; full regression validation.

## Deferred QA
- npm install/CI, npm test, npm run check, npm run build, browser offline end-to-end, device voice testing, combined Stage 2/3 branches integration and regression. Keep these in the project-wide final test checklist.
