# Cloud completion status — 13 October 2026

Reference: the owner's Tallybook study guide. Its description of schema version 11 predates the current local schema (28). The existing local ledger is retained.

## Implemented in this branch

- Reusable AuthGate uses the existing Supabase client, waits for session discovery, redirects signed-out users, and keeps signed-in users away from the sign-in page. Session listener cleanup, stale response handling, cross-tab logout and error states are tested.
- Previously authenticated devices can open their local records offline. The offline identity marker contains only a user ID and does not grant cloud access. Online cloud operations still require a valid Supabase JWT and database membership. Remote revocation cannot be learned by a disconnected device; explicit sign-out removes the offline marker.
- Gate mounts outside the database and business providers, so a signed-out gated visit does not mount the ledger. Account/sign-out remains accessible from the app header.
- Cloud business lookup, retry-safe creation and owner-authorized assignment use the existing client. Local company IDs are never treated as proof of cloud ownership.
- PostgreSQL migration creates profiles, businesses and memberships, with RLS and restrictive grants. Creation and initial owner membership commit atomically. Assignment/removal requires the actual owner and cannot promote an attendant.
- Executable PostgreSQL tests verify isolation, anonymous denial, direct-write denial, assignment, revocation, changed-request rejection and idempotent business creation.

## Rollout

The gate is staged behind `VITE_TALLYBOOK_REQUIRE_AUTH=true`. It defaults off to preserve the deployed local app until the production authentication configuration and callback are verified. No production database migration has been applied. Do not treat source preparation as a completed live rollout.

Production project supplied by the owner: `https://qfyyfxwvidfvdfdgeu.supabase.co`.

Before enabling: connect Supabase access, inspect existing public tables/policies/migrations, reconcile naming conflicts, validate migrations against a development database, check Google redirect URLs, then exercise sign-in/sign-out and offline refresh on the deployed preview. Apply the migration and enable the flag only after these checks.

## Remaining roadmap

1. Verify and activate the authentication and business identity foundation on the connected project.
2. Define cloud-to-local business bindings and protect against opening another account's cached business on shared devices. Explicitly associate existing local data; never auto-claim or upload it based solely on a browser sign-in.
3. Map all schema-28 tables, including newer financial, store, staff and sync records. Preserve minor-unit money, historical currency evidence and immutable ledger relationships. Staff PIN verifiers and device-local assistant records must not be copied blindly.
4. Add cloud bookkeeping schema, business-scoped foreign keys and permission policies; verify against two independent users.
5. Implement durable atomic upload batches, retry receipts, initial import and resumable cursors. Upload transactions as consistent units, not isolated child rows.
6. Implement pull/apply, conflict records, tombstones and transactional cross-tab coordination. Never overwrite pending local money/stock changes or use last-write-wins for financial events.
7. Add owner/attendant assignment UI, remote owner dashboard and reliable synchronization status.
8. Verify two devices, offline interruption/restart, access revocation, historical migrations and production recovery before release.

The supplied guide is a roadmap, not a claim that these remaining stages are implemented. Cloud synchronization is not active in this branch.

## Validation for this foundation

17 targeted client tests passed (authentication, business identity and app navigation). Seven source/database checks passed, including executable PostgreSQL access-control checks. Both authentication browser journeys passed. TypeScript and the production build passed; the existing bundle-size warning remains. Live Supabase OAuth, production migrations, remote ownership and two-device synchronization have not been tested or activated.
