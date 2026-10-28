# V52 integration and verification checkpoint

Date: 2026-10-28. Release decision: **NO-GO**. No production deployment, payment enablement, or customer-data write.

## Source and verification

- `bdc33d2`: complete client Vitest run, **1045/1045 passed across 134 files**. The first interrupted run in V51 was slow, not a demonstrated deadlock. Raw log: `evidence/v52-full-client-vitest-bdc33d2.txt`.
- `1a39184`: merged the separate V49/V50 isolated QA cloud branch without conflicts. Its sale pull remains disabled at the Edge route until signed device possession and one-use replay proof exist. Focused Node tests **23/23 passed**, TypeScript semantic check and Vite/PWA build passed.
- `1a39184`: full native `qa/*.test.mjs` run with local fixture/socket access **470/470 passed**. The first sandboxed run was 462 pass/8 sandbox permission failures; the same eight passed under the necessary local permissions. Raw logs: `evidence/v52-native-qa-1a39184.txt` and `evidence/v52-native-qa-sandboxed-first-attempt.txt`.
- `1a39184`: Chromium release **3/3**, auth **4/4**, offline **3/3**, and the new friends-test password-recovery route **1/1** passed. The first recovery browser attempt timed out under concurrent full-suite load; it passed when rerun alone. Raw logs are in `evidence/v52-browser-*-1a39184.txt`.
- `6b2f619`: corrected the production `express>qs` resolution from vulnerable 6.16.0 to patched 6.16.1 and committed the lockfile. `pnpm audit --prod` then found **no known vulnerabilities**. The complete audit still reports **one low-severity development-only `deepmerge` advisory** through `vite-plugin-pwa > workbox-build > @rollup/plugin-node-resolve`; the advisory lists no patched version. Raw logs: `evidence/v52-audit-production.txt` and `evidence/v52-audit-all.txt`.

The full client suite was run before the QA-only merge and dependency pin, so it is **not** an exact-head full-suite result for `6b2f619`. No Linux server-suite pass is claimed.

## Connected Supabase inspection (read-only)

- Isolated project `lmneuqxfyxplrxjswpma` is active. Its QA Edge function `tallybook-run3-qa` is active at version 4; the V49 membership and V50 pull RPCs exist. There are **zero Auth users**, so no real owner/attendant journey has passed. The pull endpoint currently returns unavailable by design.
- Production project `qfyydfxwvifdvffdfgeu` is active, with seven public RLS-enabled tables versus 17 in QA. No QA schema was copied to production. The production security advisor reports leaked-password protection disabled; four server-only RLS tables have no browser policies by design and must be reviewed before any rollout.
- GitHub reported no workflow runs for the new development head. WSL is not installed on this host, so the POSIX server-security gate still needs a working Linux runner.

## Remaining release gates

1. Complete secure cloud enrollment, signed upload, signed and replay-safe authorized pull, revocation, and real two-account owner/attendant acceptance. Do not convert cloud membership into local staff authority without an owner-approved binding.
2. Run a sanitized real backup through the historical Dexie migration and restore comparison, checking company IDs, money, stock, costing and tax. The user has offered to provide a backup.
3. Obtain a completed Linux server-security run on the exact release SHA; repair any reproducible failures. GitHub Actions presently provides no result.
4. Run final exact-head full client/native/browser/dependency checks after all changes, then Windows and Android owner-operated acceptance. Record the results against the 82 governing acceptance units.
5. Review production Supabase Auth/RLS configuration and perform a separate, approved rollout only after the isolated flow passes. Production is not ready merely because the QA function exists.

The development branch remains a review candidate. Do not merge or deploy it as a production release yet.
