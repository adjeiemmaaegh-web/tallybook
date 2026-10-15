# Run 2 / B — Identity and offline company ownership

Status: implementation increment, NOT a completed account migration.

## Existing identity paths
The current default `GoogleSignInPage.tsx` uses Supabase OAuth/session APIs, while `SupabaseSignInPage.tsx` is also available behind `VITE_TALLYBOOK_SUPABASE_AUTH_PREVIEW`. Neither route protects operational data. Neither identity page supplies ownership of a locally saved company. No account-binding migration has been authorized or enabled.

## Identity model to implement before activation
1. **Local-only mode:** preserve offline operations and staff PIN/role workflows on the current device. Do not claim the local browser database is encrypted or that sign-out prevents a device holder from reading IndexedDB.
2. **Cloud-managed mode:** use server-validated Supabase account identity and server-controlled company membership. Require membership for every company operation and enforce tenant isolation in backend RLS. Session absence, expiration, revocation or failed membership validation must deny protected cloud actions.
3. **Legacy company linking:** first create a backup and independently verify the local dataset. Present the precise local company name and company ID, require explicit confirmation by the authorized owner, and issue a non-mutating review. The newly added `prepareOfflineBindingReview` enforces this preview's input invariants but DOES NOT prove ownership or grant access. A trusted server must securely provision and verify membership before saving a binding. Never silently infer ownership from a company selector or browser account email.
4. **Offline cloud session:** do not assume a previously cached token proves current membership after revocation. Keep the existing local-only mode isolated until a reviewed offline access policy, device-bound credential rules, encryption/backup policy and recovery procedure are tested. Deny cloud operations when offline membership cannot be confirmed.
5. **Recovery:** require owner-reviewed, audited recovery via trusted membership administration. Existing offline data and export capability must be preserved, and account changes must never silently move or delete company records.

## Activation prerequisites and acceptance gaps
- Trusted membership backend and two-account/two-company RLS negative tests (Run 3).
- Routed and service-level AuthGate and revocation/in-flight operation tests (Runs 4-5).
- Explicit legacy migration with recoverable mapping, encrypted backup evaluation, real browser/Dexie test and owner acceptance (Run 2 remains PARTIAL until these pass).
- CI types/client/browser/offline tests must pass on the **exact final Run 2 commit**.

No production OAuth switch, schema migration, cloud write, deployment, payment or destructive data operation was performed.

## Run 2 continuation — transaction-bound recovery evidence (2026-10-15)

A separate review-only increment implements transaction-bound, one-use recovery evidence consumption under a private PostgreSQL adapter. The issuer now requires current Supabase `auth.sessions` status and an active independent reviewer inside the same SERIALIZABLE transaction as ownership approval, conditional evidence consumption, and reviewer audit. The proposed additive SQL defaults new evidence to `pending`; merely inserting SHA-256-shaped receipt strings does **not** constitute a verified backup/restore drill. See `docs/release/RUN2_TRANSACTIONAL_RECOVERY_EVIDENCE_REVIEW_2026-10-15.md`.

Focused Node 22.16.0 regression tests: **20/20 pass** on isolated SQL/memory doubles. This is *not* the full V19 CI suite or real Supabase/PostgreSQL integration. The privileged reviewer/evidence promotion mechanism, genuine independently verified restore evidence, opt-in API, explicit local account binding, exact-head full test matrix and two-account/tenant acceptance remain missing. **Run 2 OPEN / NOT PASSED; Stage 9 Round 1 PARTIAL; NO-GO.** No changes to production or release registers.


## Run 2 continuation — revoked-session race in company ownership mutations (2026-10-15)

`server/trustedCompanyOwnership.mjs` now denies missing Supabase session identifiers and re-checks the user's **live auth.sessions entry inside the serializable database transaction** before any binding or transfer business-record read. The private adapter reuses the existing parameterized `auth.sessions FOR SHARE` proof from the recovery-approval module. This narrows the window where a revoked token could authorize privileged local-company binding or owner transfer after a successful outer authentication check.

**Six native regression cases added** in service, adapter and coordinator test files for revoked-session binding/transfer, valid subject/session, row locking, absent/duplicate session and revocation between preflight and commit. **Not yet run under Node** for the new files. Eight isolated V8 behavior checks of exact committed JavaScript source passed; five changed JavaScript/test files independently syntax-parsed. Neither is a full CI PASS. See `docs/release/RUN2_TRANSACTIONAL_RECOVERY_EVIDENCE_REVIEW_2026-10-15.md`.

No production Supabase data/schema, HTTP route, payment service, live business binding or cloud activation touched. **V19 Run 2 remains OPEN / NOT PASSED.**
