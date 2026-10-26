# Purchase and shift events with isolated signed ingestion — 2026-10-26

## Local events

New purchases, supplier liability recognition, supplier payments/credits and shift open/close now append v38 `centralOperationalEvents` records inside their existing Dexie transactions. Event write failure aborts the matching journal/shift and stock changes. The schema version does not change. An exact purchase or supplier submission retry returns its existing record without another event. Historical records are not backfilled or assigned a shop, staff or device identity that was not saved at the time.

The purchase event contains the saved receipt and lines. Supplier events contain the saved liability/payment/credit entry and state `local_record_only` settlement evidence; a manual payment is not bank confirmation. Shift opening contains the opening snapshot and shift closing contains the saved count and variance. Shop is `null` when the source operation did not save one, and device is `null` for every local event. Backup preflight compares each event with its saved source and refuses unknown or mismatched event kinds. Portable backup and restore continue to preserve the table.

## Isolated server ingestion

`server/centralSaleIngest.mjs` joins the existing Ed25519 sale verifier with active Auth-session, membership, staff, shop assignment, device and unique-operation checks in one transaction. `server/centralSaleIngestPostgres.mjs` uses a private SERIALIZABLE PostgreSQL transaction and row locks. Exact replay returns the original receipt; changed payloads conflict. One bounded retry after a unique/serialization race rechecks authorization. The stored row is marked `upload_claim_only`. The receipt means a signed sale claim was stored by the server, **not** that the physical sale, payment or device of origin was independently proven. Browser financial writes remain denied. `docs/security/CENTRAL_SALE_INGEST_ISOLATED_SCHEMA.sql` and `qa/central-sale-ingest-isolated.test.mjs` exercise this against synthetic identities in PGlite. No route mounts the service and no cloud upload is enabled.

This uses the draft `tb_*` schema solely in an isolated local test. The current live ownership schema uses `businesses/business_members`; applying the draft schema over it would be unsafe. The connected Tallybook Supabase project `qfyydfxwvifdvffdfgeu` reported `INACTIVE` and a read-only table listing returned “Database is possibly not accessible at the moment” during this checkpoint. No live project schema or RLS behavior was verified or changed.

## Remaining work for secure synchronization

1. Reconcile the isolated `tb_*` identity model with the verified live `businesses/business_members` baseline in a separate disposable Supabase project. Create a forward-only migration with trusted public-key enrollment and revocation; audit its RLS and direct Data API grants.
2. Bind a device public key to the existing owner-approved store grant and verified staff identity. Test enrollment, rotation, expiry and revocation. The present local `syncDevices` registry is not server authentication, and a grant alone does not prove hardware identity.
3. Add a client non-extractable signing key and consented durable delivery queue, then wire an authenticated HTTPS ingest route only after the private server adapter and live RLS tests pass. Keep source events immutable and distinguish pending, accepted and rejected operations. Do not infer missing shop/staff IDs on legacy rows.
4. Extend transactional ingestion to each approved event kind. The isolated path in this checkpoint accepts signed **sales only**. The other new local events are not remotely accepted; shift and some repayment events currently lack shop provenance.
5. Verify two companies, owner/attendant permissions, exact retry, conflict, lost ACK, revocation race and offline reconnect against the disposable Supabase project, then complete Windows/Android acceptance. No production sync or deployment is authorized by this checkpoint.

See `docs/central/evidence/v40-verification-2026-10-27.md` for exact checks and remaining failures.

## Reproduce the isolated checks

From the repository root on Windows, using the lockfile-installed Node dependencies:

```powershell
New-Item -ItemType Directory -Force client/.test-tmp | Out-Null
$env:TEMP=(Resolve-Path client/.test-tmp).Path; $env:TMP=$env:TEMP
node_modules/.bin/tsc.cmd --noEmit --pretty false
Push-Location client
..\node_modules\.bin\vitest.cmd run --maxWorkers=1
Pop-Location
node --test qa/central-sale-ingest-isolated.test.mjs server/tests/centralEventTrust.test.mjs
npm.cmd run build
```

The complete native QA also requires local loopback access for its HTTP fixtures. The isolated ingestion test needs no Supabase credentials and uses only synthetic identities and in-memory PGlite.
