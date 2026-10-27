# V45 enrollment transport checkpoint — 2026-10-27

Development branch only. **Production decision: NO-GO.** No live Supabase project change, deployment, payment activation or pull request.

## Implemented

- The shipped server registers four central device administration routes in a **disabled** state: staff/shop provision, owner invitation, attendant key redemption and owner key revocation. Enabling requires both private services, an exact HTTPS origin and an explicit server flag. The handler requires direct TLS, exact browser origin, JSON, bearer authorization, no cookies and rate limiting. Each action accepts only its exact body fields. The underlying private services make all owner, membership, staff, shop, session and key decisions inside serializable database transactions.
- The browser transport prepares those four requests with no cookies and no redirect following. Key redemption signs the one-use invitation with the pending non-extractable key and activates it only after an exact server receipt. The private token is not persisted in business data.
- No user-facing enrollment flow or automatic sync was enabled. The existing sale upload route remains disabled. This commit supplies the transport seam and its tests, not real two-account acceptance.

## Verification

- `node --test server/tests/centralDeviceRoutes.test.mjs server/tests/centralSaleUploadRoute.test.mjs qa/central-sale-uuid-schema.test.mjs`: **9/9 passed**.
- Focused client vault and central device transport: **3/3 passed**. `TEMP` and `TMP` were set to a writable workspace directory because the sandbox default Temp had previously failed during Vitest cache rename.
- `npx tsc --noEmit`: passed after adding the server module declaration.
- `npm run build`: passed with existing Vite chunk/dynamic-import warnings.
- The full client/native suites were last run at V43. They were **not rerun** at V45; no updated full-suite pass is claimed.

## Next gates

1. Provision two real, disposable Auth users through supported sign-up, then execute the full owner and attendant sequence against an isolated private server and the disposable Supabase project. Verify wrong-company, wrong-user, revoked-session, revoked-key and replay denials through actual HTTPS and Data API paths.
2. Resolve an ambiguous redemption response: if the server consumes the invitation but the browser loses the receipt, keep the local key pending and require owner-reviewed recovery or a fresh invitation. Do not infer success or silently generate a replacement key.
3. Wire an explicit UI after the real Auth transport passes; keep sale upload opt-in. Complete signed ingestion for approved operation kinds and the historical backup, Windows/Android, Watchdog and Linux gates in the governing register.

The current route's `socket.encrypted` requirement is not a proven fit for Vercel's TLS termination. A production hosting design must validate TLS and origin at the trusted edge without accepting arbitrary forwarded headers before these routes can be enabled there. No such deployment design is claimed here.

See `docs/reconciliation/OUTSTANDING_READINESS_BLOCKERS.md` and the V44 checkpoint for the broader release blockers.
