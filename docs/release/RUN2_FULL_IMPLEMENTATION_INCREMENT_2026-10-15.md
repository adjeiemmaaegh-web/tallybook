# Tallybook V19 — Run 2 whole-run implementation increment
**Date:** 2026-10-15
**Repository:** `adjeiemmaaegh-web/tallybook`
**Branch:** `v19/run2-transactional-recovery-20261015` / draft PR #13
**Initial checkpoint:** `27880c4857df689a323832136fd7f6d6d27dd517`
**Source checkpoint before this handover:** `d54c9b9a0eff80bf18a12c7c2c7dfa1448bb4df8`
**Release decision:** NO-GO. Run 2 ACCEPTANCE NOT PASSED.

## Owner's revised engineering cadence (2026-10-15)
Deliver the **entire run's source work as one development increment** rather than stopping after each individual fix. If actual test equipment, database, browser, or CI execution is unavailable, **document the exact deferred tests and continue implementing the run**. Acceptance remains evidence-based: never record PASS for tests not executed. Future implementation runs may be prepared without representing older runs as accepted; the original sequential 20-run order remains the acceptance order until an owner-approved new release gate is documented. Do not allow an unverified security feature into commercial use.

## Source delivered in this whole-run increment

### Evidence lifecycle and reviewer authorization
- `server/run2EvidenceService.mjs`: authenticated owner requests a new pending evidence case; a distinct active reviewer approves against live company/membership and reviewer session checks; owner/reviewer may revoke a pending or verified record. Reviewer cannot also be owner or intended recipient. Requests, status changes and audit append are performed inside the existing SERIALIZABLE store transaction.
- `server/recoveryApprovalPostgres.mjs`: private parameterized SQL for pending insert, FOR UPDATE case read, status-conditional verification/revocation, and evidence-audit append.
- `server/run2ReviewerProvisioning.mjs`: privileged, non-HTTP, independently co-approved two-operator reviewer enrollment and durable approval audit. Its `verifyOperatorApprovals` dependency must be backed by a real operator signature/approval directory before actual provisioning; it is not a browser request parameter.
- `docs/security/STAGE9_RUN2_VERIFIED_RECOVERY_SCHEMA_REVIEW.sql`: **review-only, unapplied** pending/verified/consumed/revoked evidence, reviewer approval and event audit tables, pending-by-default status, kind-specific digest checks, strong null checks, reviewer/recipient exclusion, forced RLS and denied browser-role privileges. Not applied to the live project.

### Independent backup/restore and owner-approved linking
- `server/run2RestoreDrill.mjs`: trusted adapter verifies a single-company backup, imports into a separately created empty disposable store, re-exports, checks company identity and digest parity, destroys the disposable store and returns linked SHA-256 evidence only on success. This is an **adapter contract**, not itself a real browser restore execution: an actual isolated browser/Dexie/assistant-store implementation of `makeIsolatedStore` is still needed before production evidence can be issued.
- `client/src/features/security/run2OwnerLink.ts`: validates explicit typed local company name and an existing Tallybook backup, submits owner-confirmed binding to the private API over HTTPS, validates the returned company/owner IDs and never modifies IndexedDB or grants cloud data permissions.
- `client/src/cloud/Run2OwnerLinkPanel.tsx`: preview component with a typed company-name check and server-approved recovery ID, designed for the optional cloud account panel. **The panel is not mounted in the active navigation**; it must be integrated and browser-tested before enabling any linking UI.

### Private HTTP/service composition
- `server/companyOwnershipCoordinator.mjs`: exposes `requestRecoveryEvidence`, `verifyRecoveryEvidence`, `revokeRecoveryEvidence` in addition to existing transfer/binding and one-use recovery approval.
- `server/run2OwnershipRoutes.mjs`: narrow operation allowlist, bearer token forwarded to server-only resolver, direct-TLS requirement, exact Origin check, request-shape validation, basic per-address throttling and generic denial errors.
- `server/run2ServerAssembly.mjs`: composition point for an independently provided Supabase Auth client, private PostgreSQL pool, and trusted restore verifier in an approved isolated environment.
- `server/index.ts`: adds the route surface but **registers it disabled**. There is no production private-pool connection/credential initialization. This source increment intentionally does not activate a live endpoint, cloud writes or application sign-in requirements.

