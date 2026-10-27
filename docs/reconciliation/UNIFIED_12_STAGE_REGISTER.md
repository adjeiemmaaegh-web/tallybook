# Tallybook V19 — 12-stage engineering register (reconciliation checkpoint)

The 82 acceptance units in `docs/release/traceability.json` remain the governing register. This update records source-integration evidence without changing any unit to accepted. Counts below are the register's current statuses, not completion claims.

| Stage | Implemented, unverified | Implemented and tested | Missing | Blocked | Reconciliation assessment |
|---:|---:|---:|---:|---:|---|
| 1 | 6 | 0 | 0 | 0 | Full transaction and real-browser recovery gates open. |
| 2 | 7 | 0 | 0 | 0 | Historical batch/cost evidence still needs broader reconciliation. |
| 3 | 6 | 0 | 1 | 0 | Financial conservation and tax acceptance open. |
| 4 | 7 | 0 | 0 | 0 | Customer credit, wallet, and refund policies need full regression. |
| 5 | 3 | 1 | 1 | 0 | Assistant regression suite passes; formal acceptance is not inferred. |
| 6 | 6 | 0 | 0 | 0 | Recovery/backup tests and physical restart evidence open. |
| 7 | 6 | 0 | 0 | 0 | Supplier liability and settlement checks open. |
| 8 | 5 | 0 | 4 | 0 | Cloud remains development-only and disabled for production. |
| 9 | 6 | 0 | 5 | 0 | Multi-store and secure synchronization remain unaccepted. |
| 10 | 2 | 0 | 3 | 2 | Payment simulation and commerce only; live integrations prohibited. |
| 11 | 2 | 0 | 3 | 0 | Focused company-isolation suite passes 15/15; wider audit open. |
| 12 | 4 | 0 | 1 | 1 | Device, browser, operations and release acceptance open. |

Current automated evidence: the fresh clone at `3fd4b2f` passed complete client Vitest 996/996 across 124 files, following frozen installation, TypeScript and build. Clean-clone release and offline Playwright passed 3/3 each. After updating obsolete source-contract assertions, native QA passed 420/420 and focused server audits passed 83/83. The full Windows server suite remains non-green (345 pass, 43 optional-sync failures, 1 skip); Linux security verification is pending. These automated results do not change the 82 acceptance-unit statuses without required operational evidence.

**Release decision: NO-GO.** No deployment, live payment, or formal physical-device acceptance is authorized or claimed.

## Later v36 evidence, 2026-10-26

The staff-governance migration now fails closed if an enrolled company's staff rows disappear. Full client Vitest passed 1006/1006 across 125 files; TypeScript, production build, native schema-order gate (3/3), auth browser (3/3), release browser (3/3), and offline browser (3/3) passed. The status counts above remain unchanged because these checks do not supply the missing cloud, historical customer, Linux server, and operational acceptance evidence. See `STAFF_GOVERNANCE_V36_CHECKPOINT.md`.

## Local central-event checkpoint, 2026-10-26

Dexie v37 records new-sale event payloads atomically with checkout, preserves them through portable backup, and does not backfill historical sales. An isolated signed uploader verifier and draft PostgreSQL RLS tests now exist, but enrollment, server ingestion, live Supabase/RLS, full operation coverage, and Watchdog importer acceptance remain open. Complete client Vitest passed 1008/1008, native QA 422/422, TypeScript and build passed, and nine local Chromium checks passed. The full Windows server suite remains non-green at 349 pass, 43 POSIX-only failures, 1 skip; Linux evidence is still unavailable. The 82 governing acceptance-unit statuses in the table above remain unchanged. See `docs/central/2026-10-26_LOCAL_CENTRAL_CHECKPOINT.md` and its raw evidence.

## Watchdog offline importer increment, 2026-10-26

The user supplied a separate local Watchdog desktop source. A new, explicitly partial Tallybook canonical POS CSV was accepted by its real parser and authorized SQLite import path for synthetic sale, discount and no-sale records. Replay, wrong store, viewer role, malformed money, changed payload and revoked manager checks passed. Unsupported shift, cash count and MoMo evidence remains in the full JSON preview and is visibly counted as omitted from the POS CSV. Full shared event-contract acceptance, trusted register/device evidence and real-shop operation remain open. Client Vitest passed 1008/1008, native QA 434/434, TypeScript/build and nine Chromium checks passed on this increment. The 82 governing acceptance statuses remain unchanged; see `docs/central/2026-10-26_WATCHDOG_CANONICAL_POS_CHECKPOINT.md` and `docs/central/evidence/watchdog-canonical-verification-2026-10-26.md`.

