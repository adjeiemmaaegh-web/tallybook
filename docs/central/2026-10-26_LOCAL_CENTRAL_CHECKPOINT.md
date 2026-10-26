# Central architecture checkpoint — 2026-10-26

## Baseline and scope

Branch: `development/v19-unified-reconciliation`; starting commit `09f8a314e770ba46403c6a35d9d1b2e2a9ad5c72`. The local PostgreSQL environment is PGlite, with synthetic users and no customer data. No live Supabase schema, Vercel deployment, payment service, or Watchdog service was changed.

## Implemented in this increment

1. **Durable local sale evidence:** Dexie v37 adds `centralSaleEvents` without modifying historical sales. A newly completed sale, its lines, payment and receipt are copied into a local-only event in the same IndexedDB write transaction as checkout. A failed event insert rolls back the sale, stock and receipt. Retry with the same checkout submission key returns the saved sale and does not create a second event. Missing shop attribution stays `null`; `deviceId` stays `null`. Neither field is inferred from current settings.
2. **Backup and migration:** Portable backup includes v37 events and validates each against its saved sale, lines, payment and receipt. Old backups before v37 normalize the absent table to empty; v37 backups missing the table are rejected. Restore preserves the event and continues to revoke imported sync consent/device claims. The event is extra local evidence, not an authorization token or a cloud receipt.
3. **Isolated trust boundary:** `server/centralEventTrust.mjs` verifies Ed25519 signatures against a server-owned public key and requires a trusted session actor, active membership/staff/device/shop, and exact shop assignment. Negative tests cover tampering, wrong actor, revoked credentials and absent assignment. It returns `financialPostingAllowed: false`: a signature made at upload time proves the uploader, not the physical sale origin. It is deliberately **not mounted as an API**. The caller must hold directory checks and future persistence in one database transaction to prevent a revocation race.
4. **Isolated SQL check:** `qa/central-postgres-isolated.test.mjs` runs the draft `001`–`003` central migrations in PGlite. Synthetic owner A cannot read owner B's businesses or shops; an attendant sees only their own membership; browser finance INSERT and anonymous reads fail. This does not prove live Supabase Auth, Data API grants, or production RLS.
5. **Watchdog export evidence:** `qa/fixtures/tallybook-watchdog-preview-v1.json` is generated from the real Tallybook mapper and exporter by `node qa/generate-watchdog-preview.mjs`. The file parses and retains explicit unverified provenance. The connected repository [`adjeiemmaaegh-web/Alchemy-Watchdog`](https://github.com/adjeiemmaaegh-web/Alchemy-Watchdog/tree/11acc820493f303a669fb849a311f4edb47f6497) at commit `11acc820493f303a669fb849a311f4edb47f6497` contains a static marketing website (73 tree entries), **not a Watchdog importer**. All five other branches were inspected by their latest Git tree SHA (`2c15febe`, `03e9ef33`, `f15beaba`, `9fb271da`, `1da974d1`); none contains importer, CSV, event-contract or application source paths. No actual importer round trip or shared-contract acceptance is claimed.

## Security and architecture boundaries

- The local browser can still edit its own IndexedDB. The new journal is crash-durable with the checkout transaction, but is not tamper-proof or server-authenticated.
- `centralSaleEvents` currently covers **new sales only**. Refunds, reversals, repayments, purchases, no-sale drawer events and shifts still need transaction-bound event capture. Existing historical rows are not backfilled or assigned invented shop/device identities.
- The signature verifier assumes a trusted enrollment process has saved an Ed25519 public key and an authenticated server session has supplied `actorId`. Enrollment, protected private-key storage, key rotation, sale-time attestation and revocation-atomic database commit are not yet implemented. It must not be wired to HTTP until those exist. Upload-time signing alone cannot turn a local shop/device claim into trusted historical provenance.
- The draft `tb_*` central SQL is separate from the existing production `businesses/business_members` ownership migration. It has not been applied to the paused live Tallybook Supabase project. Never apply it blindly over the live project.
- The current Vercel production build is static; Node sync and ownership routes are not deployed there. Do not turn on remote feature flags or claim owner/attendant cloud access from this source increment.
- Current Watchdog JSON is `tallybook.watchdog.local_preview` with `partial_unverified_provenance`. It is a synthetic file and must not be relabeled final v1 without importer agreement and real store/device provenance.

## Reproduction

Use Node 24.19.0 and the locked dependencies already installed in this checkout. If package installation is needed, run the package manager version pinned in `package.json` after network access is available. On Windows, set `TEMP` and `TMP` to a writable workspace folder before Vitest; the sandbox's default temp folder caused `EPERM` before tests were collected.

```powershell
New-Item -ItemType Directory -Force .test-tmp | Out-Null
$env:TEMP=(Resolve-Path .test-tmp).Path; $env:TMP=$env:TEMP
node_modules/.bin/tsc.cmd --noEmit
node_modules/.bin/vitest.cmd run --maxWorkers=1
node --test qa/central-postgres-isolated.test.mjs qa/watchdog-export-file.test.mjs server/tests/centralEventTrust.test.mjs
node qa/generate-watchdog-preview.mjs
```

See `docs/central/evidence/` for this checkpoint's exact command output and exit status. Tests named here are local tests; Linux/POSIX sync security, physical Windows/Android use, other browsers and real device interruption remain separate gates.

## Exact automated results for this source

| Check | Result | Evidence |
|---|---:|---|
| TypeScript semantic check | pass, exit 0 | `evidence/v37-typecheck.txt` (empty output is expected) |
| Vite/PWA and Node server build | pass, exit 0 each | `evidence/v37-production-build-final.txt`, `evidence/v37-server-build-final.txt` |
| Complete client Vitest | **1008/1008**, 125 files | `evidence/v37-client-vitest-green.txt` |
| Native QA | **422/422**, 55 files | `evidence/v37-native-qa-clean.txt` |
| Isolated draft PostgreSQL/RLS | pass within native QA | `qa/central-postgres-isolated.test.mjs` |
| Local Chromium release / offline / auth | **3/3 each** | `evidence/v37-browser-release.txt`, `evidence/v37-browser-offline.txt`, `evidence/v37-browser-auth.txt` |
| Full Windows server suite | **349 pass, 43 fail, 1 skipped** of 393 | `evidence/v37-server-windows-final.txt` |

The 43 Windows server failures are the existing POSIX-only path, symlink, file-mode and lock fixtures; they are not security relaxations or a Linux result. GitHub Actions cannot currently supply Ubuntu evidence because [run 40260383936](https://github.com/adjeiemmaaegh-web/tallybook/actions/runs/40260383936) was blocked before checkout by the account billing/spending gate.

Earlier evidence files preserve interrupted or failed runs. The initial native run had eight environment errors: four disposable Git fixtures failed in the sandbox temp directory and four localhost preview requests were denied by the sandbox. Workspace `TEMP`/`TMP` and local loopback permission produced the complete 422/422 rerun. The earlier complete client run passed 1007 and failed one obsolete assertion expecting Dexie v36; that assertion was updated to v37, its focused migration rerun passed, and the final complete run passed 1008/1008. These are distinct runs, not combined counts.

## Handoff when Supabase is active

1. Confirm project `qfyydfxwvifdvffdfgeu` is active. Read live migration history, `public` tables, functions, privileges, RLS policies, Auth provider settings and advisor output. Record exact SQL definitions and project state before any mutation. The previous read-only attempt returned `INVALID_ARGUMENT` while the project was inactive; no live schema conclusion was possible.
2. Create or select a **separate disposable test project** with an isolated Auth user set. Compare its migration baseline with this repository, especially production `businesses/business_members` versus draft `tb_*` tables. Design forward-only migrations; do not reapply old production migrations or overwrite customer data.
3. Implement owner-approved device enrollment: bind one public key to a server-authenticated user, business, shop and staff assignment; store a non-extractable client private key; audit enrollment, key rotation and revocation. Do not use the local `syncDevices` registry as server authentication.
4. Build a transactional ingestion endpoint. Verify the server session and signed event, lock/recheck membership, shop assignment and device status within the same database transaction, enforce unique `(business_id,operation_id)` and `event_id`, store full immutable payload plus digest and server receipt time, and return exact duplicate or conflict. Direct browser finance writes must remain denied by RLS. Reject unknown historical shop/device provenance for central financial posting.
5. Add two-user/two-business and revoked-user/device negative tests against the disposable project: anonymous access, cross-business SELECT/INSERT, forged shop/staff/device IDs, changed payload under the same operation ID, lost ACK retry, concurrent duplicate, revocation race and reconnect after offline work. Then exercise on local browser profiles; keep all live rollout flags off until accepted.
6. Obtain the **actual Watchdog importer repository or executable and its accepted schema**. Feed `qa/fixtures/tallybook-watchdog-preview-v1.json` to it unchanged, record command, exit code, parsed row count, rejected fields and exact importer commit. Negotiate `momo` versus `payment`, UTC day/timezone, null provenance and refund semantics. Update contract and exporter together; preserve old preview compatibility or version the format.
7. Extend transaction-bound local events to shifts, cash counts, no-sale, refunds, purchases and other approved operations; test backup/restore, idempotency, company switch, replay/revocation and actual multi-device convergence. Keep source history immutable and use explicit correction events.

## Completion assessment

This checkpoint advances the **local sale journal**, isolated database authorization test and signed-event verifier. Secure synchronization, trusted enrollment, real Supabase verification and Watchdog importer compatibility remain incomplete. The project remains **NO-GO for production** and no PR or deployment is implied by this checkpoint.

## Later same-day continuation

The user supplied a separate local Watchdog desktop source, and `docs/central/2026-10-26_WATCHDOG_CANONICAL_POS_CHECKPOINT.md` records a tested, partial canonical POS CSV that its importer accepts. This does not complete the full shared event contract or trusted register/device provenance. A fresh read-only `get_project` call still returned `INACTIVE` for Supabase project `qfyydfxwvifdvffdfgeu`; the live handoff steps above remain pending. The original v37 test counts above describe the earlier checkpoint; newer exact-source results are in `docs/central/evidence/watchdog-canonical-verification-2026-10-26.md`.