### Tests authored
- `server/tests/run2EvidenceService.test.mjs` — 8 cases: owner request, reviewer verification, no verifier, replay, revocation, stale session, audit rollback, independence and transfer.
- `server/tests/run2RestoreDrill.test.mjs` — 5 cases: source/destination digest parity, tampering, cross-company reject, nonempty-store reject, cleanup.
- `server/tests/run2OwnershipRoutes.test.mjs` — 5 cases: feature disabled, TLS/origin, invalid parameters, binding dispatch, review dispatch.
- `server/tests/run2ReviewerProvisioning.test.mjs` — 4 cases: distinct operators, approval denial, atomic audit and rollback.
- Prior Run 2 JWT expiry and reviewer self-approval regressions remain in place.

**Actual execution on the new modules:** 18 focused checked-in cases executed with a V8 compatibility harness using synthetic crypto/Node API shims. Initial V8 structuredClone shim omission caused one harness-only failure; the five restore cases were rerun after correcting the harness and all passed. Four reviewer provisioning cases separately passed under a V8 mock SQL harness. **22/22 new focused cases have compatibility-harness pass evidence across those runs, not a native Node result.** The older 53/53 focused V8 suite applies only to its earlier pinned checkpoint.

## Deferred QA — record as NOT EXECUTED, not PASS
1. Native `node --test` on all 20+ Run 2 modules; locked pnpm install; full Node QA, Vitest, semantic TS, Vite/Express builds, pnpm audit; verify at final exact SHA.
2. Real Supabase Auth and private PostgreSQL isolated project: actual RLS, privilege setup/migration review, reviewer bootstrap, owner and attendant accounts in two tenants, foreign IDs, session expiry/revocation, lock contention, serializable retry and rollback, parallel one-use evidence and owner transfer.
3. Real isolated offline backup/restore using the existing `parseBackup`/`restoreBackup` implementation with an independent browser profile/device, assistant and retail IndexedDB, verified source/post-restore parity, crash/journal recovery, and proof that unrelated companies and preexisting local records remain untouched. The disposable-store factory must be backed by this real environment, not a mocked `snapshot()`.
4. Actual authorized operators' signed reviewer approval verification, independently documented owner intent and independent reviewer sign-off; no reviewer/user should be silently provisioned.
5. Native frontend review and wiring of the Run 2 owner panel, end-to-end HTTPS origin/session/token test, CSRF/rate limits, UI sign-out/switch/revocation races, offline-only regression.
6. Recheck historical main/security/Stage 9 branch divergence, plus 47 blocker / 82 acceptance-unit classifications, without attributing historical workflow PASS to final branch. Exact-head GitHub Actions currently failing before job steps.

## Source integration limitations (NOT merely test availability)
- The actual browser-backed independent restore worker / secure server archive loader is not installed or configured. Without it, restore-case verification is fail-closed.
- The operator signature/approval directory feeding the provisioner is not supplied. Without it, reviewer enrollment must remain unavailable.
- The owner-link panel has been written but is not mounted. The private PostgreSQL runtime is injectable for approved isolated testing, but the running app intentionally registers the endpoint disabled; private driver/credentials and secure runtime activation are unconfigured.
- The proposed schema is an unexecuted review artifact. Its migration/up/down, RLS and performance behavior remain unverified on actual PostgreSQL.
- Therefore **do not state that Run 2 is fully functional, accepted or release-ready.** This is the broad Run 2 source implementation increment, with explicit remaining integration and proof work.

## Restrictions
No production Supabase SQL, passwords, service-role keys, financial changes, cloud data replication, payment, merge to `main`, staging, or deployment. Draft PRs remain draft. The next coding round may proceed under the owner's revised whole-run cadence; all deferred Run 2 acceptance evidence must still be collected before commercial release.