## Dexie v38 cash refund event increment, 2026-10-26

New confirmed partial cash returns now receive an atomic local central event with staff-confirmed-only payout semantics. Historical returns are preserved without invented events; backups include and reconcile the new table. Portable backups now also preserve the pre-existing drawer/no-sale journal without trusting its local device claim. Focused rollback and restore tests passed. The final complete client suite passed 1011/1011, native QA 434/434, backup/schema checks 18/18, TypeScript/build and nine Chromium checks passed. The 82 governing unit statuses remain unchanged because live synchronization, all-operation event coverage and operational acceptance are open. See `docs/central/2026-10-26_V38_CASH_REFUND_EVENT_CHECKPOINT.md` and its evidence.

## Local reversal and repayment events, 2026-10-26

New full-sale reversals and customer repayments now append local operational events atomically with their respective immutable journals. Backup validation compares each event with the saved journal and original sale where applicable. Event-write rollback, payload integrity and restore tests were added. The final full client suite passed 1013/1013, native QA 434/434, TypeScript and production build passed. The 82 governing acceptance-unit statuses remain unchanged: these records are local evidence, not server attestation or completed sync. See `docs/central/2026-10-26_V39_REVERSAL_REPAYMENT_EVENT_CHECKPOINT.md` and its evidence for measured verification.

## Purchase, supplier and shift events with isolated signed ingest, 2026-10-27

New purchases, supplier liability entries and shift open/close now write local operational events atomically. Backup validation checks matching source records without assuming purchase-line array order. A private, unmounted signed-sale ingestion service was exercised against synthetic PGlite identities with RLS, revocation and exact-retry checks. The final full client suite passed 1017/1017, native QA 436/436, TypeScript and production build passed. The governing 82 acceptance-unit statuses remain unchanged: live Supabase was inactive, authenticated key enrollment and transport are not integrated, and physical/browser acceptance is separate. See `docs/central/2026-10-26_V40_PURCHASE_SHIFT_ISOLATED_INGEST_CHECKPOINT.md` and its evidence.

## UUID Supabase and signed-sale delivery checkpoint, 2026-10-27

The owner resumed the live Supabase project; a separate disposable project now holds an isolated UUID-baseline schema with staff-bound device keys. Owner-issued invitations support Ed25519 key possession and owner revocation; the client can reconstruct sale outbox metadata and sign an explicit upload claim. The signed-sale HTTP route remains disabled and no live schema was changed. Full client Vitest passed 1021/1021, native QA 429/429, focused identity/ingest 26/26, Chromium release/offline/auth 3/3 each, TypeScript and build passed. These are development checks; the governing 82 acceptance statuses remain unchanged pending real two-account, all-event, historical backup, Linux and device acceptance. See `docs/central/2026-10-27_V43_SYNC_ENROLLMENT_DELIVERY_CHECKPOINT.md`.

## Device key and staff provisioning checkpoint, 2026-10-27

V44 adds a browser IndexedDB vault for scoped, non-extractable Ed25519 keys and an unmounted owner-only staff/shop binding service with a server-side audit table. The additive table was applied to the disposable project only; 15/15 public tables have RLS and no browser table-write grants. Focused client 2/2, PGlite 2/2, Chromium auth 4/4, TypeScript and build passed. The 82 governing acceptance statuses remain unchanged: there are no real two-account Auth, Data API, authenticated sale-upload, physical backup or Linux security results. See `docs/central/2026-10-27_V44_DEVICE_VAULT_STAFF_PROVISIONING_CHECKPOINT.md`.

## Enrollment transport checkpoint, 2026-10-27

V45 adds disabled-by-default staff/device HTTP routes and an explicit browser redemption transport. Native focused 9/9, client focused 3/3, TypeScript and build passed. The 82 acceptance statuses remain unchanged: the routes are not enabled, two real Auth accounts have not completed the flow, and the remaining cloud and operational gates are open. See `docs/central/2026-10-27_V45_DEVICE_ENROLLMENT_ROUTE_CHECKPOINT.md`.

## Isolated HTTP lifecycle checkpoint, 2026-10-27

V46's PGlite fixture exercises the guarded HTTP and private coordinator sequence through owner provision, invitation, key proof, signed sale, exact retry and revocation; 9/9 focused native tests passed. The disposable Supabase project still has zero Auth users and sessions. The governing 82 acceptance statuses remain unchanged pending real Auth/Data API, trusted-edge hosting, and the other release gates. See `docs/central/2026-10-27_V46_ISOLATED_HTTP_LIFECYCLE_CHECKPOINT.md`.
