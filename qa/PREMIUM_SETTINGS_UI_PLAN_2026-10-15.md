# Premium Settings UI — Business Setup and Staff & Permissions

**Design reference:** Tallybook Home premium dashboard, using a light cool-blue background, white elevated cards, cobalt actions, soft rounded controls, and typographic hierarchy.

**Scope:** `/business` (including `?view=companies`) and `/staff`. Retain the AppShell navigation, Home, Sales, Customers, Inventory, Purchases, Expenses, Reports and Backup pages unchanged.

## Layout plan
1. Business Setup: settings header and local-storage assurance, clear business identity/trading/contact sections, coherent form save row, tax and Mobile Money configuration, company workspace management and safety-focused clear-company area.
2. Staff & Permissions: settings header, local-only security notice, summary cards, staff unlock and biometric enrollment, owner-first setup, directory with role/status controls, permissions as readable toggles, independent PIN reset controls per employee, shift lifecycle, last ten shift entries, and permission-filtered audit entries.
3. Device widths: desktop (1440+), laptop (1024), tablet (768), phone (390 and 320), keyboard focus and readable empty/error/loading states.

## Non-negotiable invariants
- Preserve the real imported staff/business service functions and their authorization. Never derive access decisions solely from CSS/UI display.
- Leave PIN contents masked. Avoid reusing one PIN input for both staff creation and unlock, and avoid one reset PIN state shared across staff members.
- Do not reinterpret shift amounts (stored as **minor units**) as major currency units.
- Preserve owner-first enrollment, shift/permission/role/biometric controls, company isolation, no-cloud caveats, tax settings and provider actions.
- Do not mutate live data, merge or deploy. Existing V19 commercial release remains NO-GO.
- Provide tests that can be executed later on Windows, clearly marked NOT RUN.

## Review and acceptance
- Static source review of form fields, imported service calls, guards, JSX structure, CSS scoping.
- Deferred: `pnpm.cmd check`, `pnpm.cmd test --maxWorkers=2`, `pnpm.cmd build` and targeted Playwright browser checks for both settings pages.
- All changes live on a separate draft PR until owner review and real runtime testing.
