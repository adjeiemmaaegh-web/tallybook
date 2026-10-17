# Tallybook V19 Run 20 — Staging, Incident, Recovery and Rollback Playbook

**Authored:** 17 October 2026  
**Status:** SOURCE-ONLY PROCEDURE / NOT EXECUTED / NO EXTERNAL STAGING APPROVED / NO-GO

This procedure does **not** grant approval for creating a cloud account, changing production DNS, uploading merchant data, running payments, enabling public commerce, sending test transactions to a real provider, merging to `main` or deploying to staging/production. No environment exists merely because a proposal or command appears below.

## Stage 0 — independent authorization and named responsibilities

A future owner must separately approve: exact Git commit, purpose, infrastructure owner and account, country/region, per-month budget ceiling, access allowlist, hostname/TLS and certificate issuer, incident operator and deputy, encrypted backup retention/location and deletion policy, legal/privacy approval, monitoring boundaries and allowed diagnostic accounts. Provider sandbox credentials and real-payment activation require **another** explicit written approval, never implied by infrastructure approval.

Roles: **owner** approves scoped changes and holds the independent encrypted backup; **release operator** is accountable for execution logs, rollback and secrets; **finance reviewer** reconciles sale/credit/supplier/tax; **security reviewer** checks authorization and network protection; **hardware/UAT reviewer** reconciles physical observations and source SHA. One person may occupy multiple roles only if the owner explicitly accepts that segregation risk in a future approval record. No unverified handwritten names in a Run 20 JSON file count as authorization.

Before any staging, verify a clean disposable **synthetic** test dataset. Do not use a real merchant backup, phone number, customer name, supplier account, secret or payment key. Maintain locally verifiable hashes of the release source, lockfile, build artifacts, encrypted staging snapshot and rollback candidate.

## Stage 1 — compile and test against an immutable source candidate (FUTURE QA)

On a disposable authorized system, later separately run all native, client, semantic TypeScript, production build and browser tests on the **exact candidate SHA**, including old-schema migrations, offline PWA caches, recovery markers, cross-tab, store stock, refunds, supplier/tax/credit, accessibility, malicious backups and provider mocks. Do not reuse earlier Run 1 green results as proof for Run 20. Retain command, stdout/stderr, exit code, OS/Node/pnpm/browser version, SHA and artifact digest. Any skipped, blocked, unexecuted or failing check remains open.

The owner must separately execute the Run 19 Windows/Android/scanner/printer/WebAuthn/device matrix. Source-only mock/payment checks cannot replace actual provider or hardware acceptance. Ensure the 82 historical acceptance units and 47-blocker register are fully reconciled to their real source records, not restated as a percentage.

## Stage 2 — preflight backup and freeze (FUTURE authorized staging)

1. Establish a short release freeze and communicate to operators. Record which company profile and database schema will be tested.
2. Export an encrypted backup of each **disposable staging company**, verify the actual downloaded file by opening it with the correct passphrase in another disposable profile, retain the SHA-256 separately and verify original records/assistant history, store balances, refund snapshots and journal links. Backup/export receipt alone is not proof that files were copied off-device.
3. Preserve the prior app source/build and **browser/database copies**. Installing an old UI against a newer IndexedDB schema is NOT safe rollback; opening a database may irrevocably upgrade its schema. Restore only into a fresh/isolated profile that has the verified compatible schema or run a separately reviewed migration. Never downgrade live customer data in place.
4. Verify no pending Run 7 restore/clear recovery marker, no active POS transaction or outstanding payment confirmation, no store transfer in-flight. If any exists, **STOP** and recover first.
5. Review package license obligations and security dependency audit/SBOM; do not treat an auto-generated manifest as vulnerability clearance.

## Stage 3 — proposed isolated staging (REQUIRES EXPLICIT OWNER ACTION)

See `docs/release/STAGING_PROPOSAL.md` and `docs/release/OPERATIONS.md` for the proposed Ubuntu/Node, TLS and local-preview design. No external provisioning or hosting account should be inferred. Future staging must be private, synthetic, access restricted, with minimum privileges, no production cloud membership and no real provider credentials. Bind staging financial-write flags OFF and maintain separate secrets outside Git and chat. Require TLS and host/network isolation for anything not on localhost. Do not configure broad public rewrite routes as proof of customer-facing authorization. No webhook, live MoMo, merchant bank reconciliation, remote corporate tenant synchronization or production public storefront is approved.

