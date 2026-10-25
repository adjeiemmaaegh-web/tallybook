# Central workspace migration / rollback strategy — planning document

1. Baseline: save exact byte-for-byte source archive and SHA-256 checksums. The current upload uses Dexie v29; a separately inspected GitHub branch used v33. **Do not apply local v30 over a later v33 branch without recreating a forward-only migration with the next unused version**.
2. Central SQL is for a clean **test** project only. Run migrations in order and inspect SQL, grants, RLS and `auth.users` dependencies. No historical IndexedDB rows may be implicitly promoted or assigned shops/staff/devices.
3. Provision two real test Auth users via the test project, then trusted staff memberships and registered devices; never seed fake production identities. Add negative RLS tests before enabling ingestion.
4. Enroll devices via trusted owner/supervisor session. Establish accountability rules for new writes while preserving legacy unknown attribution, with an explicit onboarding screen for owner and each attendant.
5. Enable upload-only central ingest for one test shop only after transaction-bound local durable payload capture, digest verification, database idempotency and appropriate server authorization are implemented.
6. On upgrade failure: disable central adapter, retain local outbox unchanged, keep locally committed sales available offline, and restore the exact last verified local snapshot where recovery is explicitly approved. Do not silently downgrade an opened Dexie schema or rewrite financial history.
7. On server rejection after offline staff/device revocation: retain a rejected/pending-for-review event locally, notify authorized owner, and never pretend the central store accepted it. Any correction needs an explicit compensating entry.
8. No production schema DROP, DELETE, historical backfill, or live rollback is authorized. Design tested migrations and restore points before a production rollout.
