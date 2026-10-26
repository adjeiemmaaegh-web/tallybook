# Staff governance v36 checkpoint

Date: 2026-10-26. Baseline: `430d508` on `development/v19-unified-reconciliation`.

## Change

- Dexie v36 marks each company that already has staff as `staffGovernanceEnabled`. It changes only business-profile metadata; existing financial transactions and staff credentials are not rewritten.
- First-owner creation commits the marker with the staff row and audit. Company-details edits retain it.
- If a protected company's staff rows are missing, local permission checks, the application shell, and first-owner enrollment fail closed. The Staff page explains that a verified backup is needed.
- Portable backups reject a protected profile without staff. Restore cannot replace an existing protected company with a legacy staff-free backup. Older backups that contain staff gain the marker on restore.

## Evidence

- Focused migration, backup, and staff suite: 26/26 passed across four files before an additional narrow-transaction regression was added. That regression then passed with the staff suite, 12/12.
- Both historical v30 fixture lineages now include enrolled staff and verify that the v36 marker is added while original drawer or replica rows remain unchanged. The two migration test files passed 9/9 after this extension.
- The native schema-order gate passed 3/3 (`evidence/staff-governance-v36-schema-gate.txt`).
- TypeScript semantic check and production build passed; see `evidence/staff-governance-v36-typescript.txt` and `evidence/staff-governance-v36-build.txt`.
- Auth browser 3/3, release browser 3/3, offline browser 3/3 passed; see the corresponding `evidence/staff-governance-v36-*-browser.txt` logs.
- The first complete client run started before the assistant test fixture was corrected: 1005 passed, 1 failed across 125 files. Its raw result is `evidence/staff-governance-v36-full-client-initial-failure.txt`. The fixture had copied the enrolled company's governance marker into a supposedly new second company. The corrected assistant test file passed 17/17; the complete rerun passed **1006/1006** across 125 files (`evidence/staff-governance-v36-full-client.txt`).

## Limits

This prevents accidental reopening after staff records disappear. It does not make a browser's local database tamper-proof or replace cloud account identity. Legacy companies that have never enrolled staff still use the preexisting open local mode until an owner is created. Live Google identity, company/staff binding, and RLS remain unverified while the connected Tallybook Supabase project is inactive. Historical customer backup migration and device acceptance remain open; this is a development checkpoint, not a production release.
