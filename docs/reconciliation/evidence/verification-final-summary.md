# Final automated verification, 2026-10-25

Commands ran from the unified repository root on Windows with Node.js 24.19.0 and pnpm 10.34.0. Passing results below were observed as completed process exits in the command tool output. The full passing Vitest stdout was not saved to a separate file; earlier failing full-run logs are retained alongside this summary.

| Gate | Exact invocation | Observed result |
|---|---|---|
| Client unit/integration | `.\node_modules\.bin\vitest.CMD run --maxWorkers=1 --testTimeout=60000 --hookTimeout=60000 --reporter=dot` | exit 0; 124/124 files; 995/995 tests; 666.26 s |
| TypeScript | `npm run check` | exit 0 |
| Production build | `npm run build` | exit 0; Vite 2057 modules, PWA precache 51 entries, server bundle `dist/index.js` 108.8 kB |
| Browser release | `.\node_modules\.bin\playwright.CMD test --config playwright.config.mjs` | exit 0; 3/3 passed |
| Browser offline | `.\node_modules\.bin\playwright.CMD test --config playwright.offline.config.mjs` | exit 0; 3/3 passed |
| Production dependency audit | `pnpm audit --prod --json` | exit 0; 0 advisories; raw JSON `pnpm-audit-final.json` |
| Native Node, Windows | `node --test $files` with `$files` from `qa,server/tests` `*.test.mjs` | 809 tests: 746 pass, 62 fail, 1 skip; raw output `native-node-windows-final.txt` |

The first full client run after the merge reported 984 passes and 11 failures (`vitest-full-after-merge.txt`); two fixture gaps were repaired. A dual-reporter run under host contention timed out in seven cases and wrote an incomplete diagnostic XML (`vitest-full-contended.xml`). A later direct serialized full run completed green. Longer harness timeouts altered scheduling only, not production assertions or authorization rules. The strict language performance and staff suites passed on a separate 19/19 rerun as well.

The native failures include historical static source assertions that expect pre-v35 schema or global cloud authentication, and POSIX absolute-path and permission checks exercised on Windows. They also include backup and FX contract assertions requiring individual triage; no native failure is counted as resolved by the client result. Security checks remain fail closed. Formal physical-device, cross-browser, real customer migration and operational acceptance remain open; production decision is NO-GO.
