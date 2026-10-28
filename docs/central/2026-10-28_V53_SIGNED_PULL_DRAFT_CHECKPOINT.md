# V53 isolated signed sale-pull draft

Date: 2026-10-28. Source commit: `231db65`. **NO-GO**; isolated QA draft only.

## Implemented in source

- Browser sale-claim reads now request a short-lived challenge and sign the exact company, device, account and cursor with a non-extractable Ed25519 device key. The read remains a claim labelled `upload_claim_only`; it does not import or post a local sale.
- The QA Edge source validates the signature against the owner-approved SPKI public key. A well-formed but invalid signature consumes its challenge. The existing sale RPC rechecks live session, membership, staff, shop and grant after proof validation.
- The QA-only SQL draft creates a server-only RLS challenge table and service-role-only issue/consume RPCs. Challenges expire after 60 seconds, are bound to one Auth session, company and device, cap outstanding requests and cannot be replayed.
- **The Edge routes remain disabled** unless `RUN3_QA_SIGNED_PULL_ENABLED=true`. The deployed QA function was not updated and the V53 SQL was **not applied**. Production was not changed.

## Verification

- Browser/Edge cryptographic parity, cursor tampering and invalid-key tests plus PGlite one-use/session/revocation/RLS tests: **15/15 passed**. Raw log: `evidence/v53-signed-pull-focused.txt`.
- TypeScript semantic check: passed. Edge source bundled for syntax/import verification: passed. Vite production build and PWA generation: passed. Logs: `evidence/v53-typecheck.txt`, `evidence/v53-edge-bundle.txt`, `evidence/v53-build.txt`.
- The V53 SQL was compiled in the isolated Supabase project inside a single transaction ending in `ROLLBACK`. A follow-up read confirmed `public.company_sale_pull_challenges` remained absent. This is a syntax/prerequisite check, **not** live authorization acceptance.

## Next gates

1. Obtain the two demo inboxes and a sanitized historical backup offered by the user. Provision real Auth users through supported signup, then exercise owner invitation, attendant acceptance, local staff/store binding and device enrollment in the isolated project.
2. Review and apply the V53 QA schema and deploy the gated Edge revision **only** after the real-account test setup is ready. Test wrong account, foreign company, revoked device/session/grant, expired challenge, replay, concurrent reads and exact cursor paging. Keep the production project unchanged.
3. Complete signed financial upload and a durable, lossless second-device import/reconciliation protocol. The V53 read-only claim path does not complete synchronization.
4. Repeat full exact-head client/native/browser/security verification, historical backup restore, Linux server tests when Actions is available, and Windows/Android acceptance before any production decision.

The existing 82-unit engineering register remains unaccepted where these gates are open.