Release operator later captures: approved ticket ID, original/candidate commit and artifact hashes, third-party licenses, exact host/region, service account, DNS/TLS validation, database schema, deployed config fingerprint with sensitive values redacted, monitoring setup, rollback package hash and the source of every synthetic record. Never put a raw session cookie, PIN, API key, phone number or live customer ID into a log.

## Stage 4 — observability and readiness monitoring (FUTURE)

Monitoring must report **observable facts**, not financial or fraud conclusions: heartbeat and uptime, app shell/cache version, origin/TLS health, process memory/CPU/disk pressure, server API error/latency trend, queue pending/acknowledged separate from remote provider settlement, scoped local recovery journal presence, duplicate submission conflicts, cross-tab contention and backup verification age. Diagnostics currently available on `/release-operations` are *per-device local observations*, not remote monitoring or a remote admin console.

Use alert severities: **P0** potentially corrupted money/stock ledger, cross-tenant exposure, duplicate financial posting or leaked secret; **P1** persistent blocked recovery, unusable POS, broken backup/restore, locked-out owner; **P2** degraded report, optional sync, low-memory performance or accessible UI failure. Any credible P0 or P1 financial-integrity problem is a stop/revert decision, not “temporarily pass.”

Never automatically export browser IndexedDB contents, audio, credentials or assistant histories. Logs should minimize PII and include only stable correlation IDs and UTC timestamps. Owner decides retention and approves monitoring vendor, access policies and retention before enabling cloud telemetry.

## Stage 5 — incident response and operator stop conditions

1. Detect incident; **stop new financial write attempts and external traffic** if needed, retaining evidence and local encrypted backups.
2. Identify actual affected company/store/device and exact installed source. Do not infer a user is involved in theft from a stock anomaly, pending delivery or unsourced video.
3. Classify severity, isolate devices/networks if necessary and preserve redacted logs; do not tell an operator to delete IndexedDB, app data or recovery markers. For a suspected compromised owner/admin session, revoke session/access using an independently verified trusted channel before further finance changes.
4. For a pending cross-database restore, follow the application's recovery procedure under the exclusive Web Lock before any unrelated write; do not edit the marker by hand.
5. For a failed provider operation, treat remote settlement outcome as **unknown** until directly reconciled with the provider/bank under a separately approved procedure. Never repeat live charges or refunds based merely on a browser timeout.
6. Do not replace a company's refund policy, recompute historical tax/COGS from today's configuration or invent old store attribution.
7. Record UTC start/end, user-visible impact, exact source/SHA, data hashes, decision-maker, observed cause, contained actions, unaffected records and a follow-up fix/owner acceptance task.

## Stage 6 — rollback versus recovery (FUTURE only)

**Application rollback** restores a previously reviewed build on a disposable profile **without changing historical financial data**. If schema advanced, restore original pre-upgrade snapshot only to a fresh, compatible profile after verifying a complete backup and business-ledger conservation. Do not install a lower schema app against upgraded IndexedDB or overwrite a customer's live historical records.

**Data recovery** is separate: validate backup envelope, company ownership, schema contract, products, stock entries, sale/receipt/payment relationships, customer debt, supplier payables, tax snapshots, assistant history and any pending journal. Compare at least record counts, critical identities and financial conservation before and after. Stop if there is a missing or orphan transaction; there is no automatic partial "best effort" restore of financial data.

**Staging revert rehearsal** must record exact reverted build SHA, time to restore service, whether the PWA cache still points to old chunks, and whether encrypted backups and secret rotation survived. A successful synthetic revert cannot certify recovery of an untested real merchant database.

## Stage 7 — independent final go/no-go (FUTURE only)

Run 20 source deliberately exports only **NO-GO worksheets** with strict exact-SHA status claims and SHA-256 file integrity. Every Run 20 gate must be supported by independent *original* evidence, full historical blockers and acceptance traces, owner and reviewer signatures outside this tool and a **separate explicit release authorization** that specifies the actions allowed. A manually entered PASS, local browser integrity check, hash-matched JSON, GitHub commit, stage completion or human verbal enthusiasm **never** enables staging, cloud, real payments or production.

**Current status:** No staging provisioned or tested. No rollback tested. No monitoring configured. No owner signoff. Full release remains **NO-GO / INCOMPLETE**.
