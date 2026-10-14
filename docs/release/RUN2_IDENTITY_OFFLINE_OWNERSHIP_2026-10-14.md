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
