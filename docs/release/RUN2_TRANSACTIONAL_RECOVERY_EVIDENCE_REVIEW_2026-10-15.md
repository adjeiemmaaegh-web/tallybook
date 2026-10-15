# V19 Run 2 — transactional trusted recovery evidence continuation

**Date:** 2026-10-15  
**Branch:** `v19/run2-transactional-recovery-20261015`  
**Parent:** `stage9/round1-enrollment-lifecycle-20261015` at `359ea1666225d802629f868c52af48ef283f2b02`; that branch preserves the earlier integrated Stage 9 security fixes.  
**Code/test checkpoint:** subsequent review hardening through `98b2caa56ae9d65cd0fef3c0a405ebf81cf787eb`, followed by documentation. Record the final PR HEAD separately when doing full acceptance.  
**V19 Run 2:** **OPEN / NOT PASSED**. **Stage 9:** **NO-GO / INCOMPLETE**.

## Root cause / design review

The previous `createTrustedRecoveryIssuer` checked an external `verifyRecovery()` callback and reviewer flag **before** the PostgreSQL SERIALIZABLE transaction that created an ownership approval. Without an independently locked, transaction-local evidence and reviewer record, a previously valid reviewer or receipt could be revoked, changed or reused between review and approval.

This continuation replaces the callback-only trust assertion with a database-bound private verification contract. **A backup receipt digest is not proof that a genuine restore was independently verified.** A separate trusted human/restore evidence issuance process is still essential.

## Implemented

1. `server/trustedRecoveryIssuer.mjs`: resolves an authenticated reviewer, then rechecks and locks the **live Supabase session**, **active reviewer authorization**, and **exact company-specific verified evidence** within one serializable transaction. Checks current cloud owner/membership, independent reviewer (not the owner), matching destination/local company or transfer recipient, 24-hour evidence age, restore manifest/receipt or transfer-review digests, no prior issued approval; inserts a ten-minute approval, conditionally consumes the evidence, and records an approval audit atomically.
2. `server/recoveryApprovalPostgres.mjs`: parameterized `auth.sessions FOR SHARE` check, active reviewer row `FOR SHARE`, verified evidence `FOR UPDATE`, and conditional `status='verified' → 'consumed'` update requiring exactly one affected row. These methods share the transaction from `createPostgresCompanyOwnershipStore`; rollback removes any partial approval, consumption or audit.
3. `server/companyOwnershipCoordinator.mjs`: no longer accepts externally injected boolean-like reviewer/evidence authority callbacks. Instead it composes the existing Supabase Auth/session resolver and the private PostgreSQL transaction adapter directly. Missing schema / missing private privileges / missing reviewer records **fail closed**, without a production feature flag being changed.
4. `docs/security/STAGE9_RUN2_VERIFIED_RECOVERY_SCHEMA_REVIEW.sql`: proposed **unapplied** private tables `company_recovery_reviewers` and `company_recovery_verified_evidence`, with owner-independent reviewer status, **pending-by-default evidence requiring explicit promotion to verified**, typed restore-vs-transfer evidence receipts, restrictive RLS and explicit `anon`/`authenticated` grants revoked. No public insertion endpoint and **no automatic reviewer or evidence record provisioning**. Initial schema review caught and removed an unsafe `default 'verified'`: new evidence is now `pending` until a separately verified and authorized transition. Pending evidence is rejected by the issuer, including an added regression case.
5. Replaced the focused regression tests for the issuer, coordinator, and SQL adapter; added schema guard tests. No financial, checkout, inventory or cloud synchronization write-path changes were made.

## Local execution — genuine results, restricted scope

In a local mirror using **Linux Node.js 22.16.0**, ran:

```bash
node --test server/tests/*.test.mjs
```

**20 passed / 0 failed / 0 skipped.** This command ran the four Run-2-focused native test modules in the review workspace, **not all test modules from the full Tallybook repository**. Checks include reviewer and session revocation, stale/foreign evidence, wrong recipient, independent reviewer, mandatory SHA-256-shaped receipts, one-use replay prevention, conditional PostgreSQL operations, simulated rollback after insertion/audit failure, coordinator transaction composition and source-SQL RLS rules.

Local rerun TAP log SHA-256: `393f70e3d4de869368494c3429c8151371b487d66a4a162bdfef634497d36f4d` (20 passes, 0 failures/skips).

