# Stage 8 V15 — opt-in sync foundation, Build 1

Baseline: Stage 7 V14 consolidated audit archive. Stage 7 unresolved work retained in DEFERRED_QA_MASTER.md.

## Stage 8 units
1. 8.1 Organization identities and device enrollment — NOT IMPLEMENTED.
2. 8.2 Encrypted remote backups and recovery — NOT IMPLEMENTED.
3. 8.3 Opt-in consent and durable operation journal — PARTIAL: company-scoped consent and local outbox metadata in Dexie schema v19. No automatic capture of sales yet.
4. 8.4 Idempotent replication and conflict resolution — NOT IMPLEMENTED; local queue deduplication only.
5. 8.5 Offline-to-online sync and health — NOT IMPLEMENTED; intentionally no network transport.
6. 8.6 Security and device consistency QA — regression cases added; full execution and browser testing outstanding.

## Safety boundaries
- No data is uploaded, no cloud account is required, offline POS remains independent.
- Queue stores operation identifiers and a payload digest, not full financial/customer payloads.
- Queue entries do not imply remote acknowledgement. No acknowledgement API is exposed in this build.
- Local permission enforcement must be integrated BEFORE consent is exposed to end users.
- For correct end-to-end replication, the journal must be written atomically with every source ledger transaction; this is not yet implemented.

## Verification
- Run TypeScript syntax parsing and direct validator checks, then verify ZIP integrity.
- Full Vitest, tsc semantic check, Vite production build and IndexedDB migrations are not verified unless explicitly reported.
- Stage 8 is INCOMPLETE. Stage 9 has not started.
