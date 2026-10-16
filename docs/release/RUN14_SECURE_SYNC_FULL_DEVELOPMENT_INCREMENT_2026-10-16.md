# Tallybook V19 — Run 14 / Optional Secure Sync — Consolidated Source-Development Increment

**Date:** 2026-10-16 (Asia/Dubai)  
**Branch:** `v19/run14-secure-sync-development-20261016`  
**Based on source-complete but unaccepted Run 13:** `v19/run13-multistore-development-20261016`, SHA `1564457bd18727916c3ca51df4dd5312834f2cc9`.  
**Implementation source SHA before this documentation commit:** `db20c322acc333ca3a9a1dda4a647c49011169a8`.  
**Classification:** **Run 14 secure encrypted replica transport, offline queue, replay/conflict controls and owner-review source implementation delivered.**  
**Acceptance:** **NOT TESTED, NOT ACCEPTED, NOT PRODUCTION-READY**. No tests, builds, CI, typechecks, browser QA, staging or Windows checks were run, by explicit owner instruction.  
**Release:** **NO-GO**. No production merge, Supabase mutation, live payment, secret provisioning, cloud enrollment or external deployment has been performed.

## Scope and security promise

Run 14 builds *optional, encrypted, integrity-checked, company/device-authenticated replication of immutable source evidence* between authorized devices with local quarantine, conflict review and crash-safe append-only server delivery. It does **not** silently merge or execute financial facts received from another device. Multi-device cashier checkout and server-authoritative distributed stock convergence remain disabled pending formal finance/tenant reconciliation and owner approval. That restriction is an intentional security requirement, not evidence that a remote receipt is financially committed.

All normal local retail work continues offline without the sync service. Encrypted relay is a separate manual, opt-in workflow. No auto timers, polling, background upload or automatic financial replay have been enabled.

## Source implementation delivered

