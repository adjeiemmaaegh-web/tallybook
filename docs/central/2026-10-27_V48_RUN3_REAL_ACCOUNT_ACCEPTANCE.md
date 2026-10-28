# V48 — Live owner/attendant acceptance runner
Date: 2026-10-27. Status: **NO-GO**, development/test tooling only.

## Added
- `qa/run3-owner-attendant-live-acceptance.mjs` uses **genuine** Supabase Auth tokens and a dedicated HTTPS Run3 API to test owner invitation, recipient redemption, wrong-account and foreign-tenant denial, one-time replay, RLS isolation, and owner revocation.
- `qa/run3-owner-attendant-live-acceptance.test.mjs` proves fail-closed disposable-project/authorization controls. Locally executed on Node 22.16.0: **7/7 passed**. GitHub blob SHA matches tested local file after excluding a trailing newline.
- The runner refuses known production origins, current production Vercel aliases, static HTML responses, missing or repeated account tokens, reused company IDs, and unapproved writes. No financial data is sent.
- Best-effort cleanup is attempted after partial failure but is not proof that an interrupted test left a clean state.

## Connected isolated database inspection
On Supabase `Tallybook V19 Sync Test` (`lmneuqxfyxplrxjswpma`): **17 RLS-protected public tables, zero direct browser-role table-write grants, legacy add/remove attendant RPCs disabled**. At this checkpoint **zero Auth users, businesses, memberships, invitations and membership-audit records**. No actual owner–attendant online journey has passed.

## Running with REAL, inbox-controlled test accounts
Create and confirm three independent users through supported Supabase Auth signup (owner A, owner B, attendant A). Each owner creates a distinct business with `create_owned_business`. The attendant must begin without membership. Do not insert synthetic `auth.users` rows.

Only in a local environment or protected secret store configure:
```text
RUN3_QA_DISPOSABLE_PROJECT_APPROVED=I_APPROVE_RUN3_DISPOSABLE_PROJECT
RUN3_QA_RUN_MUTATIONS=I_APPROVE_RUN3_MEMBERSHIP_WRITES
RUN3_QA_URL=https://lmneuqxfyxplrxjswpma.supabase.co
RUN3_QA_PUBLISHABLE_KEY=<isolated publishable key>
RUN3_QA_COMPANY_A=<owner A company UUID>
RUN3_QA_COMPANY_B=<owner B company UUID>
RUN3_QA_OWNER_A_TOKEN=<owner A real short-lived access token>
RUN3_QA_OWNER_B_TOKEN=<owner B real short-lived access token>
RUN3_QA_ATTENDANT_A_TOKEN=<attendant A real short-lived access token>
RUN3_QA_MEMBERSHIP_API=https://<dedicated-HTTPS-test-backend>/api/run3/membership
```
Then run `node --test qa/run3-owner-attendant-live-acceptance.test.mjs` and `node qa/run3-owner-attendant-live-acceptance.mjs`. Do not commit, paste, echo or log credentials or invitation tokens.

**Backend blocker:** Existing Vercel Tallybook is a static SPA with catch-all rewrites, not a private Run3 HTTP API. The existing Node Run3 runtime stays disabled until a reviewed dedicated test deployment with proper Auth and private PostgreSQL connectivity exists. The runner must not be pointed at production, nor run until actual accounts and the test backend exist.

## Remaining release requirements
Real confirmed signup, login/logout/recovery, owner/attendant-to-local staff/store provisioning, secure signed financial upload, second-device authorized pull, retry/dedup/revocation, historical backup restore, full test suites, and Windows/Android acceptance. **No production SQL, customer data, payment or Vercel deployment changes made.**
