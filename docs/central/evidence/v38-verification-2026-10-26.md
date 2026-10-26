# v38 local verification record

The source under test is `development/v19-unified-reconciliation` before this increment's commit. Tests used local synthetic data. The connected Supabase project, live customer data and deployed site were not changed.

| Command/gate | Result |
| --- | --- |
| `tsc --noEmit` | exit 0 |
| `vite build` and Node server `esbuild`, final source | exit 0; raw Vite output in `v38-production-build-backup-final-2026-10-26.txt` |
| Focused cash refund, unified migration and backup Vitest | 25/25 passed after preserving the earlier failed 22/23 run and updating the expected tamper error |
| `node --test client/src/features/backup/tests/run8BackupCompatibility.test.mjs qa/stage12-schema-gate.test.mjs`, final source | 18/18 passed |
| First complete client Vitest | **1010 passed, 1 failed** of 1011: obsolete Stage 22 test expected literal schema 37; raw log `v38-client-vitest-2026-10-26.txt` |
| Focused Stage 22 migration rerun | 1/1 passed after checking `database.verno === DATABASE_SCHEMA_VERSION` |
| Complete client Vitest after fixing obsolete assertion | **1011/1011 passed**, 125 files; raw log `v38-client-vitest-final-2026-10-26.txt` |
| Final complete client Vitest after drawer backup fix, one worker | **1011/1011 passed**, 125 files, exit 0, 842.48 seconds; raw log `v38-client-vitest-backup-final-2026-10-26.txt` |
| Final native QA with local loopback access | **434/434 passed**, exit 0; raw log `v38-native-qa-backup-final-2026-10-26.txt` |
| Local Chromium release / auth / offline | **3/3 each**, exit 0 |

The v38 event insertion failure test checks that the cash return, stock and FIFO cost all roll back. The backup test rejects a tampered event or underlying refund, and restore returns the event with its refund. The migration test verifies old v37 cash returns remain without fabricated events. A later backup check found drawer events absent from portable files; the final source preserves and validates them without promoting local device IDs to server identity. These focused tests are part of the final 1011 client count.

Windows cannot validate the 43 existing POSIX optional-sync path-security tests; the last exact-source Windows server run was 349 passed, 43 failed and 1 skipped. This increment did not alter that server path. Linux verification, live Supabase Auth/RLS, full central event coverage, real backup fixtures and Windows/Android operational acceptance remain open.
