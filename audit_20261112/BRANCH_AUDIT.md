# Tallybook Git branch audit — 2026-11-12

Baseline: `7132c0a8a3e1df303def32fca0e13e006ecf30b4` (audited local checkpoint); repository `adjeiemmaaegh-web/tallybook`.
The table below includes EVERY observed remote branch. Ahead/behind are commit ancestry, **not** proof of missing functionality. Branch-only changes were compared using `git diff origin/main...origin/<branch>`; patch equivalence was separately inspected. No branch was deleted or force-pushed.

| Remote branch | Ahead | Behind | Branch-only paths | Disposition |
|---|---:|---:|---:|---|
| `backend-b-e-20261106` | 14 | 258 | 12 | DEFER / SUPERSEDED |
| `backup/main-before-stakeholder-2026-10-30-ea165a5` | 0 | 352 | 0 | IN MAIN (ANCESTOR) |
| `chore/cleanup-historical-docs` | 1 | 83 | 361 | REJECT |
| `completion/cloud-foundation` | 2 | 1206 | 23 | SUPERSEDED |
| `development/ghana-pos-stages-01-15` | 0 | 130 | 0 | IN MAIN (ANCESTOR) |
| `development/v19-cloud-account-sync-integration` | 0 | 340 | 0 | IN MAIN (ANCESTOR) |
| `development/v19-friends-web-test` | 0 | 357 | 0 | IN MAIN (ANCESTOR) |
| `development/v19-owner-completion-audit` | 6 | 83 | 113 | SELECTIVE / DEFER |
| `development/v19-unified-reconciliation` | 3 | 290 | 42 | DEFER |
| `docs/device-ledger-recovery-boundary` | 0 | 99 | 0 | IN MAIN (ANCESTOR) |
| `feat/auth-gate-2b1` | 3 | 1209 | 2 | SUPERSEDED |
| `feat/remote-owner-attendant-sync` | 0 | 1223 | 0 | IN MAIN (ANCESTOR) |
| `feat/supabase-google-auth` | 0 | 1210 | 0 | IN MAIN (ANCESTOR) |
| `feature/cloud-refund-policy` | 0 | 257 | 0 | IN MAIN (ANCESTOR) |
| `feature/landing-redesign` | 0 | 40 | 0 | IN MAIN (ANCESTOR) |
| `feature/next-upgrade` | 0 | 251 | 0 | IN MAIN (ANCESTOR) |
| `feature/premium-beginner-home-clementia` | 101 | 1206 | 13 | SUPERSEDED / DESIGN REFERENCE |
| `feature/premium-settings-business-staff-2026-10-15` | 16 | 1205 | 9 | DEFER UI |
| `feature/quick-wins-tier1` | 0 | 81 | 0 | IN MAIN (ANCESTOR) |
| `feature/quick-wins-tier1b` | 0 | 79 | 0 | IN MAIN (ANCESTOR) |
| `feature/readiness-gaps` | 0 | 41 | 0 | IN MAIN (ANCESTOR) |
| `feature/shared-device-attendant-handover-20261111` | 0 | 21 | 0 | IN MAIN (ANCESTOR) |
| `feature/shared-shop-order-fulfilment` | 0 | 108 | 0 | IN MAIN (ANCESTOR) |
| `feature/shared-shop-server-shifts-audit-20261111` | 0 | 4 | 0 | IN MAIN (ANCESTOR) |
| `feature/shared-shop-transfer-workflow` | 0 | 117 | 0 | IN MAIN (ANCESTOR) |
| `feature/signin-redesign` | 0 | 34 | 0 | IN MAIN (ANCESTOR) |
| `feature/tier2-till-reports` | 0 | 73 | 0 | IN MAIN (ANCESTOR) |
| `feature/tier3-product-fields` | 0 | 62 | 0 | IN MAIN (ANCESTOR) |
| `feature/tier4-attendant-stock` | 0 | 48 | 0 | IN MAIN (ANCESTOR) |
| `feature/ux-design-audit` | 0 | 42 | 0 | IN MAIN (ANCESTOR) |
| `fix/clementia-maximize-minimize-2026-10-14` | 30 | 1205 | 8 | DEFER UI |
| `fix/device-key-initialization-recovery` | 0 | 99 | 0 | IN MAIN (ANCESTOR) |
| `fix/insights-exact-debt-total-20261111` | 0 | 18 | 0 | IN MAIN (ANCESTOR) |
| `fix/mobile-role-onboarding` | 0 | 204 | 0 | IN MAIN (ANCESTOR) |
| `fix/owner-dashboard-recovery` | 0 | 199 | 0 | IN MAIN (ANCESTOR) |
| `fix/private-owner-workspace` | 0 | 122 | 0 | IN MAIN (ANCESTOR) |
| `fix/receipt-print-fallback` | 0 | 100 | 0 | IN MAIN (ANCESTOR) |
| `fix/release-navigation` | 0 | 118 | 0 | IN MAIN (ANCESTOR) |
| `fix/role-entry` | 0 | 195 | 0 | IN MAIN (ANCESTOR) |
| `fix/role-first-home-dashboard-20261111` | 8 | 43 | 17 | SUPERSEDED |
| `fix/shared-shop-offline-queue-reconciliation` | 0 | 119 | 0 | IN MAIN (ANCESTOR) |
| `fix/shared-shop-role-refresh` | 0 | 116 | 0 | IN MAIN (ANCESTOR) |
| `fix/supplier-event-attribution` | 0 | 109 | 0 | IN MAIN (ANCESTOR) |
| `fix/verified-shop-entry` | 0 | 201 | 0 | IN MAIN (ANCESTOR) |
| `frontend-all-stages-20261106` | 16 | 258 | 8 | REFERENCE ONLY |
| `integrate-reference-ui-20261107` | 0 | 222 | 0 | IN MAIN (ANCESTOR) |
| `integration/rc-stabilization-20261108` | 0 | 207 | 0 | IN MAIN (ANCESTOR) |
| `integration/retail-and-navigation` | 0 | 125 | 0 | IN MAIN (ANCESTOR) |
| `main` | 0 | 0 | 0 | IN MAIN (ANCESTOR) |
| `qa/attendant-dashboard-entry` | 0 | 84 | 0 | IN MAIN (ANCESTOR) |
| `qa/device-browser-engines` | 0 | 100 | 0 | IN MAIN (ANCESTOR) |
| `qa/restart-selected-browser` | 1 | 87 | 1 | PATCH EQUIVALENT |
| `qa/shared-till-browser-restart` | 0 | 100 | 0 | IN MAIN (ANCESTOR) |
| `release/shared-shop-ledger` | 0 | 276 | 0 | IN MAIN (ANCESTOR) |
| `review/combined-settings-clementia-2026-10-15` | 17 | 1205 | 17 | DEFER UI |
| `review/finish-historical-reconciliation` | 0 | 100 | 0 | IN MAIN (ANCESTOR) |
| `review/shop-entry-acceptance-20261107` | 6 | 251 | 3 | SUPERSEDED |
| `security/auth-company-boundary-20261013` | 58 | 1206 | 29 | SUPERSEDED / SECURITY REFERENCE |
| `stage-b-offline-integrity-20261106` | 86 | 258 | 22 | SELECTIVE / DEFER |
| `stage9/multistore-integration-20261014` | 0 | 1187 | 0 | IN MAIN (ANCESTOR) |
| `stage9/round1-enrollment-lifecycle-20261015` | 0 | 1172 | 0 | IN MAIN (ANCESTOR) |
| `test/populated-ledger-upgrade` | 0 | 109 | 0 | IN MAIN (ANCESTOR) |
| `test/private-workspace-return` | 0 | 102 | 0 | IN MAIN (ANCESTOR) |
| `v19-windows-preview-2026-10-12` | 0 | 1209 | 0 | IN MAIN (ANCESTOR) |
| `v19/run10-customer-receivables-20261016` | 0 | 894 | 0 | IN MAIN (ANCESTOR) |
| `v19/run11-company-refund-policy-20261016` | 0 | 855 | 0 | IN MAIN (ANCESTOR) |
| `v19/run12-supplier-tax-20261016` | 26 | 855 | 20 | SELECTIVE / DEFER |
| `v19/run12-supplier-tax-reconciliation-20261016` | 0 | 818 | 0 | IN MAIN (ANCESTOR) |
| `v19/run13-multistore-development-20261016` | 0 | 734 | 0 | IN MAIN (ANCESTOR) |
| `v19/run14-secure-sync-development-20261016` | 0 | 698 | 0 | IN MAIN (ANCESTOR) |
| `v19/run15-payment-sandbox-development-20261016` | 0 | 676 | 0 | IN MAIN (ANCESTOR) |
| `v19/run16-public-commerce-development-20261016` | 0 | 632 | 0 | IN MAIN (ANCESTOR) |
| `v19/run17-assistant-analytics-development-20261017` | 0 | 608 | 0 | IN MAIN (ANCESTOR) |
| `v19/run18-hardening-development-20261017` | 0 | 576 | 0 | IN MAIN (ANCESTOR) |
| `v19/run19-device-uat-development-20261017` | 0 | 552 | 0 | IN MAIN (ANCESTOR) |
| `v19/run2-transactional-recovery-20261015` | 0 | 1107 | 0 | IN MAIN (ANCESTOR) |
| `v19/run20-operations-release-development-20261017` | 0 | 510 | 0 | IN MAIN (ANCESTOR) |
| `v19/run3-cloud-membership-20261015` | 0 | 1084 | 0 | IN MAIN (ANCESTOR) |
| `v19/run4-session-lifecycle-20261016` | 0 | 1053 | 0 | IN MAIN (ANCESTOR) |
| `v19/run5-tenant-authorization-20261016` | 0 | 1041 | 0 | IN MAIN (ANCESTOR) |
| `v19/run5-tenant-service-authorization-20261016` | 54 | 1053 | 27 | SUPERSEDED |
| `v19/run6-staff-authorization-20261016` | 0 | 1014 | 0 | IN MAIN (ANCESTOR) |
| `v19/run7-cross-db-recovery-20261016` | 0 | 985 | 0 | IN MAIN (ANCESTOR) |
| `v19/run8-migration-backup-recovery-20261016` | 0 | 944 | 0 | IN MAIN (ANCESTOR) |
| `v19/run9-inventory-financial-reconciliation-20261016` | 0 | 915 | 0 | IN MAIN (ANCESTOR) |
| `v19/stage-stakeholder-copy-finalization-20261109` | 3 | 87 | 2 | SUPERSEDED |
| `v19/stage21-baseline-ci-recovery-20261017` | 0 | 487 | 0 | IN MAIN (ANCESTOR) |
| `v19/stage22-finance-completion-20261017` | 0 | 434 | 0 | IN MAIN (ANCESTOR) |
| `v19/stage22-financial-workflow-completion-20261017` | 0 | 455 | 0 | IN MAIN (ANCESTOR) |

