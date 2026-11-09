# Branch and pull-request reconciliation


## November 9 historical branch decisions

Compared 66 remote tips to `f86277756525`. Fifty tips were already ancestors, one was main, fourteen had historical divergence, and one was active key-recovery work. All fourteen historical heads match the previously inspected commits. Their dispositions below preserve the current release contracts. Physical-device, OAuth and recovery acceptance remain open.

| Historical branch | Head | Disposition |
|---|---|---|
| `backend-b-e-20261106` | `9f14d66345fc` | Ported. Main uses the canonical return policy and operations migrations. PRs 40, 42 and 44 connect purchasing, counting, transfers and orders. |
| `completion/cloud-foundation` | `779a934fc0c4` | Superseded by session-bound business membership and RPCs on main. |
| `development/v19-unified-reconciliation` | `669f1cf22338` | Preserve as recovery reference. Populated-device conversion and key continuity remain separate release gates. |
| `feat/auth-gate-2b1` | `a4b83363552c` | Superseded by the current device and shared-shop entry gates. |
| `feature/premium-beginner-home-clementia` | `f854304053a9` | Historical home and assistant layout superseded by the integrated shell. |
| `feature/premium-settings-business-staff-2026-10-15` | `88d35fc07f16` | Defer visual redesign of Business and Staff. Keep the verified role-entry flows. |
| `fix/clementia-maximize-minimize-2026-10-14` | `aafab7734e2a` | Defer assistant window controls until keyboard and mobile acceptance. |
| `frontend-all-stages-20261106` | `246d477cc4b4` | Keep as design reference. The standalone preview has no ledger bindings. |
| `review/combined-settings-clementia-2026-10-15` | `9153c386156d` | Defer combined visual changes with the two original UI branches. |
| `review/shop-entry-acceptance-20261107` | `a6170ef1bfdb` | Ported with current copy and stronger signed-out assertions in both browser suites. |
| `security/auth-company-boundary-20261013` | `60c4c77ac1d8` | Retain the current membership RPC and local PIN contracts. Older server adapters remain out of the current deployed workflow. |
| `stage-b-offline-integrity-20261106` | `d4589e2554af` | Cache allowlist ported. PR 41 verifies sealed queue retry and import. Alternative vault recovery requires separate conversion evidence. |
| `v19/run12-supplier-tax-20261016` | `2acd7ca22017` | PR 45 ports supplier attribution validation while preserving valid timezone offsets and unknown legacy liabilities. Retain the current per-currency reports and sale-time tax snapshots. The alternate recorded-tax audit needs independent equivalence evidence before reuse. |
| `v19/run5-tenant-service-authorization-20261016` | `3d48eb9378e2` | Keep as historical implementation of the alternative HTTP tenant service. The deployed shared shop uses session-checked database operations. |

## November 9 integration refresh

Compared 55 remote branch heads to main at `56c119d` and the combined tree in PR #38. The Ghana retail source and role-entry changes are both parents of the candidate. The owner dashboard uses the incoming server read model and retains POS, sales and device-ledger navigation. Historical branch-specific deferrals and partial ports are detailed below.

