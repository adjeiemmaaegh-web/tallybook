# Remote Owner / Attendant Architecture

## Decision

Tallybook remains offline-first locally, but a company can optionally become a synchronized cloud workspace. This is the architecture required for the store-owner requirement: an attendant can operate the shop while the owner is away and the owner can sign in from another device to see the business progress.

This feature must not be implemented as Google Drive backup. Backup protects data; it does not provide a shared authoritative business workspace or safe multi-user synchronization.

## Target behavior

- The attendant can work normally when the internet is unavailable.
- Local IndexedDB remains the immediate working database.
- When connectivity is available, local changes are queued and synchronized to the company's cloud workspace.
- The owner can sign in on another device and access the same company workspace.
- Owner and attendant have separate authenticated identities.
- Company membership and role are enforced by the cloud service, not by UI-only checks.
- Sync must be idempotent and must never duplicate a transaction because a request was retried.
- Conflicts must be detected and handled explicitly; a newer device must never silently overwrite unrelated newer records.
- Sign-out must not delete local records.
- Backup/Restore remains available independently of cloud synchronization.

## Recommended implementation boundary

Use a managed PostgreSQL/authentication service with Google OAuth and realtime change delivery (for example, Supabase). The existing Vite/React application can remain the frontend, and IndexedDB/Dexie remains the offline cache.

The cloud model should contain at least:

1. `profiles` — authenticated user identity metadata.
2. `businesses` — one row per business workspace.
3. `business_members` — membership and role (`owner` or `attendant`).
4. `sync_records` or equivalent — authoritative business records, with stable record IDs, business ID, updated timestamp, device ID, operation ID, and deletion/tombstone state.
5. `sync_cursors` or equivalent — per-device synchronization checkpoint.

Every business record must remain scoped to a business ID. Row-level security must prevent a member of one business from reading or writing another business's records.

## Initial synchronization strategy

For the first production implementation, prefer record-level synchronization over whole-database snapshot replacement. Whole-database snapshots create avoidable lost-update problems when the attendant and owner both make changes on different devices.

Each local mutation should have:

- stable record ID
- business ID
- operation ID / idempotency key
- originating device ID
- logical operation type
- updated timestamp
- tombstone for deletion where appropriate

A successful cloud acknowledgement is recorded locally. Failed uploads remain queued and are retried. Downloads are applied idempotently to the local database.

## Roles

### Owner

- create and rename the business
- invite/remove attendants
- view all business records and reports
- manage synchronization settings
- retain full access to the business workspace

### Attendant

- use the business operational screens required to run the shop
- create operational records such as sales, purchases, expenses, payments and inventory movements
- view the information necessary for day-to-day work
- cannot transfer ownership or remove the owner
- cannot access another business

The exact attendant permissions should be implemented as a policy table rather than scattered UI conditions.

## Google Sign-In

Google OAuth identifies the person. It does not itself authorize access to a business. After authentication, the app must load the user's business memberships and authorize each business through the cloud database's security rules.

Do not store Google access tokens in the Tallybook database.

## Offline behavior

When offline:

1. the app continues to use IndexedDB normally;
2. mutations are added to the local sync queue;
3. the UI clearly indicates that the change is saved locally but not yet synchronized;
4. no transaction is rejected solely because the internet is unavailable.

When connectivity returns, the sync engine retries automatically and reports the last successful synchronization time.

## Release gate

This feature is not considered complete until all of the following pass on the deployed test environment:

1. Owner signs in with Google.
2. Owner creates/opens a business workspace.
3. Owner invites an attendant.
4. Attendant signs in on a different device.
5. Attendant records a sale.
6. Sale is immediately visible locally to attendant.
7. Sale synchronizes when online.
8. Owner sees the sale from the other device without importing a backup.
9. Attendant loses internet, records another sale, reconnects, and the sale synchronizes exactly once.
10. Owner and attendant make independent changes without one silently deleting the other.
11. An unauthorized account cannot read the business.
12. Existing offline, backup/restore, inventory, sales, purchases, expenses and reporting tests still pass.

## Current blocker

The repository does not currently contain a configured cloud authentication/database service. The current README correctly states that IndexedDB is local and that Vercel hosting alone does not synchronize data between devices. A production implementation therefore requires creation/configuration of the selected cloud backend and its Google OAuth credentials before a genuine two-device live test can be performed.

No production branch should claim that remote synchronization works until that external service configuration and the two-device acceptance test have passed.
