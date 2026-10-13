# Tallybook V8 Stage 1 — Build 8 (runtime verification groundwork)

## Scope

- `getSaleSnapshot` now reads sales, sale lines, payments and receipts inside one Dexie readonly IndexedDB transaction to avoid a checkout snapshot composed of reads from different committed states.
- Added a real-database integration regression in `sales.test.ts` exercising two-item, partial-payment sale creation, snapshot recovery, receipt matching, stock updates, and no extra writes during recovery.
- Added a persisted-payment-corruption integration regression: recovered checkout fails safely and stock/sale count remain unchanged.

## Verification status

- Changed TypeScript files parsed successfully using globally installed TypeScript.
- Full Vitest execution **blocked**: project dependencies not installed (`vitest: not found`).
- Production build **blocked**: project dependencies not installed (`vite: not found`).
- Live browser / real-device checkout, camera, printer and offline cache tests **not executed**.
- These are development changes and test definitions, not evidence that the financial integration tests pass.

## Release gate

Install locked dependencies (`corepack pnpm install --frozen-lockfile`) on Node >=22.12 with package registry access, then run `pnpm test`, `pnpm check`, `pnpm build`. Execute manual browser tests of offline checkout, interrupted checkout recovery, initial partial payment, receipt retrieval, and thermal printer fallback. Do not release before these checks pass.
