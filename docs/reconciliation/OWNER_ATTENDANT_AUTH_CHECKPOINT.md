# Owner and attendant authentication checkpoint

Date: 2026-10-26. Branch: `development/v19-unified-reconciliation`.

## Chosen model

The owner and each attendant should have individual cloud accounts for remote identity and company membership. On a shared device, each must also unlock a distinct local staff identity with a PIN or supported device authenticator. Cloud sign-in alone must never grant local ledger authority; a local PIN alone must never grant cloud authority. A future explicit, owner-approved binding must connect the two identities for a company. Offline bookkeeping remains available to an authorized local staff member on that device.

## Implemented in this increment

- A Google account transition or sign-out revokes every in-memory local staff unlock. Initial-session discovery and routine token refresh do not cause repeated locks. Auth events are only used to revoke local authority, never to grant it.
- The Staff page shows account creation and permission-management controls only during first-owner enrollment or to a locally unlocked owner. The existing staff service continues to enforce the actual role policy; UI visibility is not an authorization decision.
- The future cloud access policy treats an `attendant` membership as read-only identity evidence. Generic cloud `write` access remains denied until each operation has an explicit staff/store permission check; local cashier sales continue under the existing PIN and shift policy.
- A denied owner-only action now leaves a valid cashier session unlocked; a changed, disabled, or invalid staff credential still revokes it. This fixes the cashier lockout observed when moving from Staff to Sales.
- Cloud sign-in screens and signed-out cloud redirects do not initialize the local IndexedDB workspace.
- Focused tests cover account-change lock behavior and the existing local owner, supervisor, cashier, shift, and read-entrypoint rules.

## Automated evidence

- TypeScript semantic check passed after the changes (`evidence/auth-owner-attendant-typescript.txt` is empty on success).
- Focused local staff, account-route and cloud-transition tests: 24/24 passed across four files (`evidence/auth-owner-attendant-tests.txt`).
- Focused company-access and verified-cloud lookup tests: 18/18 passed across two files (`evidence/auth-owner-attendant-cloud-policy.txt`).
- Final production Vite/PWA build passed after the cloud-policy change (`evidence/auth-owner-attendant-build.txt`); the existing large-chunk warning remains.
- Complete client suite passed 1002/1002 tests in 125/125 files (`evidence/auth-owner-attendant-full-client.txt`). The final account-preview route change is additionally covered by the focused rerun.
- The release browser suite passed 3/3 (`evidence/auth-owner-attendant-release-browser.txt`).
- The offline PWA browser suite passed 3/3 after its owner-creation assertion was updated to check the unlock selector. Its initial 3/3 failure against the now-hidden staff-management row is preserved in `evidence/auth-owner-attendant-offline-browser-initial-failure.txt`; the passing rerun is `evidence/auth-owner-attendant-offline-browser.txt`.
- The old browser auth script expected the entire offline ledger to redirect to Google sign-in. Its assertions were replaced with cloud-route denial and a local owner-to-cashier PIN journey. The replacement passed 2/2 in Chromium (`evidence/auth-owner-attendant-browser.txt`), including cashier navigation to Sales after an owner-only control was denied.

## Still required before claiming complete owner/attendant authentication

1. Explicitly bind an existing local company and its owner staff record to a verified cloud owner after backup and recovery validation. Preserve all old IndexedDB data; never infer ownership from selected company, email, or a Google token alone.
2. Connect each invited cloud attendant to a specific local staff record with owner approval and company/store scope. Reject mismatched cloud and local identities and revoked membership. Do not auto-promote `attendant` to local owner or supervisor.
3. Define and test offline credential continuity and revocation behavior on shared devices. Remote revocation cannot be learned while fully offline; prevent stale sessions on the next online check. Decide whether customer data must be encrypted at rest for hostile-device protection; current PINs are operational locks only.
4. Make staff governance activation durable so loss of all staff rows cannot reopen legacy no-staff mode. Cover company clear, backup/restore, migrations and every service write transaction without losing historical data.
5. Run real two-account Google sign-in, invitation, owner/attendant access-denial and RLS tests against a disposable project, plus local browser tests. Current cloud membership and ledger synchronization remain separate foundations.

No production environment, RLS policy, deployment, or existing customer record was changed by this increment. Do not describe this checkpoint as complete authentication or production readiness.

## Connected cloud check, 2026-10-26

The connected Supabase project list returned Tallybook project `qfyydfxwvifdvffdfgeu` with status `INACTIVE`. A read-only public-table listing returned "Database is possibly not accessible at the moment"; the security-advisor API returned no lints but did not establish database reachability. No project restore or configuration change was attempted. Therefore live Google sign-in, membership, and RLS cannot be certified from this check.
