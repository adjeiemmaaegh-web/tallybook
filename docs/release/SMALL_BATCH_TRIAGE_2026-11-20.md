# Tallybook branch triage and small-batch integration — 20 November 2026

Baseline for this triage: `main` at `b0336c0faf5fcd5325c5209fe489abd065120391` (PR #107 and #108 merged).

## Safe cleanup candidates (do not merge again)

The following eight branches were verified **zero commits ahead of main**:
- `development/v19-friends-web-test`
- `fix/assistant-reversal-preview-identity-20261113`
- `fix/physical-return-store-provenance-20261113`
- `release/fresh-start-required-signin-20261113`
- `release/shared-shop-ledger`
- `security/mandatory-online-account-boundary-20261113`
- `v19/run4-session-lifecycle-20261016`
- `v19/run11-company-refund-policy-20261016`

Two recently squash-merged branches are also cleanup candidates. Both changed blobs on each branch were checked against `main` and found identical:
- `fix/staff-refresh-ordering-20261120` (merged PR #107)
- `fix/tls-file-read-and-peer-check-20261120` (merged PR #108)

`codex/road-to-complete-security-triage` is **commit-identical** to the canonical open PR #105 branch `codex/road-to-complete` and needs no parallel merge. Verify that no CI or recovery workflow references it before deleting the alias.

**Keep:** `backup/main-before-stakeholder-2026-10-30-ea165a5` as a historical recovery point. Keep the canonical `codex/road-to-complete` branch and PR #105, the source-validation checkpoint branches, and all branches with unresolved unique work until semantic review. `claude/cool-ride-cf8i8r` is five commits behind the canonical PR #105 branch (zero ahead), but retain temporarily until the canonical branch is integrated and evidence retention is confirmed. PR #85 has fresh-start and deletion policy decisions and must stay separate.

## Controlled integration batches

1. **Security utilities / regression tests (this PR):** bounded response/file reads, no live app call-site rewrites.
2. **Server security wiring:** review API throttling, audit and tenant routing, test authenticated/unauthenticated denial, and validate the exact merge candidate.
3. **Employee and tenant authorization:** access revocation, staff session concurrency, shared-device accountability, cross-business negative tests; no live auth policy flips without acceptance.
4. **Inventory correctness:** stocktake, reservations, transfers, interrupted writes, and double-post prevention, with recorded conservation invariants.
5. **Financial correctness:** refund and mixed-tender evidence, receipt identity, COGS/cost ledger reconciliation, strictly idempotent flows.
6. **Backup, offline and recovery:** multi-device restore, migration rollback, sync retry/outbox exact-once evidence, disaster recovery proof.
7. **Commerce/reporting expansion:** prioritize after correctness, identity and recovery; live provider payments require separate commercial/security approvals.

### Go/no-go rules

- Do not bulk-merge 195-file PR #105.
- Do not treat previous passing PR-branch CI as approval of a newly extracted commit.
- A passing test suite is necessary, not sufficient for production deployment or financial correctness.
- Do not delete any branch ahead of `main` solely because its name or age suggests redundancy. Validate exact equivalence or preserved successor and remaining workflow references.
- Keep branch cleanup separate from production deployment, data migration, live settlements, reset operations and authorizing a public commercial release.
- Run the full applicable six-workflow CI suite, review the result on the exact branch and recheck mergeability before merging.