| Branch | Reviewed head | Disposition |
|---|---|---|
| `backend-b-e-20261106` | `9f14d66345fc` | See original disposition below |
| `backup/main-before-stakeholder-2026-10-30-ea165a5` | `ba3481eb7742` | Already in baseline |
| `completion/cloud-foundation` | `779a934fc0c4` | See original disposition below |
| `development/ghana-pos-stages-01-15` | `156b1dbf5f42` | Integrated in PR #38 |
| `development/v19-cloud-account-sync-integration` | `5e837e705282` | Already in baseline |
| `development/v19-friends-web-test` | `9aefbdc0e88a` | Already in baseline |
| `development/v19-unified-reconciliation` | `669f1cf22338` | See original disposition below |
| `feat/auth-gate-2b1` | `a4b83363552c` | See original disposition below |
| `feat/remote-owner-attendant-sync` | `9041d89dac7a` | Already in baseline |
| `feat/supabase-google-auth` | `e92cfd3351a9` | Already in baseline |
| `feature/cloud-refund-policy` | `49ecfa5a3920` | Already in baseline |
| `feature/next-upgrade` | `3caefad023a7` | Already in baseline |
| `feature/premium-beginner-home-clementia` | `f854304053a9` | See original disposition below |
| `feature/premium-settings-business-staff-2026-10-15` | `88d35fc07f16` | See original disposition below |
| `fix/clementia-maximize-minimize-2026-10-14` | `aafab7734e2a` | See original disposition below |
| `fix/mobile-role-onboarding` | `ca855f54895f` | Already in baseline |
| `fix/owner-dashboard-recovery` | `5ac5830a5b79` | Already in baseline |
| `fix/role-entry` | `019f560ded70` | Integrated in PR #38 |
| `fix/verified-shop-entry` | `90c5fec03257` | Already in baseline |
| `frontend-all-stages-20261106` | `246d477cc4b4` | See original disposition below |
| `integrate-reference-ui-20261107` | `d2791f83a1ad` | Already in baseline |
| `integration/rc-stabilization-20261108` | `3c38f8aeb482` | Already in baseline |
| `main` | `56c119d20aa1` | Already in baseline |
| `release/shared-shop-ledger` | `a5c141f44539` | Already in baseline |
| `review/combined-settings-clementia-2026-10-15` | `9153c386156d` | See original disposition below |
| `review/shop-entry-acceptance-20261107` | `a6170ef1bfdb` | See original disposition below |
| `security/auth-company-boundary-20261013` | `60c4c77ac1d8` | See original disposition below |
| `stage-b-offline-integrity-20261106` | `d4589e2554af` | See original disposition below |
| `stage9/multistore-integration-20261014` | `cea840632e8b` | Already in baseline |
| `stage9/round1-enrollment-lifecycle-20261015` | `359ea1666225` | Already in baseline |
| `v19-windows-preview-2026-10-12` | `a2454494351a` | Already in baseline |
| `v19/run10-customer-receivables-20261016` | `55fc621f1179` | Already in baseline |
| `v19/run11-company-refund-policy-20261016` | `8f91b8b55c06` | Already in baseline |
| `v19/run12-supplier-tax-20261016` | `2acd7ca22017` | See original disposition below |
| `v19/run12-supplier-tax-reconciliation-20261016` | `00d130d0c883` | Already in baseline |
| `v19/run13-multistore-development-20261016` | `1564457bd187` | Already in baseline |
| `v19/run14-secure-sync-development-20261016` | `f2eedd8d52a8` | Already in baseline |
| `v19/run15-payment-sandbox-development-20261016` | `f94aa45d8a99` | Already in baseline |
| `v19/run16-public-commerce-development-20261016` | `eec6b3384f4c` | Already in baseline |
| `v19/run17-assistant-analytics-development-20261017` | `c6280f75eb4b` | Already in baseline |
| `v19/run18-hardening-development-20261017` | `017d473f6a44` | Already in baseline |
| `v19/run19-device-uat-development-20261017` | `1b6dd6738c6d` | Already in baseline |
| `v19/run2-transactional-recovery-20261015` | `939e06de8eb3` | Already in baseline |
| `v19/run20-operations-release-development-20261017` | `f144baec0314` | Already in baseline |
| `v19/run3-cloud-membership-20261015` | `e68619ff1493` | Already in baseline |
| `v19/run4-session-lifecycle-20261016` | `f983c7c924b1` | Already in baseline |
| `v19/run5-tenant-authorization-20261016` | `d06bdfe9b390` | Already in baseline |
| `v19/run5-tenant-service-authorization-20261016` | `3d48eb9378e2` | See original disposition below |
| `v19/run6-staff-authorization-20261016` | `23b06f9f6fb5` | Already in baseline |
| `v19/run7-cross-db-recovery-20261016` | `ccb03e864d24` | Already in baseline |
| `v19/run8-migration-backup-recovery-20261016` | `f1884ff3925f` | Already in baseline |
| `v19/run9-inventory-financial-reconciliation-20261016` | `e80592b71ffe` | Already in baseline |
| `v19/stage21-baseline-ci-recovery-20261017` | `8f0e9b646938` | Already in baseline |
| `v19/stage22-finance-completion-20261017` | `a2c445f0f1ee` | Already in baseline |
| `v19/stage22-financial-workflow-completion-20261017` | `52668cc28687` | Already in baseline |