## Findings for every divergent branch

### `backend-b-e-20261106`
- Decision: **DEFER / SUPERSEDED**. Canonical migrations and B–E workflows landed by later integration. This branch carries alternative older return policy and migration IDs; do not replay.
- Branch head: `9f14d66345fc6172d8ba713fd54cf12a2bd72b49`; ahead 14, behind 258, changed in branch-only diff 12, new paths 10.
- Representative added paths: `.github/workflows/backend-b-e-qa.yml`, `docs/backend-stages-b-e/API_CONTRACT.md`, `docs/backend-stages-b-e/README.md`, `docs/backend-stages-b-e/STAGE_E_EXIT_GATES.md`, `qa/backend-stage-b-e.test.mjs`, `supabase/migrations/20261106120000_shared_shop_return_policies.sql`, `supabase/migrations/20261106130000_shop_stage_c_read_models.sql`, `supabase/migrations/20261106140000_shop_stage_d_stock_workflows.sql`, `supabase/migrations/20261106150000_shop_stage_d_purchase_payables.sql`.
- Source retained without deletion; no direct or forced merge.

### `chore/cleanup-historical-docs`
- Decision: **REJECT**. Deletes 361 historical QA/status files; their evidence must be retained.
- Branch head: `f4b7a81bbf43813e070e39be74683fffd843a42a`; ahead 1, behind 83, changed in branch-only diff 361, new paths 0.
- Representative added paths: None.
- Source retained without deletion; no direct or forced merge.

