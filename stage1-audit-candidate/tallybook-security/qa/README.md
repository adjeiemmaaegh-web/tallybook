# Tallybook V19 — QA companion to Security Validation

Independent TypeScript QA package added under `tallybook-security/qa/`. Existing security module and application files remain unchanged. Framework has **no built-in knowledge of Dexie tables, role names, React routes or UI selectors**.

## Install / run

From `qa/`: `npm install`, `npm run typecheck`, `npm run test:unit`, `npx playwright install chromium`, then start an **isolated test instance** and run `TALLYBOOK_QA_URL=http://127.0.0.1:5173 npm run test:e2e`. Vitest runs framework unit tests; Playwright smoke tests page boot. Both require dependency installation. The seven real-business scenarios in `src/scenarios.ts` are not executed until the host supplies a concrete fixture.

## Integration

Implement `QaAdapter` in `src/contracts.ts` using the existing Dexie DB and existing authorization/financial services. Implement `FixtureFactory` to return a freshly initialized disposable sandbox for EACH scenario, with two companies, a cashier, a manager, an outsider, and a stocked SKU. The runner intentionally never calls `resetSandbox()` after fixture creation; doing so would erase seeded data. Import `runTallybookQa` from `tests/integration.template.ts`, call it in a new project-specific Vitest integration test with your fixture factory. Ensure `resetSandbox()` resets **only a disposable QA database**, never user data. Wire `authorize()` to the existing security validator and authoritative auth service, not a hardcoded allow-list. `sale`, `refund`, `adjustInventory`, `exportBackup`, and `restoreBackup` must call real existing business methods; do not bypass application invariants. The adapter's repeated request ID scenario assumes idempotent sale submission; adjust only if product requirements explicitly differ. Backup comparison uses canonical adapter snapshots; ensure stable ID ordering. For browser UI coverage, add project-specific page objects and selectors to `playwright/` after discovering real routes and login flows.

## Reports and limitations

`failureReport()` emits machine-readable JSON with scenario, pass/fail, failure reason and duration. Playwright writes HTML, screenshots and traces under `reports/` on failure. No real Tallybook integration tests, backup destructive tests, browser run or permission enforcement assertions are claimed until a host fixture is provided. Security validation alone is not authorization enforcement; production writes must recheck trusted authorization within their write transaction. Browser IndexedDB data must remain isolated to disposable QA profiles.