1. **Database migration 29 → 30**, `client/src/db/TallybookDB.ts`: adds isolated `syncReplicaOutbox`, `syncReplicaInbox`, `syncReplicaCursors` and `syncReplicaConflicts` tables. Company/device/sequence and operation keys are uniquely indexed. No migration rewrites old business money, inventory, sale or transfer records. Old local data remains the source of financial truth.
2. **Browser encryption**, `client/src/features/sync/run14Crypto.ts`: uses WebCrypto PBKDF2-SHA256 (310,000 iterations; fresh random 16-byte salt), AES-256-GCM (12-byte random nonce), authenticated associated data binding company, origin device, event identity, operation, per-device sequence, prior ciphertext digest and event timestamp; SHA-256 ciphertext fingerprint; strict canonical Base64/JSON, size and record-kind validation. The user-provided shared passphrase is never written to IndexedDB, localStorage or transport. Remote records explicitly declare `automaticFinancialPosting:false`.
3. **Offline encrypted local queue/inbox**, `client/src/features/sync/run14LocalRelay.ts`: deliberate staff-authorized snapshot of one existing saved company ledger source, encrypted outside Dexie transactions; fresh immutable per-device sequence and previous-digest chain; recheck company, source record, consent, device and previous journal head inside coordinated write transaction. Incoming pages require authenticated decryption before IndexedDB commit, complete origin chain and global cursor verification, duplicate detection and tenant isolation. Received encrypted copies stay quarantined with `financialApplied:false`; read-only decrypt requires reports permission.
4. **HTTPS transport and conflict trail**, `client/src/features/sync/run14RelayTransport.ts`: clean HTTPS endpoints, direct single-request POST/GET, no redirects, no cookies, `no-store`, no background retry; strict content types and reply identity checks, durable same-ciphertext receipt verification, source ordering, local reauthorization immediately before network requests, and atomic local acknowledgements. Remote conflicts create immutable local conflict evidence. Company owners can append an audited review decision without changing ledger events. A trust failure leaves the original event pending.
5. **Encrypted server store**, `server/run14EncryptedReplicaStore.mjs`: append-only encrypted-only JSONL journal with canonical payload check, ciphertext SHA-256 check, 48 KiB per-event ciphertext limit, 80 MiB file guard, exclusive private inode lock with bounded contention, file sync, no symlink following, fail-closed damaged-file handling, per-company event/operation idempotency and per-device ordered previous-digest chain; bounded, cursor-based ciphertext-only read.
6. **Trusted authorization**, `server/run14EncryptedRelayBoundary.mjs` and `server/run14EncryptedCapabilityIssuer.mjs`: independent five-minute read/write HMAC capabilities issued only for an active, server-verified human session, active organization membership and enrolled non-revoked server-side device. All relay writes/reads recheck authentication, exact tenant and device; browser identity or local device registration is not trusted. An additional **server-owned organization `replicationOptIn:true`** must be provisioned; absent consent denies token issuance and every request.
7. **Explicitly gated server HTTPS routes**, `server/index.ts`, `server/syncHttps.mjs`, and declaration boundaries: `POST /api/sync/replication/capability`, `POST /api/sync/replication/events`, `GET /api/sync/replication/events?after=N`. Direct TLS, bounded body, 40 requests/minute per source IP limiter and generic denial responses. The server feature is **off unless specifically configured** and hard-blocked for `NODE_ENV=production` in this review increment. Existing Stage 8 metadata-only sync remains separate. No internet endpoint was deployed.
8. **Operator interface**, `client/src/features/sync/Run14EncryptedRelayPanel.tsx` and `client/src/pages/SyncStatusPage.tsx`: explicit local consent/device, select an existing evidence record, enter passphrase for local AES-GCM preparation, view pending/inbox/conflicts, optional short-lived capability request, one-event send/one-page pull, read-only copy inspection and owner conflict review. The **client network release flag stays `false`** so source/UI is staged without any remote transfers. Credentials and passphrases are component memory only; input state is reset on company changes.
9. **Restore lifecycle**, `client/src/features/backup/backup.ts`: version-30 encrypted relay caches/cursors/conflict notes are deliberately not promoted to portable authoritative ledger facts. A portable restore atomically purges local replica outbox/inbox/cursors/conflicts, sets local sync consent off and revokes restored local devices; company deletion already deletes all company-indexed tables, including the new caches. Remote resumption requires separately trusted identity and full replay, not silently reused recovered device secrets.
10. **Type declaration alignment**: added declarations for all new server `.mjs` imports and updated `syncAuth.d.mts` and `syncHttps.d.mts` to match new scopes and transport safety flags. No tests or compiler invocations occurred.

## Reviewed risks and source-level corrections

- Type/interop: copied WebCrypto input into exact `ArrayBuffer` values for browser typing; fixed canonical Base64 decode; typed server ESM interfaces.
- Server auth: eliminated local-only consent as remote authorization; required separate server-side explicit opt-in, human session, active membership, active enrolled device and capabilities with separate read/write scopes. Updated session headers to include the signed `Bearer` syntax expected by the existing server verifier.
- Transport: prohibited insecure URLs, redirects, credentialed fetch, stale local permission at send, tampered/mismatched receipts and silent automatic retries. A failed or uncertain request remains pending for explicit inspection.
- Replay: enforced company and per-device sequence / prior-digest conservation; detected duplicate IDs and operation conflicts, cursor gaps, previously corrupted inbox chains and truncated server JSONL, with no last-write-wins financial resolution.
- Concurrency: added bounded retry of cooperative server file-lock contention, while refusing stale-lock breakage; use coordinated IndexedDB cross-tab retail writes for queue/inbox/ack and owner conflict-review transactions.
- Restore: cleared nonportable encrypted relay caches and revoked restored device registrations so an imported backup cannot silently acknowledge or reuse a prior machine's remote history.
- Remote conflicts: receipt rejection and owner-reviewed conflict trail never alter a sale, inventory movement, payment, tax, staff permission, refund or transfer request.
- Production: maintained double fail-closed network flags and independent server consent; `NODE_ENV=production` disallows the file-directory-backed relay, which is not a commercial identity backend.