### `completion/cloud-foundation`
- Decision: **SUPERSEDED**. Staged AuthGate and earlier cloud identity are superseded by current server-session membership/RPC design.
- Branch head: `779a934fc0c4739db940e71bf2bec5f8c189154c`; ahead 2, behind 1206, changed in branch-only diff 23, new paths 13.
- Representative added paths: `client/src/auth/AuthGate.tsx`, `client/src/auth/auth.test.tsx`, `client/src/cloud/CloudBusinessPanel.test.tsx`, `client/src/cloud/CloudBusinessPanel.tsx`, `client/src/cloud/businessIdentity.test.ts`, `client/src/cloud/businessIdentity.ts`, `docs/CLOUD_COMPLETION_STATUS.md`, `playwright.auth.config.mjs`, `qa/browser-auth.spec.mjs`.
- Source retained without deletion; no direct or forced merge.

### `development/v19-owner-completion-audit`
- Decision: **SELECTIVE / DEFER**. Exact BigInt local debt insight already ported in PR #69. Public catalogue, reservations, advisory scheduler, store contribution reports and new migrations remain absent; needs API/schema compatibility and dedicated acceptance.
- Branch head: `3896b5797693e1e3d074bd8f6f0cabe628092b08`; ahead 6, behind 83, changed in branch-only diff 113, new paths 72.
- Representative added paths: `client/src/cloud/SharedShopCatalogue.tsx`, `client/src/cloud/publicCommerce.ts`, `client/src/features/insights/AdvisoryScheduleRunner.tsx`, `client/src/features/insights/ScheduledAdvisories.tsx`, `client/src/features/insights/advisorySchedule.test.ts`, `client/src/features/insights/advisorySchedule.ts`, `client/src/features/insights/advisoryScheduleRules.ts`, `client/src/features/stores/StoreFinancialReport.tsx`, `client/src/features/stores/storeFinancialReport.ts`.
- Source retained without deletion; no direct or forced merge.

