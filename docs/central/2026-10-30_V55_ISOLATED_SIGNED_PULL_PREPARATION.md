# V55 isolated signed-pull preparation

Date: 2026-10-30. **QA-only; NO-GO for production or main merge.** Project `lmneuqxfyxplrxjswpma` is the disposable Tallybook V19 Sync Test project. Production project `qfyydfxwvifdvffdfgeu` was not changed.

## Applied to isolated QA

1. Migration `20261030052524_qa_v53_signed_pull_challenge_20261030` installed the one-use challenge table and issue/consume RPCs from `docs/security/v53_isolated_signed_pull_challenge.sql`.
2. Migration `20261030052540_qa_v54_sale_pull_ascii_cursor_20261030` replaced the existing read RPC with the bytewise cursor implementation from `docs/security/v54_isolated_sale_pull_ascii_cursor.sql`. No sale rows were rewritten; there were zero sale claims.
3. Edge Function `tallybook-run3-qa` version **6** was deployed with `verify_jwt=true`. Its `pullChallenge` and `pullSales` routes remain disabled by `QA_SIGNED_PULL_SOURCE_RELEASED=false` in the deployed source, independent of the project-secret flag. The existing membership routes remain in the same function.

## Live verification

- QA project active, zero `auth.users`, zero `company_signed_sale_events`, zero challenge rows.
- `company_sale_pull_challenges` exists with RLS enabled. `anon` and `authenticated` have no `SELECT` privilege and no `EXECUTE` privilege on the challenge issuer. `service_role` does have issuer execution. The sale-pull RPC is executable by `service_role` only; its deployed definition includes `COLLATE "C"`.
- The deployed Edge source was read back and includes the source-level disabled gate; `verify_jwt` is true. An unauthenticated POST to `/pullSales` returned HTTP **401** (`UNAUTHORIZED_NO_AUTH_HEADER`). This confirms gateway denial, not the positive device-proof flow.
- Security advisor now reports 14 `rls_enabled_no_policy` informational findings, one more than before because the new challenge table is intentionally server-only with all browser grants revoked. [Supabase lint reference](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). No broad browser policy was added to silence the finding.
- The combined current-source cryptographic/PGlite/browser-boundary focused run passed **14/14** (`evidence/v55-signed-pull-focused.txt`). TypeScript and the Edge bundle passed for this deployment source. These tests do not substitute for live Auth and device acceptance.

## Exact next sequence

1. Use two independent demo inboxes controlled by the owner to create real Auth users through supported signup. Do not synthesize `auth.users` rows or share passwords/codes in chat.
2. Complete owner company binding, attendant invitation and acceptance, local staff/store mapping, owner-approved device key enrollment and active grant in QA. Exercise foreign-company, wrong-role, revoked-session/device/grant and replay denials.
3. After those checks are prepared, review and release the source-level gate in a new QA Edge revision; set the isolated flag deliberately; test positive and negative signed pull, paging and concurrency with actual accounts. Keep production separate.
4. Complete durable, lossless second-device financial reconciliation. Current pulled rows remain `upload_claim_only` and are never posted automatically to a local ledger.
5. Restore the promised sanitized historical backup and run Windows/Android acceptance. Obtain a completed Linux server-security run once GitHub Actions can start a job. Then decide on `main` and a separate stakeholder deployment.

Current state is an isolated test environment prepared for real-account testing, **not** operational cloud sync.
