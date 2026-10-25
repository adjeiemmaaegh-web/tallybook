# Tallybook V19 — Local central workspace + accountability source increment

**Source baseline:** `TALLYBOOK_V19_BATCH7_INTEGRATED_SOURCE_2026-10-24.zip` (952 members; Dexie schema v29). **Date:** 2026-10-24. This work is local-only. No GitHub or Supabase project change, no deployment, no live payment, no customer data operation.

## Implementation done

- Compared uploaded owner brief with real source. The source includes non-networked sync outbox, local sales, staff shifts, store assignments and a single-store Watchdog CSV. Notably *no* central Supabase schema/ingest and no authoritative per-sale device/shop provenance.
- Wrote `DATA_CONTRACT.md`, `RULES.md`, `SECURITY.md`, `PILOT_PLAN.md`, source assessment, migration/rollback strategy, Watchdog agent instructions and blocker register.
- Prepared SQL `001_core_tables.sql`, `002_rls_policies.sql`, `003_audit_and_views.sql` and harmless test seed placeholder. SQL is **not executed**; central financial tables are deny-by-default for browser writes until trusted ingestion is audited. Owner/manager reads are membership-scoped.
- Added `requireStaff.mjs/.d.mts/.ts` and updated `sales.ts`: new sales require validated account plus active shift, and mobile payments require a saved provider and nonblank, uniquely scoped reference. Existing historical rows remain untouched. Existing behavior changes for businesses lacking an owner account; test and onboarding review required.
- Added local `noSaleEvent` validation/service, a PIN-based Staff screen, and Dexie v30 append-only journal. Requires assigned active shop and locally registered active device; does not actuate real drawer hardware, prove physical device identity or independently prevent tampering of IndexedDB.
- Mapped no-sale events into existing single-store Watchdog CSV. CSV is still not the final versioned shared contract.
- Added manual `supabaseUploader` adapter boundary for payload digest/ACK validation without installing a real cloud transport or claiming central delivery.

## QA evidence

- Native source QA: 512/512 tests PASSED on local Node 22.16.0; includes newly added focused tests and existing native QA. An ambiguous .ts/.mjs import regression was caught, fixed with explicit .ts extensions, then rerun green.
- TypeScript/TSX syntax-parsed changed files with global TypeScript 5.8.3: 0 syntax diagnostics. This is **not** semantic `tsc` validation.
- No application-wide Vitest, semantic TypeScript, PWA build, Playwright, PostgreSQL execution, migration/RLS test, or real Watchdog importer test. Pinned Node 24.19.0 and pnpm 10.34.0 were not installed; Corepack pnpm download failed due unavailable npm registry.
- See `docs/central/CENTRAL_WORKSPACE_BLOCKERS.json` for material open acceptance gates. Overall release NO-GO / INCOMPLETE.
