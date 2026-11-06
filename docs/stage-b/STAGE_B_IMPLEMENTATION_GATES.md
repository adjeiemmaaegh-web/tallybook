# Stage B — Implementation and evidence register
Date: 2026-11-06
Base: `0314873bf0f7e30ad8612b51be77f0a5107612d0`
Branch: `stage-b-offline-integrity-20261106`
Review: [Draft PR #26](https://github.com/adjeiemmaaegh-web/tallybook/pull/26)
**Stage B acceptance: NOT PASSED. DO NOT MERGE, MIGRATE OR DEPLOY.**

## Source delta assessed
- `client/src/cloud/shopOutbox.ts`: transactional per-sale Dexie/IndexedDB queue, keys scoped by account + company, strict idempotency key validation, duplicate request disagreement refusal, write before send, legacy v1 localStorage migration, quarantine on invalid legacy data, exact receipt-key matching. Additional fail-closed guard blocks corrupted rows without deleting recovery evidence.
- `client/src/cloud/shopOutbox.test.ts`: race, recovery, legacy, rejected receipt, quarantine and corrupted IndexedDB regression cases authored.
- `client/src/pages/SharedShopPage.tsx`: async queue/UI integration; strips customer/team personal fields and cached staff permissions from offline catalogue cache. Product/stock data is NOT encrypted.
- `supabase/migrations/20261106120000_shared_shop_return_policies.sql`: **UNAPPLIED** forward-only migration for per-company return-policy revisions, defaults disabled, sale-time terms, refund authorization and historical evidence, existing-credit and stock posting retained by draft SQL.
- `client/src/cloud/ShopRefundPolicyPanel.tsx`, `client/src/cloud/shopClient.ts`: draft owner policy editor and RPC types.
- `qa/shared-shop-refunds-import.test.mjs`, `qa/shared-shop-full-till.test.mjs`: PGlite integration regressions authored, not certified.
- `.github/workflows/stage-b-qa.yml`: exact Node/pnpm Vitest, PGlite, tsc and build commands declared; a workflow file is not a test result.

## Workstream statuses (source present is not acceptance)
| Gate | Engineering checkpoint | Evidence status |
|---|---|---|
| B1 Queue persistence, idempotency, legacy migration | Implementation authored on branch | UNVERIFIED: actual crash, multi-tab and browser QA |
| B2 Encrypted working data, key lifecycle, secure migration | Redaction only; backup encryption is separate | **NOT IMPLEMENTED**: shared-shop pending-sale payloads and catalogue remain plaintext at rest |
| B3 Company-specific cloud refund authorization | SQL migration/UI/tests authored | UNVERIFIED: no live or isolated SQL integration pass confirmed at this exact head |
| B4 Financial conservation / rollback / payable scope | Existing finance logic preserved in draft migration; tests authored | UNVERIFIED: no independent reconciliation attestation |
| B5 Auth and cross-account boundaries | Server RPC membership guards and per-company account scoping; cache redaction | UNVERIFIED: security tests, revocation, concurrent devices and offline login |
| B6 Test and acceptance | CI workflow configured | UNVERIFIED: exact-head passing Vitest, PGlite, build, browser and real-device evidence missing |

## Blocking investigations and implementation work
1. Design owner-controlled encryption and **recoverable** key lifecycle for queued sales, especially unattended offline tills and account switching. Avoid deleting or re-encrypting legacy data before verified recovery. Do not mistake encrypted export-backups for encrypted working storage.
2. Execute GitHub Actions to completion and attach run URLs, job logs, exact head commit and outcomes. Correct any failing tests. Verify new migration against full preexisting schema.
3. Independently confirm full/partial refunds conserve tender allocations, stock and customer credit, and no false claims of external MoMo/card payouts. Evaluate refunds and statutory consumer rights by jurisdiction.
4. Two tabs (simultaneous queues), reload during writes, offline/reconnect, browser eviction/storage quota, corrupted records, stale role cache and account switching, two real accounts on two devices.
5. Use an owner-approved staging environment for SQL migration drill; **no production migration** without explicit authorization.

## Safety / disposition
Production deployment and database unchanged. A draft PR is for review, not approval. No commercial release claim.
