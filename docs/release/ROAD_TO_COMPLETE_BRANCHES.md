# Stage 21 branch evidence — 17 November 2026

Baseline: `41d4bab619db1808f21471299bd7760eee1a6836`. All 42 non-main refs from the clean clone are included. No branch was merged, closed or deleted.

Ancestry proves source history was incorporated. Patch equivalence and exact blob matching are separate signals; neither proves present behavior. Squash merges can leave all commits patch-unique even when useful behavior is integrated. Historical semantic decisions remain in [RC_RECONCILIATION.md](RC_RECONCILIATION.md); they are not new acceptance results.

| Branch | Exact tip | Ahead/behind | Equivalent patches/all ahead | Matching changed paths/all | Current disposition |
|---|---|---:|---:|---:|---|
| `backend-b-e-20261106` | `9f14d66345fc6172d8ba713fd54cf12a2bd72b49` | 14/455 | 0/14 | 0/12 | Retain; semantic review open |
| `backup/main-before-stakeholder-2026-10-30-ea165a5` | `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb` | 0/549 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `chore/cleanup-historical-docs` | `f4b7a81bbf43813e070e39be74683fffd843a42a` | 1/280 | 0/1 | 0/361 | Retain; semantic review open |
| `claude/happy-ptolemy-u4qo44` | `b1abed8e2634411209d300834045c0f9b5b77e01` | 1/193 | 0/1 | 2/8 | Retain; semantic review open |
| `completion/cloud-foundation` | `779a934fc0c4739db940e71bf2bec5f8c189154c` | 2/1403 | 0/2 | 3/23 | Retain; semantic review open |
| `development/v19-friends-web-test` | `9aefbdc0e88aece957d1c338d59a2ac862f10255` | 0/554 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `development/v19-owner-completion-audit` | `3896b5797693e1e3d074bd8f6f0cabe628092b08` | 6/280 | 0/6 | 2/113 | Retain; semantic review open |
| `development/v19-unified-reconciliation` | `669f1cf223385931de67f31d3c002d60d2cfa16d` | 3/487 | 0/3 | 0/42 | Retain; semantic review open |
| `docs/production-status-20261115` | `a462cfc024becec82ae350dc6f1994aaff72c9c0` | 1/4 | 1/1 | 4/4 | Retain; semantic review open |
| `feat/core-shop-operational-upgrades-20261114` | `12f86f01698e892d966dfebab7b384abce5672d8` | 9/149 | 0/9 | 15/18 | Retain; semantic review open |
| `feat/phase-b-persisted-business-types-20261115` | `ecd7eaebd138f29e4d029f6bcf6e714737a5e26e` | 8/146 | 0/8 | 17/17 | Retain; semantic review open |
| `feat/phase-b-product-variants-20261115` | `ee63f588cfcca2f2ebed6ba6b621ec09d1e941e5` | 7/145 | 0/7 | 11/13 | Retain; semantic review open |
| `feat/phase-b-secure-onboarding-20261114` | `a7f9d44d0a9daad4689400dada69151d0e7acd94` | 5/147 | 0/5 | 3/7 | Retain; semantic review open |
| `feat/photo-stage11-atomic-batch-stocktake-20261115` | `71f89fc225dcb96be97b51f198c213eb3f23f40d` | 16/145 | 0/16 | 10/12 | Retain; semantic review open |
| `feat/photo-stage7-apple-oauth-gated-20261115` | `abab98a822b1db798f1fc029ac9a743856855400` | 3/145 | 0/3 | 3/3 | Retain; semantic review open |
| `feat/photo13-public-order-requests-20261115` | `e8cd7eaee96961f1fccb19a15a3ccfb4b5c4f4c1` | 33/145 | 0/33 | 13/17 | Retain; semantic review open |
| `feat/photo29-integrated-source-20261115` | `093c32ac9718283a4a7826e5905522393eefb2c7` | 7/145 | 0/7 | 44/46 | Retain; semantic review open |
| `feat/public-marketing-pillars-verified-20261114` | `46c2e8d924278efadf941fd0309ec6d7d025df67` | 3/147 | 0/3 | 4/4 | Retain; semantic review open |
| `feat/remaining-stages-business-joining-catalog-20261114` | `30fb131178dd4a66c48c2411295e790f340fd305` | 11/147 | 0/11 | 0/16 | Retain; semantic review open |
| `feat/shop-stocktake-quotes-expenses-reporting-20261114` | `5bd420a8686781f3975be275513f9b152a80d5c5` | 9/148 | 0/9 | 10/13 | Retain; semantic review open |
| `feat/telegram-daily-summary` | `d691cae3db3d23cd498bc3f1db454d0bfc11f824` | 1/6 | 1/1 | 8/8 | Retain; semantic review open |
| `feature/premium-settings-business-staff-2026-10-15` | `88d35fc07f1677ea03c9225b513adf84207f37a4` | 16/1402 | 0/16 | 0/9 | Retain; semantic review open |
| `fix/assistant-reversal-preview-identity-20261113` | `f124bcea529e0e06982f3d53f8345b3a8e377ffa` | 0/164 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `fix/physical-return-store-provenance-20261113` | `90ec694c8b602c848e95edf44874cb51beccf353` | 0/163 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `frontend-all-stages-20261106` | `246d477cc4b4a93820d3cf2c6c5df2317dc1a905` | 16/455 | 0/16 | 0/8 | Retain; semantic review open |
| `qa/pilot-field-acceptance-20261116` | `1317b7635a8254dc0f2c61a61295c886ef101c13` | 3/3 | 0/3 | 2/2 | Retain; semantic review open |
| `qa/production-public-smoke-20261116` | `bd1b54fe63dba34b75c5a2a114bc0bafcab05359` | 3/3 | 0/3 | 3/3 | Retain; semantic review open |
| `qa/reverify-16-existing-stages-20261114` | `80e8055ffa717f905657e199309a700edfffb955` | 5/150 | 0/5 | 3/9 | Retain; semantic review open |
| `release/fresh-start-required-signin-20261113` | `590e047d24704a7fafc1ad79a3c3756d38a5bd50` | 0/151 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `release/production-readiness-reset-20261113` | `636e57a4940aafc8c234d663711b5688f33acac7` | 3/151 | 0/3 | 0/2 | Retain; semantic review open |
| `release/shared-shop-ledger` | `a5c141f445393c1e1cb617ca1eed7b53d46d6175` | 0/473 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `review/combined-settings-clementia-2026-10-15` | `9153c386156d4d5905e034da83c570dd9b430369` | 17/1402 | 0/17 | 1/17 | Retain; semantic review open |
| `review/shop-entry-acceptance-20261107` | `a6170ef1bfdbc856d5cf4fb914aa55e291e00d39` | 6/448 | 0/6 | 2/3 | Retain; semantic review open |
| `security/enforce-csp-20261115` | `cdf9a50f59ca500f4abba9c61f972d459f0da207` | 2/6 | 0/2 | 8/8 | Retain; semantic review open |
| `security/mandatory-online-account-boundary-20261113` | `0f453be184bc606188f7ec92782708b0a041fdb6` | 0/7 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `stage-b-offline-integrity-20261106` | `d4589e2554afabf3e1b8b286b6ddbf8433734072` | 86/455 | 0/86 | 0/22 | Retain; semantic review open |
| `ui/stockdey-29-reference-parity-20261114` | `7afa4137ce8a0f4ea85390ce0866a35cc927ffd7` | 5/151 | 0/5 | 0/4 | Retain; semantic review open |
| `v19/run11-company-refund-policy-20261016` | `8f91b8b55c06ac831866660dd352a695c803a8fe` | 0/1052 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `v19/run12-supplier-tax-20261016` | `2acd7ca22017b29c0470cb1ad3e9a452a5e8d87e` | 26/1052 | 0/26 | 0/20 | Retain; semantic review open |
| `v19/run4-session-lifecycle-20261016` | `f983c7c924b1454c0cf0d2b215498887fd47d01e` | 0/1250 | 0/0 | 0/0 | Retain; incorporated by ancestry |
| `v19/run5-tenant-service-authorization-20261016` | `3d48eb9378e218d9c7cc6f80a2162d0f737378bc` | 54/1250 | 0/54 | 0/27 | Retain; semantic review open |
| `v19/stage-stakeholder-copy-finalization-20261109` | `d5132fb98d590e55f6560833df133c6efd706d69` | 3/284 | 0/3 | 1/2 | Retain; semantic review open |

## Priority semantic review

- Owner-completion branch: 113 changed paths, including public commerce reservations, schedules and accounting changes. Its review assumes a November 9 schema, so do not import its migration chain into the November 17 candidate. Inspect unique behaviors individually in Stages 22–29.
- Unified reconciliation: alternate database identities and key-vault recovery need populated conversion proof before integration.
- Backend/offline-integrity branches: canonical refund policy and sealed queue already exist; competing policy migrations and vaults remain unsafe to import blindly.
- Supplier-tax and tenant-service branches: keep the canonical currency/supplier and session-bound RPC contracts while checking unique tests and adapters.
- Field acceptance: both changed document blobs already match main exactly; no duplicate import is needed. The active runbook still needs candidate-specific instructions (updated in this increment).
- Candidate batches 1–5 remain inactive reference/checker modules. They are not financial authorities or accepted E2E suites.

Reproduce: `node scripts/road-to-complete-branches.mjs 41d4bab619db1808f21471299bd7760eee1a6836`. Full commit/path details: [ROAD_TO_COMPLETE_BRANCHES.json](ROAD_TO_COMPLETE_BRANCHES.json).