### `development/v19-unified-reconciliation`
- Decision: **DEFER**. Alternative encrypted workspace checkpoints/key vault; populated-device recovery, migration and key continuity not demonstrated.
- Branch head: `669f1cf223385931de67f31d3c002d60d2cfa16d`; ahead 3, behind 290, changed in branch-only diff 42, new paths 27.
- Representative added paths: `client/src/auth/WorkspaceOnboarding.tsx`, `client/src/auth/workspaceBoundary.test.ts`, `client/src/auth/workspaceBoundary.ts`, `client/src/auth/workspaceCheckpointJournal.ts`, `client/src/auth/workspaceDatabaseBoundary.test.ts`, `client/src/auth/workspaceDatabaseBoundary.ts`, `client/src/auth/workspaceKeyVault.test.ts`, `client/src/auth/workspaceKeyVault.ts`, `docs/mission-go/PACKAGE_1_CHECKPOINT_2026-10-30.md`.
- Source retained without deletion; no direct or forced merge.

### `feat/auth-gate-2b1`
- Decision: **SUPERSEDED**. Earlier AuthGate alternatives conflict with current protected routing.
- Branch head: `a4b83363552c43de77124fa87d8a8c183a644605`; ahead 3, behind 1209, changed in branch-only diff 2, new paths 1.
- Representative added paths: `client/src/components/AuthGate.tsx`.
- Source retained without deletion; no direct or forced merge.

### `feature/premium-beginner-home-clementia`
- Decision: **SUPERSEDED / DESIGN REFERENCE**. Prototype-era shell/Clementia; current design paths different, field accessibility review pending.
- Branch head: `f854304053a911550ebdd4b30bb5d6885abb515d`; ahead 101, behind 1206, changed in branch-only diff 13, new paths 9.
- Representative added paths: `.github/workflows/ui-verification.yml`, `client/public/premium-clementia.svg`, `client/src/components/ClementiaLauncher.css`, `client/src/components/ClementiaLauncher.tsx`, `client/src/components/PremiumHome.css`, `client/src/components/PremiumHomeOverview.tsx`, `client/src/components/PremiumShell.css`, `playwright.visual.config.mjs`, `qa/premium-home-visual.spec.mjs`.
- Source retained without deletion; no direct or forced merge.

### `feature/premium-settings-business-staff-2026-10-15`
- Decision: **DEFER UI**. Historical settings/staff redesign; needs current role-entry and mobile keyboard verification.
- Branch head: `88d35fc07f1677ea03c9225b513adf84207f37a4`; ahead 16, behind 1205, changed in branch-only diff 9, new paths 6.
- Representative added paths: `client/src/pages/SettingsWorkspace.css`, `playwright.settings.config.mjs`, `qa/PREMIUM_SETTINGS_UI_PLAN_2026-10-15.md`, `qa/PREMIUM_SETTINGS_UI_REVIEW_2026-10-15.md`, `qa/premium-settings-contract.test.mjs`, `qa/premium-settings-visual.spec.mjs`.
- Source retained without deletion; no direct or forced merge.

