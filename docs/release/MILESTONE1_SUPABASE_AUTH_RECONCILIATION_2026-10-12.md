# Tallybook V19 | Cloud Milestone 1 — protected authentication reconciliation

Date: 2026-10-12. Scope: source-only, local preview. Release decision: **NO-GO / INCOMPLETE**.

## Repositories and provenance

- Private GitHub project: `adjeiemmaaegh-web/tallybook`, protected branch `main` at commit `a2454494351a0533409be27fcccb864ec0d6cc3b` (2026-09-15). No writes to `main` authorized or performed.
- Separate review branch: `v19-windows-preview-2026-10-12`, created from protected `main`. It remains an older tree until the reconciled V19 snapshot is uploaded and compared.
- Verified latest local source input: `TALLYBOOK_V19_WINDOWS_IMPORT_FIX_2026-10-12_SOURCE.zip`, SHA-256 `b90943af16e39bf1befbe65c1e7edf6d571b4e464e1797c7c86f20e2ef62ae58` (1,043 entries). Windows owner successfully built prior repaired frontend using Node 24.19.0; this particular reconciliation has not been built on Windows.
- Original V19 local Google sign-in screen is preserved byte-for-byte (SHA-256 `c0245b3b864484e2547d93ce47b0f519e2ca6074e203482887df46c02bfa2acd`).

## Source comparison

| Concern | Old private `main` | Latest local V19 before this change | Milestone-1 resolution |
|---|---|---|---|
| Supabase client | `client/src/lib/supabase.ts` creates one client with `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` set true | Same singleton/config checker but implicit SDK auth defaults | Restore **explicit** old session options, retaining current V19 package and SDK versions |
| `/signin` screen | Google OAuth through Supabase, `Session` handling, auth listener/unsubscribe and sign-out | Google Identity Services token **decoded locally** and claims stored in `localStorage`; NOT a server-verified Supabase session | Preserve legacy local-only preview screen unchanged; add an *opt-in*, source-reviewed Supabase auth screen copied/adapted from prior project |
| Default routing | `GoogleSignInPage` Supabase session page | `GoogleSignInPage` local identity page; app routes are not gated | Keep V19 routes unchanged except selecting optional Supabase screen **only if** `VITE_TALLYBOOK_SUPABASE_AUTH_PREVIEW=true`; default `false` |
| Existing offline data | Dexie local first | Dexie version 28 and outbox foundations | No Dexie schema, existing records, stock/money paths, service workers, or sync endpoints changed |
| Cloud permissions | Neither source proves full authenticated multi-company Supabase RLS or complete sync | Local staff scopes and mock sync foundations, no live cloud production verification | Explicitly defer authentication gate, business identity, cloud migrations, RLS, and production authorization to later milestones |

## Changed files in the reconciled source ZIP

- `client/src/lib/supabase.ts`: explicit existing GitHub authentication options restored.
- `client/src/pages/SupabaseSignInPage.tsx`: added optional Supabase Google OAuth test screen with preserved session lifecycle, listener cleanup and sign-out; not a local business permission gate.
- `client/src/lib/supabaseAuthPreview.ts`: strict opt-in compile-time flag; no cloud requests in default route.
- `client/src/App.tsx`: default route still uses original local GoogleSignInPage; opt-in branch only selects test Supabase screen.
- `.env.example`: flag explicitly set `false`, no credentials added.
- `vercel.json`: disables Vercel Git deployments for the candidate. This is not a guarantee against unrelated external automation.
- `qa/milestone1-supabase-preservation.test.mjs`: six static/native regression checks for preservation, gating, options and no cloud writes.
- This review note and evidence logs.

## Security and release boundaries

1. The default app **does not enable Supabase sign-in** or upload/download business data. It keeps the prior local-only sign-in screen for continuity, but a decoded identity is **not an authenticated cloud session** and must never grant tenant rights.
2. Changing the feature flag to `true` may initiate external OAuth requests if the tester also configures Supabase URL/publishable key. **No activation is authorized in this milestone.** Only a separate approved test project may eventually be used.
3. Never use or commit a `service_role` key; do not print secrets, run SQL migrations, configure OAuth callbacks, deploy, or add payment credentials.
4. `main` stays intact. On the review branch, upload and verify the complete source snapshot *before* treating code review/CI as representative of V19. Do not delete GitHub history, force push `main`, or merge until the owner has reviewed evidence.
5. This change does **not** implement the study guide's mandatory AuthGate (stage 1), company identity (stage 2), RLS (stage 4), or live sync (stages 7–10). It is compatibility preservation only.

## Testing this actual increment

- Full native Linux Node 22.16 suite: 470/470 passed, no failures or skips (previous source: 464/464). Logs: `artifacts/milestone1-auth-2026-10-12/native-tests.log`.
- Separate simulated payment gateway: 4/4 passed. Log: `artifacts/milestone1-auth-2026-10-12/payment-tests.log`.
- Four TS/TSX changed/added files parse successfully with local global TypeScript.
- Existing local Google sign-in file hash unchanged.
- **NOT RUN**: pinned Windows Node 24 build of this new snapshot, semantic full-project `pnpm check`, client Vitest, actual Supabase OAuth, two-user RLS, real IndexedDB/browser tests. This environment has no project `node_modules` and cannot fetch registry packages.
- Full issue register (`docs/release/blockers.json`) and acceptance set (`docs/release/traceability.json`) are unchanged; 47 tracked blockers, 82 units; release stays NO-GO.

## Next steps

1. Upload the reconciled V19 working tree ONLY to `v19-windows-preview-2026-10-12`, after reviewing the diff. Preserve `main`, authenticated GitHub ownership, and earlier auth provenance in this document; do not use the older upload package that lacks this reconciliation.
2. Review GitHub branch compare, run CI install/type/test/build/browser and fix regressions.
3. When explicitly approved, prepare separate Supabase *test* project and test-mode OAuth; add offline-aware AuthGate only after an explicit trust/permission design and its browser tests.
4. Record all unverified requirements and maintain NO-GO until release gates pass.
