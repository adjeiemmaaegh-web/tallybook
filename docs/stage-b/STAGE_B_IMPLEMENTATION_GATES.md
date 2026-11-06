# Stage B — Offline integrity and financial controls
Baseline: 0314873bf0f7e30ad8612b51be77f0a5107612d0
Branch: stage-b-offline-integrity-20261106
Status: IN PROGRESS / NOT ACCEPTED (2026-11-06)

This branch was created without touching production. No code modifications or tests are represented as complete.

## Mandatory implementation gates
1. Queue: replace shared-shop localStorage read-modify-write with transactional, account/company-scoped durable storage. Preserve submission keys and server idempotency. Migrate legacy entries non-destructively; corrupted legacy data must be quarantined rather than silently discarded.
2. Privacy: define browser threat model, encrypt sensitive offline data with a recoverable, user-controlled key lifecycle; verify account switching, sign-out and lost-key behavior before migration.
3. Refunds: inspect existing local return-policy implementation and cloud RPC; enforce company-specific server-side policy, historical snapshots, permissions and audit without bypassing statutory obligations.
4. Finance: reconcile sale/refund, stock, tender, receivable, payable and repayment flows; rollback on failure.
5. Access: enforce cloud authorization on the server, and validate offline returning-user access without trusting cached UI roles.
6. Verification: execute exact-commit unit/integration tests, concurrent two-tab IndexedDB tests, crash/reconnect recovery, Supabase rollback tests and browser checks. Record command, environment, result and SHA.

## Non-negotiable safety
- No automatic deployment, production migration, payments or real financial writes.
- Device-local ledger and cloud shared-shop have distinct synchronization semantics.
- No feature may be called finished solely because source files exist.
- Stage B exits only after B1–B6 evidence is attached and reviewed.

## Current evidence
- Stage A report: Tallybook_Stage_A_Baseline_Assessment_2026-11-06.md (conversation artifact).
- Shared shop outbox: client/src/cloud/shopOutbox.ts — localStorage write-ahead queue, non-atomic read/modify/write.
- Shared shop cache: client/src/pages/SharedShopPage.tsx — localStorage cache.
- Local sync diagnostics: client/src/pages/SyncStatusPage.tsx — automatic record upload not configured.
- Cloud refunds: supabase/migrations/20261105120712_shared_shop_full_till.sql — server RPC exists; policy parity unverified.

## Current completion status
B1 NOT IMPLEMENTED; B2 NOT IMPLEMENTED; B3 NOT IMPLEMENTED; B4 NOT VERIFIED; B5 NOT VERIFIED; B6 NOT EXECUTED.