## Original integration baseline

Baseline `3caefad023a7004c628c43b0b2e639c4b43ef1ae`. Fetched 49 branches including main; 15 non-main branch tips had commits outside main. GitHub returned 24 open PRs before this integration PR. Ancestry was checked with `git rev-list --left-right --count main...origin/<branch>`. Path counts use the merge base. A matching file count is only a blob comparison, not behavioral equivalence.

## Branches ahead of main

| Source | Head | Ahead / behind | Material changes and overlap | Disposition | Result commit |
|---|---|---:|---|---|---|
| `backend-b-e-20261106` · #28 draft | `9f14d66345fc6172d8ba713fd54cf12a2bd72b49` | 14 / 7 | 12 paths. Four operations migrations and upgrade regressions ported. Alternative refund revision schema conflicts with the canonical policy history. Dedicated shared authoring forms still outstanding. | Partially integrate | 2d7b27b, ad63146 |
| `completion/cloud-foundation` · #4 draft | `779a934fc0c4739db940e71bf2bec5f8c189154c` | 2 / 955 | 23 paths. Earlier cloud identity tables, AuthGate and browser QA overlap the current session-bound identity migrations and account routes. Retain current RPC and gate contracts. | Superseded | 3caefad02 |
| `development/v19-unified-reconciliation` | `669f1cf223385931de67f31d3c002d60d2cfa16d` | 3 / 39 | 42 paths. Per-workspace database identities, key vault and checkpoint journal change how existing Dexie databases are selected. A tested populated-device conversion and key recovery path are prerequisites. | Defer | — |
| `feat/auth-gate-2b1` · #3 | `a4b83363552c43de77124fa87d8a8c183a644605` | 3 / 958 | 2 paths. The earlier two-file gate uses an older account routing model. The current entry stack separately protects device and shared operations. | Superseded | c95fd11 |
| `feature/premium-beginner-home-clementia` | `f854304053a911550ebdd4b30bb5d6885abb515d` | 101 / 955 | 13 paths. Historical home/assistant layout overlaps active premium shell, assistant launcher and report-backed teal dashboard. Retain the integrated real routes. | Superseded | e9e4e1c |
| `feature/premium-settings-business-staff-2026-10-15` · #11 draft | `88d35fc07f1677ea03c9225b513adf84207f37a4` | 16 / 954 | 9 paths. Older business/staff layout changes touch staff onboarding and permissions. Reuse requires porting controls onto current authenticated workflows and testing authorization. | Defer | — |
| `fix/clementia-maximize-minimize-2026-10-14` · #10 draft | `aafab7734e2af2096826b7f5a1958fb0ee6ab150` | 30 / 954 | 8 paths. Assistant window-state and mobile layout changes overlap the current launcher. Validate keyboard focus and small-screen behavior separately before porting. | Defer | — |
| `frontend-all-stages-20261106` · #27 draft | `246d477cc4b4a93820d3cf2c6c5df2317dc1a905` | 16 / 7 | 8 paths. Static HTML preview and its verification do not bind actions to the ledger. Preserve the reference on its original branch. | Design reference | e9e4e1c |
| `integrate-reference-ui-20261107` · #31 draft | `d2791f83a1ad5b970eafb0e1e51b34b49e2f7d41` | 29 / 0 | 15 paths. Full source history retained as a second parent. Public welcome and account pages, real report-backed till, and responsive visual coverage. | Integrate now | e9e4e1c |
| `review/combined-settings-clementia-2026-10-15` | `9153c386156d4d5905e034da83c570dd9b430369` | 17 / 954 | 17 paths. Combined settings and assistant layout repeats both UI branches and would replace newer staff and home integrations. | Defer | — |
| `review/shop-entry-acceptance-20261107` · #30 draft | `a6170ef1bfdbc856d5cf4fb914aa55e291e00d39` | 6 / 0 | 3 paths. Desktop/mobile public shop spec and discovery in release/visual suites, with current copy, account navigation and negative ledger checks. | Integrate now | 8362ab2 |
| `security/auth-company-boundary-20261013` · #7 draft | `60c4c77ac1d8ca56fd6257e4c0f1913fee79bb2d` | 58 / 955 | 29 paths. Historical account/company boundary work spans local and backend services. Current membership RPC and PIN enforcement have different trust contracts. No wholesale import. | Defer | — |
| `stage-b-offline-integrity-20261106` · #26 draft | `d4589e2554afabf3e1b8b286b6ddbf8433734072` | 86 / 7 | 22 paths. Ported cache allowlist and tests on top of the main encrypted storage. Alternative vault and refund revision schema would strand existing keys/queued sales or duplicate policy authority. | Partially integrate | 8362ab2 |
| `v19/run12-supplier-tax-20261016` · #25 draft | `2acd7ca22017b29c0470cb1ad3e9a452a5e8d87e` | 26 / 604 | 20 paths. Recorded-tax and supplier-cash audits overlap the incorporated Run 12 reconciliation branch with differently named reporting and service contracts. Need ledger-by-ledger equivalence before combining totals. | Defer | — |
| `v19/run5-tenant-service-authorization-20261016` · #16 draft | `3d48eb9378e218d9c7cc6f80a2162d0f737378bc` | 54 / 802 | 27 paths. Alternative tenant server read/REST boundary overlaps incorporated Run 5 and the session-scoped SQL path. Needs a decision on the served endpoint and authorization contract. | Defer | — |

