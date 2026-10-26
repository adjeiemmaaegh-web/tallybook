# V39 verification summary — 2026-10-26

| Gate | Result | Raw evidence |
|---|---|---|
| Focused credit, reversal, backup | 35/35 pass | `v39-focused-2026-10-26.txt` |
| Return policy backup fixtures | 13/13 pass | `v39-policy-2026-10-26.txt` |
| Supplier payable isolation after apparent stall | 7/7 pass | `v39-supplier-isolation-2026-10-26.txt` |
| Full client Vitest, final | 1013/1013 pass across 125 files | `v39-full-client-final-2026-10-26.txt` |
| Native QA, with loopback permission | 434/434 pass | `v39-native-qa-loopback-2026-10-26.txt` |
| TypeScript semantic check | pass, exit 0 | `v39-typescript-2026-10-26.txt` (empty on success) |
| Production Vite/PWA and Node server build | pass, exit 0 | `v39-production-build-2026-10-26.txt` |

The first full client run was interrupted after output stopped and has no final result (`v39-full-client-2026-10-26.txt`). A verbose bail rerun found an obsolete return-policy backup fixture whose reversal payload no longer matched the new event (`v39-bail-client-2026-10-26.txt`). The fixture was corrected to keep the event consistent while exercising the independent policy audit, and a historical fixture now omits the modern event. Final full Vitest passed after these changes. The first native QA run lacked Windows sandbox loopback access and failed with `EACCES`; the permitted rerun passed. Neither interrupted or sandbox-denied run is counted as a pass.

No live Supabase/RLS, remote sync, Linux POSIX optional-sync, real-device or cross-browser acceptance was run in this increment. Existing earlier evidence remains historical and is not reasserted here.
