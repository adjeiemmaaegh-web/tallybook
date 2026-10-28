# V51 account and finance integration checkpoint

Date: 2026-10-28. Release decision: **NO-GO**.

The integration commit `1f556216a7a070138b91463f040bde304c83d658` merges GitHub `main` at `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb` into `development/v19-unified-reconciliation` at `dcf834219f763e9d5dc41114f451bfa731adfbdc`. It preserves the development branch's finance fixes and account-recovery behavior while retaining main's friends-test gate, cloud-membership boundary and Run3 acceptance preflight. Four source conflicts were resolved in `App.tsx`, `CloudAccountRecovery.test.tsx`, `GoogleSignInPage.tsx` and `PasswordRecoveryPage.tsx`.

Corrections in this integration:
- The friends-test gate now lets the password recovery callback reach `AuthGate` without opening the local ledger database. Other workspace routes remain under the existing friends-test binding check.
- The account link points to the current cloud business setup and sync status page.
- The obsolete email-signup assertion matches the current control and cautious confirmation copy.
- The cash-return actor guard has a TypeScript declaration; the implementation and authorization checks were not weakened.

Verification on this Windows checkout:
- TypeScript `tsc --noEmit`: passed.
- Vite production build and PWA generation: passed (51 precache entries). This is build evidence, not deployment evidence.
- Focused React/Vitest account, recovery, gate and auth tests: 25/25 passed.
- Focused Node membership, Run3 preflight and cash-return regression tests: 29/29 passed.
- Full client Vitest was attempted. It produced no test summary after several minutes, with long gaps between output in the assistant test area; it was interrupted. Its partial raw output is in `evidence/v51-full-vitest-incomplete-2026-10-28.txt`. A subsequent isolated run of `client/src/features/assistant/batch.test.ts` passed 18/18 in 48 seconds, so the partial run does **not** establish a deadlock or a failing assistant test. No full-suite pass is claimed.

Still open: complete client/native/Linux and browser suites on the exact candidate SHA; real isolated owner/attendant account acceptance; secure signed upload and authorized pull; representative historical backup migration; Windows/Android acceptance; independent release review. The separate cloud integration candidate at `5e837e7` remains QA-only and was not merged into this checkpoint. No production Supabase schema, payment or Vercel deployment was changed.
