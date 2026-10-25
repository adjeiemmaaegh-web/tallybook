# Master archive comparison and organization review

- Primary archive: TALLYBOOK_V19_CONSOLIDATED_LOCAL_2026-10-24_SOURCE.zip
- Historical archive: TALLYBOOK_V19_STAGE11_COMPANY_ISOLATION_INCREMENT1.zip
- Primary entries: 989
- Stage 11 entries: 887
- Stage 11-only paths: none
- Changed shared files: 6

## Changed paths (prior versions preserved)
- `client/src/db/TallybookDB.ts`
- `client/src/features/sales/sales.ts`
- `client/src/pages/ReportsPage.tsx`
- `client/src/pages/StaffPage.tsx`
- `qa/stage1-schema-contract.test.mjs`
- `stage1-audit-candidate/tallybook-integrity/tallybook-adapter/tallybookRules.ts`

Source layout was intentionally preserved to protect import paths and build configuration. This is a structural inventory and safe consolidation, not a line-by-line functional code audit.
