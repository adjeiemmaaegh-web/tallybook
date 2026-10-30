# Current development handover — 2026-10-30

## Source and release decision

Use `development/v19-unified-reconciliation`, local worktree `work/v19-cloud-qa` (local branch `integration/v19-cloud-qa`). The package's `PACKAGE_PROVENANCE.json` records its exact commit. GitHub main was independently read as `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb` during this continuation. Main has not been changed and no current commit has been deployed or offered as a completed-integration pull request.

**Development is still incomplete; production remains NO-GO.** A successful build is not completion of the cloud/financial replication or acceptance requirements. The user owns hands-on acceptance; the focused checks below protect this development increment and are not a substitute for it.

## Completed in this continuation

- `b28131f`: isolated QA device enrollment RPC, Edge actions and browser controls. Owner-approved membership/shop/staff binding, proof of key possession, bounded grants, exact retry and revocation checks. Applied only to QA `lmneuqxfyxplrxjswpma`; production Supabase untouched. See `2026-10-30_QA_DEVICE_ENROLLMENT_INTEGRATION.md`.
- `091c351`: exact original checkout stock/cost/batch/store/customer posting evidence captured atomically in new sale events; cloud account changes abort claim-quarantine writes. Existing historical events unchanged. See `2026-10-30_CHECKOUT_POSTING_EVIDENCE.md`.
- `38752ad`: immutable original credit payment terms, safe unknown-history treatment, receivables ageing on Financial Intelligence and CSV. See `2026-10-30_RECEIVABLE_AGEING.md`.
- `aa1b98c`: net SKU units subtract partial returns and remove full reversals; manual stock-coverage arithmetic connected to Insights. See `2026-10-30_SKU_DEMAND.md`.
- Current package: enabled local manual advisory acknowledgement/reopening after implementing atomic source/evidence/journal/audit checks, stale-display rejection and rollback. Automatic actions remain off. See `2026-10-30_ADVISORY_REVIEW.md`.

## Measured verification

Receivables: 7 native checks and 44 client checks passed. SKU demand: 5 native and 25 client checks passed. Manual review: 6 client checks passed. These suites overlap; their totals are not a unique full-suite count. TypeScript and successive Vite/PWA production builds passed. Logs are committed under `artifacts/receivable-ageing-*`, `artifacts/sku-demand-*` and `artifacts/advisory-review-*`. Build warnings about chunks and mixed imports remain. No full suite or new browser/device acceptance is claimed for this exact package. Earlier full-suite evidence belongs to its stated commits (see `2026-10-30_NO_MERGE_VALIDATION_CHECKPOINT.md`). GitHub's Linux validation remains deferred per owner instruction until Actions is available.

## Current blockers and unfinished implementation

1. QA Auth still has **zero users**, **zero device keys**, and **zero approved local company bindings**, verified by read-only SQL during this continuation. Two separate confirmed owner/attendant demo accounts and their approved company link are required for actual hosted enrollment/revocation/tenant acceptance. The two email addresses have been requested; do not request passwords or confirmation codes in chat. No production authentication setting was weakened.
2. `QA_SIGNED_PULL_SOURCE_RELEASED` remains false. QA claims retain `financialApplied:false`. There is no deployed sale-upload action in the QA Edge router. Implement the trusted hosted upload path and exercise enroll → signed upload → exact retry → signed pull → revoke using isolated identities before opening that gate.
3. Remote financial replay is not implemented. Original posting evidence is a prerequisite, not integration. Deterministic replay must establish prerequisite product/customer/receipt/cost history, ordered operation coverage beyond sales, deduplication, crash recovery, reserved stock ownership and disconnected-write conflicts without overselling or duplicate money. Keep quarantine out of financial totals until these invariants hold.
4. The governing 82-unit register still contains 16 missing and 3 blocked units. Some contain partial local implementations; do not equate candidates with accepted features. Remaining scope includes complete cloud/store consolidation, trusted public commerce/order identity, scheduled opted-in automation, and independent full-history reconciliation. Provider/carrier acceptance requires the approved sandbox/integration details; live payments and external fulfillment remain unauthorized.
5. Representative historical customer backup/migration verification and user Windows/Android acceptance remain outstanding. No iPhone requirement is added. Deployment, main merge as a completed integration and production readiness must not be inferred from these local changes.

## Exact continuation

Start with the package commit and check the working tree before editing. Keep the current source and input archives unchanged. With the two confirmed QA identities, approve their isolated local/cloud company binding through the existing ownership process; provision shop/staff identities, invite/redeem device keys and verify denial paths through the deployed Edge and Data APIs. Complete the hosted upload/replay work above; do not flip the signed-pull or financial-posting gate to conceal missing code. In parallel, finish remaining local requirements from `docs/release/traceability.json`, recording exact implementation evidence and preserving any incomplete acceptance status. Re-run relevant checks for each change; run Linux checks when Actions becomes available. Merge only after the agreed integration is actually complete; never auto-deploy a different commit under an earlier commit-specific deployment approval.

## Reproduction and source package

Install the lockfile-pinned dependencies using the repository's pnpm version (`pnpm install --frozen-lockfile`). Then `pnpm check` and `pnpm build`. The Windows workspace used installed `node_modules/.bin/tsc.cmd`, `vite.cmd` and `vitest.cmd` because Corepack's registry lookup was unavailable; this is not a lockfile change. For local Vitest, create `artifacts/qa-temp` and set TEMP/TMP to its absolute path.

Run `python scripts/package-unified-source.py <new-absolute-output-path>/TALLYBOOK_V19_UNIFIED_MASTER_SOURCE.zip` from a clean committed worktree. It packages committed source/reports/logs, adds commit/ref provenance and a per-file SHA-256 manifest, tests ZIP integrity, verifies every file hash and writes a ZIP digest sidecar. Existing packages are not overwritten. Local credentials, untracked customer data, installed dependencies and `.git` are excluded.
