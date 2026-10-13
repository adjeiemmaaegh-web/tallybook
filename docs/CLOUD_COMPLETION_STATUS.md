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

The gate is staged behind `VITE_TALLYBOOK_REQUIRE_AUTH=true`. It defaults off to preserve the deployed local app until account-local data isolation and the complete authentication journey are verified. The ownership migration is installed in production; the application changes remain in draft PR #4. Do not treat database preparation as a completed synchronization rollout.

Verified production project: `https://qfyydfxwvifdvffdfgeu.supabase.co`. The initially pasted reference contained a typo. The connected Tallybook project and the live site's compiled client both use this verified reference. Live site: https://tallybook-eight.vercel.app/.

On 13 October, restored the paused production project and confirmed ACTIVE_HEALTHY. Before migration, public application tables and migration history were empty and there were zero registered accounts. Applied `20261013123347_business_identity` and `20261013123702_restrict_rls_helper`; local filenames match the recorded remote versions. Verified RLS on all three tables and denied anonymous execution of the three public RPCs. Privileged implementations live in a private schema; public wrappers use caller privileges. Removed browser execution grants from the existing RLS event-trigger helper. The security advisor now reports only disabled leaked-password protection; the performance advisor reports the newly created membership index as unused, which is expected before traffic.

Google OAuth is enabled. An unauthenticated authorize request returns a Google redirect with the live `/signin` return address. This verifies initiation only, not a completed real-user login. No local ledger records have been uploaded. Before enabling the gate, exercise real sign-in/sign-out and offline refresh, and implement explicit local-data ownership handling.

The sync status screen now includes cloud business account lookup and explicit creation. Creation persists a request ID before sending, so retries after lost responses or reloads cannot duplicate the same request. This prepares cloud identity only; it does not bind, claim, or upload the local business. Delayed responses from a previous account are discarded.

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

The original foundation passed 17 targeted client tests, seven source/database checks, both authentication browser journeys, TypeScript and the production build. The existing bundle-size warning remains. The revised private-schema migration also passes the executable PostgreSQL access-control test. Production schema and privileges are verified. Completed real-user OAuth and two-device synchronization remain unverified and are not claimed as active.

Latest validation: all nine cloud identity/screen tests passed (the initial screen worker timed out at startup; an isolated rerun passed), all seven source/database checks passed, and TypeScript passed.
