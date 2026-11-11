# Shared-device cashier accountability — implementation and remaining gates
Date: 2026-11-11
Scope: **Shared Shop** at /shop (not the independent local-device ledger).

## Grounded baseline
- A cloud shop sale is server-authorized. The server stores cashier_id from the authenticated actor, a server recorded_at, and the provided client_recorded_at. Stock movement records store actor_id and a sale link. Only the server can establish accepted sales.
- The owner can review cashier-attributed sales and per-cashier daily reports. Physical stock counts already exist, with start/apply history recorded server-side.
- A durable encrypted offline sale outbox is keyed by account ID + business ID. A parked cart is an unsold draft; do not confuse it with a recorded sale.
- The Shared Shop currently has no independent mandatory shift-opening/shift-closing server record. The offline device ledger's PIN-based staff shifts are a different subsystem and must not be implicitly merged into cloud membership.

## This increment
1. A person uses their OWN Google/email account; same shared browser profile has one active account at a time. A visible avatar opens an account menu and Switch employee action.
2. Before switching, inspect saved-sale outbox scopes for the outgoing user. Warn for unconfirmed, rejected or unreadable sales; allow cancel. A storage inspection failure never means an empty queue.
3. Local sign-out affects the shared browser's session, not sessions on that employee's other devices. The next user signs in afresh; credentials/PINs are not shared.
4. A queued sale cannot be sent with the successor's auth token: the upload captures a JWT only when its user ID matches the sale's original cashier scope, pins it in the HTTP Authorization header, and checks that the returned cashier ID/company/submission key match. Do not turn network or session-change ambiguity into a new sale.
5. Separate store selection by user + business, revalidating against the assigned active-store overview. Clear only the departing user's cached views and parked drafts; do not delete another user's cache or anyone's saved-sale outbox.
6. For owner investigations, show the recorded cashier account ID and authoritative server posting time in sales, with former/unlisted IDs retained. Show applied stock-count differences without asserting that one employee caused a shortage.

## Crucial limitations
- The server **posting time** can be later than the **actual sale time** for offline transactions. Client-provided timestamps are not independent evidence, and the current receipt read model does not expose client_recorded_at. This feature does not claim an exact offline transaction time.
- A stock difference proves only a discrepancy at a count. It does not prove theft, negligence, or which shift caused the difference.
- A later login cannot sync a previous cashier's unsent queue; that cashier must return to reconcile it. Switching must not clear browser storage.
- Browser-profile encryption protects against copied storage and casual access, not a malicious person with access to an unlocked device and its origin's JavaScript. Shared devices require an OS lock policy and individual credentials.
- Existing stock movement actor IDs are stored by the server, but a complete owner-facing movement-by-employee timeline and staff change history are NOT delivered in this increment.
- No cloud shift_id, opening cash declaration, closing cash count, supervisor sign-off, formal timestamp-bound handover or missing-inventory attribution verdict is introduced here.

## Next server-backed increment (requires migration, tests, and approval)
- Append-only shared-shop shift records: staff user ID, business, assigned store, server start/end times, confirmed opening/closing cash, difference, and manager review; explicitly handle abandoned/offline shifts.
- A read-only owner audit feed: stock movements, manual adjustments, purchases/receipts, refund actors, and stock-count creators/appliers, each with server actor ID, timestamp, store, product, reason, related sale/refund/receipt/count ID. Preserve history after employee removal.
- Separate client-entered and server-posted sale times, clearly labeled; show trust level when an offline timestamp differs materially.
- Opening/closing shelf counts and cash handover evidence for each shift, with human review instead of automatic blame.
- Access-revocation and minimum-necessary retention policy for old employee identities.

## Acceptance matrix
- A and B use one browser profile sequentially; no sign-in, outbox, cart, store or privileged view from A becomes B's.
- A saves a sale offline, switches after a warning, B records their own sale, A returns to sync; the two server receipts have the correct *different* cashier IDs and original submission keys.
- A's queued send starts just before the browser switches to B; it uses A's pinned token or remains queued, never B's token.
- The owner can identify the accepted transaction's cashier, server posting time, store, receipt, and amount; former staff IDs are not silently replaced by “unknown.”
- Simulate lost network reply, duplicate receipt, revoked staff/store assignment, unreadable queue, absent IndexedDB, canceled switch, sign-out failure, multiple tabs, browser restart, and 320/360px layouts.
- Validate that shift-end shortage investigations are supported by recorded stock counts and server audit history, not allegations inferred from an account being signed in.
- Full TypeScript, unit/native tests, browser QA, two real Supabase accounts on one Android device, and a business-owner review remain required before claiming production acceptance.

## Scope control
No direct customer database updates, payments, live data imports, production migration, or production release in this PR. Existing server authorization is the source of truth.
