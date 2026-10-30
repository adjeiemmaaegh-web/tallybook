# Isolated QA device enrollment integration

## Implemented

The isolated QA Edge function now exposes authenticated `deviceProvision`, `deviceInvite`, `deviceRedeem`, and `deviceRevoke` operations. Auth.getUser verifies the bearer token before the actor/session reaches the database. Redemption verifies Ed25519 possession using the existing enrollment byte contract. The database operation uses SECURITY INVOKER with execution granted only to service_role, rechecks auth.sessions and company ownership/membership, locks authorization rows, and commits the key, eight-hour grant, invitation consumption and audit atomically.

An exact retry within the invitation lifetime can recover the receipt for its recorded device without issuing another grant. Different devices, expired invitations, changed staff assignments and revoked keys fail closed. Historical used invitations without the new device binding cannot recover receipts. Provisioning requires an existing approved company_local_bindings row; it cannot claim arbitrary legacy company data or reactivate revoked staff/shop records.

The client panel is mounted only for the isolated QA project with membership preview enabled. It supports local shop/staff selection, owner-approved assignment, targeted invitation, nonextractable device-key preparation, signed redemption, owner revocation, and the existing unposted claim read. Local owner/staff permissions are checked independently of cloud membership. Saved public device scope can resume after reload; keys remain in the device vault, and invitation tokens are never persisted. The signed-pull source gate remains false, so the read button reports unavailable until that separate gate is released.

## Applied and verified

- QA project: `lmneuqxfyxplrxjswpma`; production project untouched.
- Applied migrations: `qa_device_enrollment_rpc`, then `qa_device_enrollment_retry`. Reproducible final SQL: `docs/security/qa_device_enrollment_rpc.sql`.
- Edge function `tallybook-run3-qa` version 7, verify_jwt=true, with deviceActions and enrollmentProof modules included.
- Database inspection: SECURITY DEFINER false; anon/authenticated execute false; service_role execute true. Retry binding column present. Zero QA users and devices.
- Unauthenticated POST to deviceInvite returned 401.
- PGlite service-role/Edge integration and signature interoperability: 2/2 passed, including local binding mismatch, owner-only actions, wrong signer, exact retry without duplicate grant, substituted device, revoked key and revoked session.
- TypeScript semantic check and Vite/PWA client production build passed. Build warnings remain for chunk size, mixed dynamic/static imports, and dependency annotation comments. No real-account enrollment or user acceptance is claimed.

Security advisor retained 14 informational RLS-without-policy notices on server-only tables. Browser table grants remain denied. Reference: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Remaining work

No QA accounts or independently approved local-company links currently exist. The UI can be exercised after those are provisioned through the existing approved ownership process; this increment does not bypass it. Signed claim upload, financial replay, conflict resolution, complete multi-store accounting and production rollout remain separate unfinished requirements. No production-readiness claim or main merge is justified by this increment alone.
