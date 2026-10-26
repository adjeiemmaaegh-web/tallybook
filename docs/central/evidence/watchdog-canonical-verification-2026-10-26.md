# Watchdog canonical POS increment — local verification

Source: `development/v19-unified-reconciliation`, working tree before this increment's commit. All tests used synthetic data. No cloud, Watchdog customer database or deployment was changed.

| Gate | Exact result |
| --- | --- |
| `node --test qa/watchdog-canonical-export.test.mjs` | 3 passed, 0 failed; includes refund/void semantics, scope and CSV safety |
| Real Watchdog canonical parser and provisional mapper | 3/3 synthetic POS rows accepted by both; see `watchdog-real-importer-probe-2026-10-26.json` |
| Real Watchdog `MultiStoreConsole` with disposable SQLite | 3 inserted, 0 inserted on replay; wrong store, viewer, malformed amount, changed replay and revoked manager denied; see `watchdog-canonical-roundtrip-2026-10-26.json` |
| TypeScript `node_modules/.bin/tsc.cmd --noEmit` | exit 0 |
| Production Vite/PWA and Node server esbuild | exit 0; Vite transformed 2060 modules and built in 24.66 seconds; esbuild completed |
| Client Vitest from `client/`, one worker, 60-second test/hook timeouts | 125 files passed, **1008 tests passed**, exit 0, duration 874.17 seconds |
| Native QA, final run with local loopback access | **434 passed, 0 failed**, exit 0; raw log `watchdog-canonical-native-qa-final-2026-10-26.txt` |
| Chromium release / auth / offline | **3/3 each**, exit 0 |

The first full client command launched from the repository root produced only the Vitest header and did not progress; it was interrupted, not counted as passed. The rerun from `client/` completed. The first native QA command had 429 passes and four local preview HTTP failures because the sandbox denied `127.0.0.1`; raw log `watchdog-canonical-native-qa-2026-10-26.txt`. The final native run used permitted local loopback access and passed. The native suite was run again after the refund/void regression was added, so its 434 count applies to the final source.

These results do not close live Supabase Auth/RLS/sync, Linux-only optional-sync security, historical customer migration, full Watchdog event coverage, or physical Windows/Android acceptance. The connected Tallybook Supabase project `qfyydfxwvifdvffdfgeu` was queried read-only during this increment and reported `INACTIVE`.
