# V46 isolated HTTP lifecycle checkpoint — 2026-10-27

Development branch only. **Production decision: NO-GO.** Main, the live Supabase project, deployment and payment configuration were unchanged.

## What was verified

The PGlite UUID integration fixture now exercises the actual private coordinator composition and guarded HTTP handlers in one sequence: owner-only staff/shop provision; owner invitation; attendant Ed25519 key proof and redemption; exact invitation replay denial; signed sale upload and exact retry; owner-only revocation; upload denial after revocation; and denial after the owner Auth session is deleted. It also checks wrong-company binding, unauthorized staff actions and browser RLS write denial.

The test Auth client recognizes two **simulated** JWT-shaped tokens. It does not cryptographically validate a Supabase token and does not stand in for real Auth, network TLS or Data API acceptance. The shipped handlers remain disabled.

`node --test qa/central-sale-uuid-schema.test.mjs server/tests/centralDeviceRoutes.test.mjs server/tests/centralSaleUploadRoute.test.mjs` passed **9/9** after the additional lifecycle assertions. An initial test run failed because the expected owner RLS row count was still three; the new accepted sale made it four. The assertion was corrected to match the new fixture and the rerun passed. No production code was changed in this checkpoint.

Read-only inspection of disposable Supabase project `lmneuqxfyxplrxjswpma` found **0 Auth users, 0 Auth sessions, 0 businesses, 0 device keys and 0 sale events**. No test users were inserted directly into `auth.users` and no live customer data was used.

## Exact next gate

Create two disposable accounts through Supabase Auth's supported sign-up flow in this isolated project, one owner and one attendant. Then rerun the lifecycle with real validated tokens, real Auth sessions and Data API calls. The app must also get a trusted-edge TLS/origin design for Vercel before these direct-TLS Node handlers can be enabled. Enrollment recovery, manual UI, all approved event types, historical backup migration, Windows/Android acceptance and Linux security remain open.

The last exact-source TypeScript and build passes are from V45; this checkpoint changes only the isolated QA fixture and documentation. Full client/native suites were not rerun.