### `fix/clementia-maximize-minimize-2026-10-14`
- Decision: **DEFER UI**. Window controls not accepted in contemporary mobile/keyboard shell.
- Branch head: `aafab7734e2af2096826b7f5a1958fb0ee6ab150`; ahead 30, behind 1205, changed in branch-only diff 8, new paths 4.
- Representative added paths: `client/src/lib/clementiaWindow.ts`, `client/src/pages/AssistantPage.companyIsolation.test.tsx`, `qa/CLEMENTIA_STATIC_REVIEW_2026-10-14.md`, `qa/LOCAL_WINDOWS_TEST_PLAN.md`.
- Source retained without deletion; no direct or forced merge.

### `fix/role-first-home-dashboard-20261111`
- Decision: **SUPERSEDED**. Later main contains the role-first home and auth entrypoints; branch snapshot is older and not a safe UI replacement.
- Branch head: `106e0fac4cb8adc00ed7c36ba3082b8976eb2971`; ahead 8, behind 43, changed in branch-only diff 17, new paths 4.
- Representative added paths: `client/src/cloud/SharedShopAttendantHome.test.tsx`, `client/src/cloud/SharedShopAttendantHome.tsx`, `client/src/cloud/cloudEntryDestination.test.ts`, `client/src/cloud/cloudEntryDestination.ts`.
- Source retained without deletion; no direct or forced merge.

### `frontend-all-stages-20261106`
- Decision: **REFERENCE ONLY**. Standalone prototype has no authoritative financial ledger integration.
- Branch head: `246d477cc4b4a93820d3cf2c6c5df2317dc1a905`; ahead 16, behind 258, changed in branch-only diff 8, new paths 8.
- Representative added paths: `.github/workflows/frontend-all-stages-qa.yml`, `frontend-prototype/README.md`, `frontend-prototype/app.js`, `frontend-prototype/index.html`, `frontend-prototype/playwright.config.mjs`, `frontend-prototype/qa_e2e.spec.mjs`, `frontend-prototype/qa_node.mjs`, `frontend-prototype/styles.css`.
- Source retained without deletion; no direct or forced merge.

### `qa/restart-selected-browser`
- Decision: **PATCH EQUIVALENT**. Git patch-identity count is zero; selected-browser restart behavior has already been integrated.
- Branch head: `155482ef68d6a0e120a278e745e3e4f316f60839`; ahead 1, behind 87, changed in branch-only diff 1, new paths 0.
- Representative added paths: None.
- Source retained without deletion; no direct or forced merge.

### `review/combined-settings-clementia-2026-10-15`
- Decision: **DEFER UI**. Combines earlier unaccepted settings and assistant visual changes.
- Branch head: `9153c386156d4d5905e034da83c570dd9b430369`; ahead 17, behind 1205, changed in branch-only diff 17, new paths 10.
- Representative added paths: `client/src/lib/clementiaWindow.ts`, `client/src/pages/AssistantPage.companyIsolation.test.tsx`, `client/src/pages/SettingsWorkspace.css`, `playwright.settings.config.mjs`, `qa/CLEMENTIA_STATIC_REVIEW_2026-10-14.md`, `qa/LOCAL_WINDOWS_TEST_PLAN.md`, `qa/PREMIUM_SETTINGS_UI_PLAN_2026-10-15.md`, `qa/PREMIUM_SETTINGS_UI_REVIEW_2026-10-15.md`, `qa/premium-settings-contract.test.mjs`.
- Source retained without deletion; no direct or forced merge.

### `review/shop-entry-acceptance-20261107`
- Decision: **SUPERSEDED**. Public shop entry browser tests already ported and updated on main.
- Branch head: `a6170ef1bfdbc856d5cf4fb914aa55e291e00d39`; ahead 6, behind 251, changed in branch-only diff 3, new paths 1.
- Representative added paths: `qa/shop-public-entry.spec.mjs`.
- Source retained without deletion; no direct or forced merge.

### `security/auth-company-boundary-20261013`
- Decision: **SUPERSEDED / SECURITY REFERENCE**. Old membership policy and server adapters do not match current PostgreSQL-session boundaries.
- Branch head: `60c4c77ac1d8ca56fd6257e4c0f1913fee79bb2d`; ahead 58, behind 1206, changed in branch-only diff 29, new paths 26.
- Representative added paths: `client/src/features/security/accountBindingPreparation.test.ts`, `client/src/features/security/accountBindingPreparation.ts`, `client/src/features/security/companyAccessPolicy.test.ts`, `client/src/features/security/companyAccessPolicy.ts`, `client/src/features/security/offlineBindingReview.test.ts`, `client/src/features/security/offlineBindingReview.ts`, `client/src/features/security/verifyCloudCompanyAccess.test.ts`, `client/src/features/security/verifyCloudCompanyAccess.ts`, `docs/release/AUTH_COMPANY_SECURITY_INCREMENT_2026-10-13.md`.
- Source retained without deletion; no direct or forced merge.

