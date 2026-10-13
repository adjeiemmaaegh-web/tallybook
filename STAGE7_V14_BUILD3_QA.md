# Stage 7 V14 — Build 3: First-run setup/navigation

## Delivered
- Read-only onboarding checklist on the Home page for businesses without products or recorded sales.
- Company-scoped progress queries for active products, active customers and recorded sales, read consistently inside an IndexedDB read transaction.
- Shortcut links to stock, customer, sale and backup pages, with optional customer onboarding clearly identified.
- Refresh progress after window focus or company switching. On query failure, display an honest error without changing business data.
- Pure progress rules and regression tests.

## QA evidence
- Three new/modified TS/TSX files transpiled without syntax errors using globally installed TypeScript.
- Three isolated runtime assertions passed for milestones and invalid counts.
- Project archive checked with `unzip -t`.

## Deferred
- Complete Vitest suite, semantic TypeScript type-check, production Vite build, browser onboarding/IndexedDB tests, and accessibility verification because project dependencies are unavailable in this environment.
- Prior Stage 5 and Stage 6 blockers remain in the project's QA tracking and are NOT marked resolved.
- Stage 7 is in progress; no Stage 8 work started.
