# Mission GO Increment 01 — branch-divergence integration queue

**Baseline (2026-10-28):** development at `5676c3c` before new audit-test commit; `main` at `ba3481eb`. Comparison before audit-test commit: **main-only 9 commits, development-only 7 commits**. Both branches remain unmerged. Audit-test commit `9e9c251` advances development without changing app behavior.

## Comparison grounded in fetched source

- `client/src/auth/AuthGate.tsx` — identical on both inspected branches. Keep offline-ledger access independent of cloud authentication and enforce cloud-only session verification.
- `client/src/cloud/CloudBusinessPanel.tsx` — identical on both inspected branches. No reason to replace an existing writer or duplicate account creation.
- `client/src/App.tsx` — main adds `FriendsTestGate` wrapping the workspace when a test-mode switch is enabled; development has no such wrapper. Main also arranges an equivalent `AuthGate` workspace as a variable. **Do not cherry-pick test-mode logic until its access boundary and build flags are reviewed.**
- Main-only account/recovery paths, tests and `qa/run3-owner-attendant-live-acceptance.mjs` must be reviewed individually for imports, protective flags, token handling and an isolated backend, not assumed deployed or verified in development.
- Existing dedicated test backend is not established by the presence of a test runner. Never target static SPA routes or production Supabase with mutation-driven tests.

## Main-only changed-path queue (source compare)

1. `.env.example`
2. `client/src/App.tsx`
3. `client/src/auth/AuthGate.test.tsx`
4. `client/src/auth/FriendsTestGate.test.ts`
5. `client/src/auth/FriendsTestGate.tsx`
6. `client/src/cloud/CloudBusinessPanel.test.tsx`
7. `client/src/cloud/cloudMembershipBoundary.test.mjs`
8. `client/src/pages/CloudAccountRecovery.test.tsx`
9. `client/src/pages/GoogleSignInPage.test.tsx`
10. `client/src/pages/GoogleSignInPage.tsx`
11. `client/src/pages/PasswordRecoveryPage.tsx`
12. `client/src/pages/StageHome.tsx`
13. `docs/central/2026-10-27_V47_MAIN_ACCOUNT_MEMBERSHIP_MILESTONE.md`
14. `docs/central/2026-10-27_V48_RUN3_REAL_ACCOUNT_ACCEPTANCE.md`
15. `docs/reconciliation/FRIENDS_WEB_TEST_CHECKPOINT_2026-10-27.md`
16. `qa/run3-owner-attendant-live-acceptance.mjs`
17. `qa/run3-owner-attendant-live-acceptance.test.mjs`

The GitHub compare also reports related `cloudMembership`, `cloudMembershipBoundary` and `CloudBusinessPanel` paths; two of those were verified identical by exact source fetch, while the remaining related paths require per-blob comparison before integration. A compare path appearing in a diff does not itself mean it is absent on one branch.

## Required acceptance before integration

- [ ] Record file hashes and baseline commits for each candidate path; avoid copying unchanged files.
- [ ] Run targeted auth and cloud business component tests on the complete current development workspace.
- [ ] Ensure FriendsTestGate cannot bypass tenant/staff authorization or accidentally activate in real business mode.
- [ ] Test password recovery links without mounting or leaking local business IndexedDB records.
- [ ] Run Run3 owner / attendant acceptance only against an authorized isolated environment, with genuine confirmed users and disposable companies.
- [ ] Reconcile data migrations and client build on the combined source; do not force-merge.
- [ ] Update the 143-item traceability register with reproducible evidence.
- [ ] No `main` modification, PR, external deployment, production payment or live Supabase schema mutation.

**State:** integration review open; release **NO-GO**. These are verified comparisons and risk classifications, not claim of completed runtime verification.
