# Tallybook V19 — Cloud account continuation (development only)
Date: 2026-10-27. Branch: `development/v19-unified-reconciliation`.

## Code added
- Reinstated email signup and password login on the optional cloud account page without ever granting local company or staff authority.
- Added generic anti-enumeration reset request using the dedicated `/reset-password` callback.
- Added recovery UI that checks a verified Supabase Auth user or validates a one-use OTP, updates a strong password, clears the form, then requests sign-out. Invalid links fail closed. The callback route is excluded from local ledger initialization.
- Added six targeted Vitest scenarios for signup, reset request, invalid link, expired session, OTP URL removal and password change/sign-out.

## Boundaries
- **NOT DEPLOYED:** Nothing was pushed to Vercel, no production Auth settings were changed, and no database tables or live memberships were inserted.
- Recovery email redirect `https://<approved-host>/reset-password?recovery=1` must be explicitly allowlisted in Supabase Auth settings and the live email delivery/confirmation must be tested. Do not interpret mocked tests as a real email pass.
- Local staff PIN, company authorization, and offline records are unaffected by cloud sign-in.
- No cloud business/attendant permissions, live sync ingestion, device pull, idempotent financial reconciliation, or physical Windows/Android acceptance is claimed.
- The central routes remain disabled. The separate test project `lmneuqxfyxplrxjswpma` has a 15-table isolated protected schema but no genuine Auth test users, companies or memberships at the last read-only inspection.
- This edit was authored from connected GitHub files. **Full TypeScript, browser and Vitest execution still required in the project's dependency-equipped environment**. Production remains NO-GO.

## Required next acceptance
1. In an isolated test-host configuration with allowed Auth redirects, create two consenting, inbox-controlled users; complete email confirmation, sign-in/out and real recovery link.
2. Wire, verify and review authenticated owner invitation and local staff/company binding with two actual user sessions and cross-company denials.
3. Build and test actual protected HTTPS upload, exact server acknowledgement, authorized second-device download, deduplication and recovery for every approved event type.
4. Test sanitized backup restoration, full suite, and owner-operated Windows/Android acceptance before release.