## Ancestors of main

All of the following tips are reachable from the baseline. Disposition is **already incorporated by ancestry**. There are no branch-only commits to import. A later change on main can still supersede behavior. The resulting integration reference for these rows is the baseline SHA above.

| Source | Head on inspection | Workstream |
|---|---|---|
| `backup/main-before-stakeholder-2026-10-30-ea165a5` | `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb` | V48: document real-account acceptance prerequisites and NO-GO gate |
| `development/v19-cloud-account-sync-integration` | `5e837e7052829e394b4dfa4f66d883308929f779` | V50: make QA account continuity guard null-safe for TypeScript |
| `development/v19-friends-web-test` | `9aefbdc0e88aece957d1c338d59a2ac862f10255` | Expose cloud business setup from account and home |
| `feat/remote-owner-attendant-sync` | `9041d89dac7a607e84fbc9b57f4f4c7e2671aa41` | chore(auth): type Google client ID environment variable |
| `feat/supabase-google-auth` | `e92cfd3351a9a69cb6476dca13d0431660a7389d` | chore: sync pnpm lockfile |
| `feature/cloud-refund-policy` | `49ecfa5a392007b40bdf67121d4556e897d984eb` | Add per-company cloud refund policy (PRD R3) |
| `feature/next-upgrade` | `3caefad023a7004c628c43b0b2e639c4b43ef1ae` | Guard async state updates after unmount in shared shop |
| `release/shared-shop-ledger` | `a5c141f445393c1e1cb617ca1eed7b53d46d6175` | Record the shared shop migration under its production version |
| `stage9/multistore-integration-20261014` | `cea840632e8b4f03ceabe7ae899d0d7c5bfe3da2` | feat(stage9): add review-only private store device scope schema and reader [skip ci] |
| `stage9/round1-enrollment-lifecycle-20261015` · #12 draft | `359ea1666225d802629f868c52af48ef283f2b02` | Draft: Stage 9 Round 1 owner-approved device enrollment and revocation |
| `v19-windows-preview-2026-10-12` | `a2454494351a0533409be27fcccb864ec0d6cc3b` | Merge Supabase Google Auth |
| `v19/run10-customer-receivables-20261016` · #22 draft | `55fc621f1179bd620d4bfa30851742f84c8a6629` | Draft: V19 Run 10 customer receivables, exact repayments and prepaid cash conservation |
| `v19/run11-company-refund-policy-20261016` · #23 draft | `8f91b8b55c06ac831866660dd352a695c803a8fe` | Draft: V19 Run 11 company-opt-in refunds, saved policy snapshots and return authorization |
| `v19/run12-supplier-tax-reconciliation-20261016` · #24 draft | `00d130d0c883f37b3dedbdda08a0888ac7bae050` | Draft: V19 Run 12 supplier payable settlement, expense currency and original-sale tax audit |
| `v19/run13-multistore-development-20261016` | `1564457bd18727916c3ca51df4dd5312834f2cc9` | Run 13: supersede partial checkpoints with consolidated source increment [skip ci] |
| `v19/run14-secure-sync-development-20261016` | `f2eedd8d52a88b94478d74719d5bf8bcda89ddcc` | Run 14: publish one consolidated optional encrypted-sync source increment and deferred QA [skip ci] |
| `v19/run15-payment-sandbox-development-20261016` | `f94aa45d8a99803f60c68be267b3bd9a915a16f8` | Run 15: consolidate provider-neutral payment sandbox development, source corrections and deferred acceptance [skip ci] |
| `v19/run16-public-commerce-development-20261016` | `eec6b3384f4c7fd659d9e858429757da2a0d3986` | Run 16: update consolidated handover with final source-review checkout availability correction [skip ci] |
| `v19/run17-assistant-analytics-development-20261017` | `c6280f75eb4bc243c761c22990b08b7af403de9e` | Run 17: consolidated assistant/analytics source increment, manual review corrections and deferred QA gates [skip ci] |
| `v19/run18-hardening-development-20261017` | `017d473f6a44ca576c73d2d9ad3804300f85ba98` | Run 18: document final manual update recovery-lock safeguard and exact reviewed source SHA [skip ci] |
| `v19/run19-device-uat-development-20261017` | `1b6dd6738c6d248ea7469f119a135a729d312295` | Run 19: complete consolidated device-UAT source increment, manual review and deferred hardware signoff [skip ci] |
| `v19/run2-transactional-recovery-20261015` · #13 draft | `939e06de8eb313b64211beeb1c94e26859b4af5b` | Draft: V19 Run 2 transactional recovery and revocation-safe owner binding/transfer |
| `v19/run20-operations-release-development-20261017` | `f144baec03143f1f0844811084e5d6f030d56aa4` | Plan Stages 21–32: finish full V19 development and developer verification before owner UAT [skip ci] |
| `v19/run3-cloud-membership-20261015` · #14 draft | `e68619ff14937d4ce19951002f5a4c5e12f5f897` | Draft: V19 Run 3 complete cloud membership source — targeted invites, RLS and tenant isolation |
| `v19/run4-session-lifecycle-20261016` · #15 draft | `f983c7c924b1454c0cf0d2b215498887fd47d01e` | Draft: V19 Run 4 whole-run cloud AuthGate, session lifecycle and revocation probe |
| `v19/run5-tenant-authorization-20261016` · #17 draft | `d06bdfe9b390f9f67a466278b4280cd5398a4e35` | Draft: V19 Run 5 tenant-scoped cloud authorization and write-block diagnosis |
| `v19/run6-staff-authorization-20261016` · #18 draft | `23b06f9f6fb5b94cc4441f3ce83f7ca3037d7bab` | Draft: V19 Run 6 staff authorization, shift-safe supervisor approvals and entrypoint gates |
| `v19/run7-cross-db-recovery-20261016` · #19 draft | `ccb03e864d24917f6f1edcaeb322b8ebb9bd3e0e` | Draft: V19 Run 7 cross-IndexedDB crash recovery, consistent backup and retail write barriers |
| `v19/run8-migration-backup-recovery-20261016` · #20 draft | `f1884ff3925f75755a0b97824c557b096ed2e102` | Draft: V19 Run 8 historical backup migration, authenticated encryption and verified recovery |
| `v19/run9-inventory-financial-reconciliation-20261016` · #21 draft | `e80592b71ffec349f35b6092966093df8397ee57` | Draft: V19 Run 9 FIFO inventory valuation, supplier cost and refund reconciliation |
| `v19/stage21-baseline-ci-recovery-20261017` | `8f0e9b646938f92adc0332c64f530388099b49f5` | Stage 21: precisely record repeated pre-step CI failure and nine narrowly scoped V8 source regression observations [skip ci] |
| `v19/stage22-finance-completion-20261017` | `a2c445f0f1eee41bcfb9926991ff9c23e77e88c6` | Stage 22.1 allow zero-tender sale evidence without inventing a payment [skip ci] |
| `v19/stage22-financial-workflow-completion-20261017` | `52668cc28687ef6ce1304a601e45413bac6d3093` | Stage 22: archive must reject orphan wallet benefits without verified cash-transfer provenance [skip ci] |

PR #32 is the review vehicle for this candidate. No original PR was closed and no branch was deleted.
