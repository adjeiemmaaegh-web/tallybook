# Offline data: threat model and storage inventory (PRD R1)

## What is protected, and from whom

| Threat | Mitigated? | How / why not |
|---|---|---|
| Someone obtains sealed shop records without the device key | **Yes, for the sealed payload** | AES-256-GCM protects the payload. A non-extractable key is stored in IndexedDB. Protection against copying an entire browser profile or disk image depends on platform key storage and requires device testing. |
| Record swapped between sales, users or companies | **Yes** | The record identity (`scope`, `submissionKey`) is authenticated additional data; a moved record cannot be opened. |
| Two tabs overwrite each other or send a sale twice | **Yes** | One record per sale, per-sale and per-scope Web Locks, server idempotency key as backstop. |
| Crash or lost response between "sent" and "confirmed" | **Yes** | State `sending` is persisted; on recovery the server's receipt is looked up before any re-send. |
| Revoked employee's queued sale posting later | **Yes** (server) | The server checks membership on every call; a rejected sale is parked, never retried silently. |
| Person using an unlocked device, or script running in this origin (XSS) | **No** | Encryption at rest does not stop a signed-in user or injected script. Controls: CSP (report-only today), sign-out, device security. |
| Lost device key / cleared browser data | **Partly** | If ciphertext survives key loss, the app can flag it for review. Clearing both storage and key removes the local evidence. Check the server for a matching receipt before re-entry. |
| Plaintext leftovers from before this change | **Migrated** | The old `tallybook.shop.outbox.v1:*` and `tallybook.shop.cache.v1:*` localStorage entries are imported, read back and only then removed. A failed import keeps the old copy. |

## Retention and sign-out behaviour

- Queued sales stay on the device after sign-out (they are money records). They remain sealed and scoped to the user and company. An explicit "Remove unreadable sale" is the only way to discard one without a server decision.
- The shop cache is removed on sign-out.

## Key recovery (decision 5, approved) -- status

Implemented: device key, sealed queue and cache, loss detection, no silent deletion.

An acknowledged receipt can be retrieved from the server. A sale that never reached the server exists only in the device queue. Recovering its payload after permanent key loss requires a previously verified recovery copy. The non-extractable device key cannot be exported retrospectively.

The local Dexie ledger stores readable records and indexes. Its encrypted backup protects the exported file. Application-level encryption of the active ledger remains open until a populated copy can be recovered on a clean device, reconciled against its source and safely rolled back after an interrupted conversion.

## Browser storage inventory (client/src, excluding tests)

| Store / key | Data class | Now | Action |
|---|---|---|---|
| IndexedDB `tallybook-secure` / `outbox` | Queued shop sales | Sealed | done |
| IndexedDB `tallybook-secure` / `cache` | Business list, shop overview | Sealed | done |
| IndexedDB `tallybook-secure` / `keys` | Non-extractable AES key | Protected by browser | done |
| `localStorage tallybook.shop.store:<companyId>` | Selected store id | Plain (not sensitive) | none |
| `localStorage` parked cart (`features/sales/parkedCart.ts`) | Cart contents (device ledger) | **Plain** | follow-up |
| `localStorage` pending checkout (`features/sales/pendingCheckout.ts`) | In-progress device-ledger checkout | **Plain** | follow-up, financial |
| `localStorage` `FriendsTestGate` binding / verified-owner keys | Account/owner binding hints | **Plain** | review |
| `localStorage` `features/sync/qaDeviceClient.ts` scope key | QA device scope | **Plain** | QA only |
| `localStorage` setup-progress, voice input, theme | Preferences | Plain (not sensitive) | none |
| IndexedDB Dexie `TallybookDB` | Local device ledger (sales, stock, customers, staff) | **Plain** | blocked on recovery package |
| IndexedDB assistant local store | Assistant data | **Plain** | review |
| Backup export | Whole ledger | Authenticated encrypted export (existing) | keep |

## Verification status

- Automated: `qa/outbox-core.test.mjs` (15 cases, run with `node --experimental-strip-types --test`): write-ahead, crash, ambiguity, two-tab, duplicate tap, unreadable record, record-moved, plaintext absence, legacy migration.
- **Not verified:** the IndexedDB backend and Web Locks in real browsers (Chrome, Edge, Firefox, Safari, iOS PWA), quota failures, private-browsing behaviour, low-memory devices. See the acceptance checklist.