## Current activation controls and limits

| Gate | Source state | Signoff |
| --- | --- | --- |
| Browser remote relay | `RUN14_NETWORK_RELEASE_ENABLED=false` | Not authorized |
| Server encrypted relay | `TALLYBOOK_RUN14_ENCRYPTED_RELAY_ENABLED` unset/false; production hard-denied | Not authorized |
| Server org consent | `replicationOptIn` defaults false | No trusted enrollment performed |
| Tenant/device authentication | Signed short-lived capability and independent session/directory required | Runtime/evidence unverified |
| Financial data auto-merge | Explicitly disabled; encrypted remote records quarantined | Not authorized |
| Run 13 store transfer activation | Stays separately disabled | Not accepted |
| Production cloud/SQL/staging/payments | Not changed | Not authorized |

**Functional boundary:** Run 14 delivers an encrypted, authenticated event-copy relay and local read-only reconciliation/review *source*. It does not provide a trusted distributed transaction coordinator, instant multi-device merchant POS, or fully converged shared monetary database. Claiming live financial synchronization from this source alone would be misleading and unsafe.

## Deferred acceptance matrix — planned only, ZERO cases executed

| ID | Required owner-authorized evidence | Execution |
| --- | --- | --- |
| R14-01 | Clean Node 24 / pnpm TS check, client build and native syntax | Not run |
| R14-02 | Real Chromium/Edge WebCrypto AES-GCM and PBKDF2 decrypt/restart on Windows 8 GB CPU | Not run |
| R14-03 | Successful opt-in consent, local device registration and disabled-consent denial | Not run |
| R14-04 | Separate server-approved opt-in, scope-locked capability issue, revoked member/device/session denial | Not run |
| R14-05 | HTTPS direct TLS, malicious redirect/proxy/session/capability replay denial | Not run |
| R14-06 | Exact ciphertext retries, duplicate operation conflict, out-of-order device sequence and fork | Not run |
| R14-07 | Unreliable connectivity, ack-loss and interrupted server append/crash without false local ack | Not run |
| R14-08 | Cross-company/actor/device isolation and tampered GCM tags, nonce, digest, timestamps and AAD | Not run |
| R14-09 | Concurrent two-tab queue, send, owner consent disable and revocation races | Not run |
| R14-10 | Page cursor gap/skip, duplicate remote event, malformed inbox history and oversized response denial | Not run |
| R14-11 | Backup export/restore/rollback, revoked restored device, confidential local caches excluded | Not run |
| R14-12 | Owner-reviewed conflict audit without any remote financial writes | Not run |
| R14-13 | Reconcile Run 13 store stock, refund/FIFO/tax/credit against remote copies without auto-post | Not run |
| R14-14 | Legitimate and malicious low-spec Windows/Android/iOS offline-to-online trials | Not run |
| R14-15 | Approved private production-grade membership/RLS/session service and deployment review | Blocked |

The historical V19 82 acceptance units and 47 release blockers have **not** been reclassified by these unexecuted changes. No test pass, browser proof, rollback drill or readiness approval is claimed.

## Handover / next development run

- Keep this Run 14 branch separate from `main`, Run 13 and production. Do not enable either network flag or remote finance posting.
- User-approved source-development-before-testing workflow allows **Run 15 source planning only to the extent an external payment provider, sandbox credential or regulated money action is not assumed**. Run 15 gateway-specific implementation requires explicit provider selection and sandbox authorization; without that, a provider-neutral mock-only contract can be authored but no real gateway may be linked.
- Source delivery is not a production guarantee. Real-device, database/authorization and end-to-end verification remain mandatory before commercial release.
