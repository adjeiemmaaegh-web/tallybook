# Dexie v38 cash refund event checkpoint — 2026-10-26

## Scope and behavior

Dexie v38 adds `centralOperationalEvents` as an additive local-only table. New **confirmed partial cash returns** now write a `sale.cash_partial_refund_recorded` event in the same IndexedDB transaction as the cash-return journal, stock movement, FIFO cost restoration and staff audit. If event storage fails, the refund, stock and cost writes roll back together. A replayed cash-return request is still rejected before another cash disbursement; it does not create a second event.

The event's `payoutEvidence` is `staff_confirmed_only`. This preserves what the cashier attested, not independent proof of cash delivery. `deviceId` and delivery status remain `null` and `local_only`; `shopId` is copied only from the saved original sale and stays null if absent. Missing staff/shift identity is preserved as null. Nothing is uploaded or server-acknowledged by this migration. Historical cash returns are not backfilled, changed or assigned invented provenance.

Portable backups now include the v38 table. A pre-v38 backup may omit it and normalizes to an empty table; a v38 backup missing it is rejected. Each included event must match the saved cash return and original sale before restore. A focused restore test confirmed the event and return survive together. The existing Dexie v30-v34 histories and v37 sale events are untouched.

The existing `noSaleEvents` drawer journal was also found missing from portable backups. v38 backups now include it with validated reason, operation key, staff authorization and timestamp. Earlier portable backups may omit it because the table was not included in their export even when it existed in IndexedDB; v38 backups missing it fail. A backup/restore test preserves a historical drawer event. Its `deviceId` remains a local historical claim and does not re-enroll or authenticate a device.

The `centralOperationalEvents` name permits later approved event kinds, but this checkpoint implements **cash partial refunds only**. Full reversals, repayments, purchases and shifts still require transaction-bound central event capture. Existing `noSaleEvents` has a transaction-bound unique operation record and is now preserved in portable backups, but its registered device ID remains only a local claim and is not server attestation. The server ingest route, trusted device enrollment, live RLS and multi-device sync remain unimplemented.

## Verification

See `docs/central/evidence/v38-verification-2026-10-26.md`. The first full client run passed 1010 and failed one obsolete fixed-schema assertion expecting v37. The assertion was changed to compare the opened database version with the declared schema version; its focused rerun passed. The complete final client run after the drawer backup fix passed **1011/1011** across 125 files. Native QA passed **434/434**. TypeScript, Vite/PWA and Node server builds passed. Local Chromium release, auth and offline suites each passed **3/3**. The v38 backup compatibility/native schema tests passed 18/18. No Linux server security, live Supabase or real-device acceptance is claimed.

## Resume safely

1. Continue event capture for full reversals, repayments, purchases and shifts one operation at a time, inside each existing financial write transaction, with backup consistency and rollback tests. Avoid historical backfill without evidence.
2. Keep cloud posting disabled until owner/attendant identity binding, trusted device enrollment, revocation-atomic transactional ingest and RLS tests pass in an isolated project. Do not treat these local events as signed or server trusted.
3. Re-run historical migration and representative sanitized-backup restore before any release decision. The Windows and Android operational acceptance gates remain separate.