### `stage-b-offline-integrity-20261106`
- Decision: **SELECTIVE / DEFER**. Cache allowlist and queue retry tests integrated separately. Alternative encrypted vault recovery and return policy require migration evidence.
- Branch head: `d4589e2554afabf3e1b8b286b6ddbf8433734072`; ahead 86, behind 258, changed in branch-only diff 22, new paths 14.
- Representative added paths: `.github/workflows/stage-b-qa.yml`, `client/src/cloud/ShopOutboxVaultPanel.tsx`, `client/src/cloud/ShopRefundPolicyPanel.tsx`, `client/src/cloud/safeShopCache.test.ts`, `client/src/cloud/safeShopCache.ts`, `client/src/cloud/shopVaultCrypto.d.mts`, `client/src/cloud/shopVaultCrypto.mjs`, `docs/stage-b/LOCAL_LEDGER_ENCRYPTION_BOUNDARY.md`, `docs/stage-b/STAGE_B_IMPLEMENTATION_GATES.md`.
- Source retained without deletion; no direct or forced merge.

### `v19/run12-supplier-tax-20261016`
- Decision: **SELECTIVE / DEFER**. Supplier provenance/attribution fixes selectively ported; old tax variant must not displace sale-time tax snapshots.
- Branch head: `2acd7ca22017b29c0470cb1ad3e9a452a5e8d87e`; ahead 26, behind 855, changed in branch-only diff 20, new paths 12.
- Representative added paths: `client/src/features/purchases/tests/run12SupplierPayables.test.mjs`, `client/src/features/reports/run12RecordedTaxAudit.d.mts`, `client/src/features/reports/run12RecordedTaxAudit.mjs`, `client/src/features/reports/run12SupplierCashAudit.d.mts`, `client/src/features/reports/run12SupplierCashAudit.mjs`, `client/src/features/reports/run12SupplierTaxIntegration.test.ts`, `client/src/features/reports/tests/run12RecordedTaxAudit.test.mjs`, `client/src/features/reports/tests/run12SupplierCashAudit.test.mjs`, `docs/release/RUN12_SUPPLIER_TAX_FULL_INCREMENT_2026-10-16.md`.
- Source retained without deletion; no direct or forced merge.

### `v19/run5-tenant-service-authorization-20261016`
- Decision: **SUPERSEDED**. Different HTTP tenant service; deployed shared shop uses session-checked database operations.
- Branch head: `3d48eb9378e218d9c7cc6f80a2162d0f737378bc`; ahead 54, behind 1053, changed in branch-only diff 27, new paths 18.
- Representative added paths: `client/src/cloud/Run5TenantBoundaryPanel.tsx`, `client/src/cloud/run5TenantReadClient.ts`, `docs/release/RUN5_TENANT_AUTHORIZATION_FULL_INCREMENT_2026-10-16.md`, `docs/release/RUN5_TENANT_AUTH_FULL_INCREMENT_2026-10-16.md`, `docs/security/RUN5_TENANT_RECORDS_RLS_DISPOSABLE_REVIEW.sql`, `qa/run5-disposable-rest-rls-probe.mjs`, `server/run5TenantDataService.mjs`, `server/run5TenantPolicy.mjs`, `server/run5TenantPostgres.mjs`.
- Source retained without deletion; no direct or forced merge.

### `v19/stage-stakeholder-copy-finalization-20261109`
- Decision: **SUPERSEDED**. Current report wording/tests incorporate intended stakeholder copy; older snapshots must not revert newer UI.
- Branch head: `d5132fb98d590e55f6560833df133c6efd706d69`; ahead 3, behind 87, changed in branch-only diff 2, new paths 1.
- Representative added paths: `qa/stakeholder-interface-copy.test.mjs`.
- Source retained without deletion; no direct or forced merge.

## Consolidation action

Only the separately reproduced exact-arithmetic bug in advanced repayment advisories is integrated on the **local audit branch**; regression was red before the fix, green after it. Existing reviewed PR #67 (shared device) and PR #69 (exact debt summary) were already in baseline `main`.
Wholesale historic branch merges were rejected where patches are obsolete, overlap current architecture, introduce out-of-order SQL migrations, or lack real-world recovery and identity acceptance. Missing legitimate scope is documented rather than reclassified as complete.