Verified local Git blob hashes of the **exact changed GitHub source/test/SQL files**:

| Path | Git blob SHA |
| --- | --- |
| `server/trustedRecoveryIssuer.mjs` | `383a4fd2e1fce19b1e2007cb36b40b2b58fca335` |
| `server/recoveryApprovalPostgres.mjs` | `89e43aa2a64603ffd8ba1edf81698c755f86879f` |
| `server/companyOwnershipCoordinator.mjs` | `2b6dbb6f170a411c1f4a35bd827621c03777b92e` |
| `server/tests/trustedRecoveryIssuer.test.mjs` | `53fa234d1548e3668fc199a270d64a02527e463c` |
| `server/tests/recoveryApprovalPostgres.test.mjs` | `1d1d501da79b1a89f1cb52d248cb035fd1241a16` |
| `server/tests/companyOwnershipCoordinator.test.mjs` | `202813d5c1369c647e4a5979c11d05978629851e` |
| `server/tests/trustedRecoveryEvidenceSchema.test.mjs` | `b88dd88eb94e22ff1772a9c08fc8a682072a199c` |
| `docs/security/STAGE9_RUN2_VERIFIED_RECOVERY_SCHEMA_REVIEW.sql` | `07895c6150ddfac7afa1e58eadc6fb6a163ecc4a` |

The unchanged test dependencies `server/trustedCompanyOwnership.mjs`, `server/trustedCompanyOwnershipPostgres.mjs` and `server/supabaseOwnershipSession.mjs` were mirrored with matching source-branch Git blob SHAs `774f493cdf6cc119bdc176f47d5ce113be3c7efe`, `c05b085ea48d9812fb12e7fa7c70df9e71cbcfb0`, and `c2d1fc84c5c4aefce12c1d718f01c726abf36951`.

## Not implemented, not verified, not authorized

- **No real reviewer or recovery-evidence issuance process:** no independent verified owner proof, actual backup/restore drill, physical reviewer, account-link UI, or operational reviewer provisioning was performed. An arbitrary 64-character digest is not evidence of successful recovery.
- SQL schema is **not deployed** and has **not been tested on PostgreSQL**. The existing Supabase migrations `20261014113009` and `20261014115304` were already applied per the owner's handover; do **not** rerun, alter or seed the live database. No Supabase credentials/service-role key used.
- **No HTTP routes** or protected cloud writes activated. Full V19 client Vitest, all native Node tests, Node 24/Windows, semantic TypeScript, build, Playwright/offline/browser/Dexie, GitHub Actions exact-head CI, real RLS, cross-tenant concurrent database operations and rollback under actual process failures **not run**.
- The code does not provide an audited reviewer/evidence **promotion mechanism** and does not guarantee an immutable reviewer/evidence issuance trail or exact owner recovery without separately implemented trusted verifier, legitimate review records and real serializable DB acceptance.

## Required to close V19 Run 2

1. Design, independently review and test trusted issuance/provisioning of reviewer authorizations and cryptographically tied restoration receipts. Real backup export, independent restore drill, human owner acknowledgement, reviewer independence, expiry/revocation and audit must be verifiable rather than client-asserted.
2. In an **explicitly approved disposable project**, reconcile migration history, deploy only reviewed additive schema, test real privileged transaction adapter, forged/cross-tenant/revoked sessions, RLS, simultaneous approvals, audit rollback and serializable retries. No live environment changes.
3. Design and review the private server/Edge Function direct-TLS authentication and CSRF/origin/rate-limited routes. Do not expose a service-role key to the browser.
4. Verify browser IndexedDB preservation and deterministic backup/restore of local company records, explicit account binding, two real isolated accounts/companies and no accidental cloud-account claim.
5. Restore actual CI/approved runner execution and pass entire exact-final-head Node/pnpm/Vitest/build/Playwright/offline/audit suite, then document results in 47-blocker and 82-unit registers. Only then consider marking **Run 2 PASS** or beginning Run 3.

**Decision:** Run 2 is **NOT PASSED**, Stage 9 Round 1 remains **PARTIAL**, commercial release **NO-GO**. No merge to `main`, staging, production deployment, payment, financial sync, or destructive data mutation.
