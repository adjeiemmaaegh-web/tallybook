# V47 — Account and membership milestone integrated on main
Date: 2026-10-27. Release decision: **NO-GO**.

## Scope
- Account UI: preserve the recent main-branch friends-test messaging and local workspace navigation while incorporating stronger email signup acknowledgement, email login, reset request, and a separate password recovery callback page.
- Authentication boundary: exclude `/reset-password` from local IndexedDB provider initialization. Recovery sessions provide no local company/staff privileges.
- Cloud business membership: require matched RLS-scoped business and membership rows; verify server-backed Auth identity before and after reads; reject account swaps, missing/duplicate/truncated rows, improper owner elevation and cross-company inconsistencies.
- Cloud creation: do not trust its receipt as permission; confirm an owner membership through fresh, read-only RLS lookups before rendering owner privileges.
- New tests: account recovery and cloud business UI regressions plus Node membership security cases.

## Evidence
- Local Node.js 22.16.0 `node --test cloudMembershipBoundary.test.mjs` passed **15/15** against the exact source and test blob hashes in the development branch (boundary Git blob `1a02026c4deb2b8324f434164d16ed045e432180`).
- Code was integrated on top of main rather than replacing it wholesale, retaining main's newer front-end account experience and links.
- The React/Vitest UI suite, TypeScript semantic check, build, live email delivery, and physical device acceptance **have not yet been executed for this integration**. No successful CI gate is claimed.
- No live Supabase schema, customer data, RLS, keys or Auth settings altered. No financial synchronization server endpoints activated. No deployment or payment execution requested.

## Mandatory next gates
- Run `npm run check`, focused Vitest suites, complete client/native suites, and production build in a dependency-equipped clean checkout.
- Verify Supabase Auth redirect allowlist for approved `/signin` and `/reset-password` hosts; test actual emails and one owner/attendant invitation journey in isolated test accounts.
- Finish secured server-only member invitation, owner-approved staff/store binding, signed upload **and authorized pull**, lossless offline replay, and accurate user-facing status.
- Complete restored-backup comparison and Windows + Android owner-operated acceptance before production launch.

**Do not claim this milestone completes the cloud account-to-business or two-device sync journey.**
