# V40 verification — 2026-10-27

| Gate | Result | Raw log |
|---|---|---|
| Final complete client Vitest | **1017/1017**, 125 files | `v40-client-green-2026-10-27.txt` |
| Final focused purchase, supplier, shift, backup, refund tests | **53/53**, 5 files | `v40-focused-green-2026-10-27.txt` |
| Final native QA with localhost permission | **436/436** | `v40-native-qa-green-2026-10-27.txt` |
| Isolated signed-sale ingest and trust verifier | **6/6** | `v40-isolated-ingest-2026-10-27.txt` |
| Existing server identity/device security tests | **35/35** | `v40-identity-security-2026-10-27.txt` |
| TypeScript semantic check | pass, exit 0 | `v40-typescript-final-2026-10-27.txt` (empty on success) |
| Production Vite/PWA and Node server build | pass, exit 0 | `v40-production-build-final-2026-10-27.txt` |

Earlier attempts are preserved. The first native QA run found an ambiguous `.ts`/`.mjs` type import; an explicit `.ts` import fixed it. The first broad client run found an obsolete cash-refund event count that included a new shift-opening event. A later focused run found purchase-line order differed between Dexie reads and the event payload; backup validation now compares by stable line ID. A backup test fixture initially lacked a business profile and was corrected. These are recorded in the `v40-client-bail-*`, `v40-client-final-*`, `v40-focused-*` and `v40-native-qa-*` logs; only the final runs above are claimed as passing.

The connected Supabase project `qfyydfxwvifdvffdfgeu` returned `INACTIVE`. A read-only `list_tables` call returned “Database is possibly not accessible at the moment.” No live database query, migration, RLS test, deployment or upload succeeded or was attempted after that failure. The PGlite tests are isolated synthetic checks, not live Supabase acceptance. No Linux/POSIX optional-sync suite, Windows/Android physical acceptance or new browser automation was run in this increment.
