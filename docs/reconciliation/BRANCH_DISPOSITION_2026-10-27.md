# Branch disposition before main integration — 2026-10-27

The independent Windows clone retains every remote branch and Git history. `branch_provenance.json`, `file_sha256_comparison.json`, `SOURCE_RESOLUTION_REGISTER.md`, and `FEATURE_INTEGRATION_MAP.md` record the earlier Master ZIP comparison. This supplement checks branch heads still outside the development branch's ancestry at `03a89a2f699fa34eea019f8ee1020448f0eb7efd`. A divergent branch is a source candidate, not an instruction to replace later code wholesale.

| Branch head | Introduced runtime paths relative to common ancestor | Disposition |
|---|---:|---|
| `completion/cloud-foundation` `779a934fc0c4739db940e71bf2bec5f8c189154c` | 10 | Paths exist in the current cloud/auth UI with later changes. Retain current offline and company boundaries; remote account acceptance remains open. |
| `feat/auth-gate-2b1` `a4b83363552c43de77124fa87d8a8c183a644605` | 2 | Older gate component path is absent; current `client/src/auth/AuthGate.tsx` supplies the cloud-only gate and local staff guard. Do not restore an older gate over it. |
| `feature/premium-beginner-home-clementia` `f854304053a911550ebdd4b30bb5d6885abb515d` | 10 | Eight introduced paths are byte-identical to current source; the other two have later changes. Retain the current wired home and launcher. |
| `feature/premium-settings-business-staff-2026-10-15` `88d35fc07f1677ea03c9225b513adf84207f37a4` | 4 | Current tax, business and staff screens have later behavior; the old standalone settings CSS is absent. Do not replace authorization or tax logic with styling branch files. |
| `fix/clementia-maximize-minimize-2026-10-14` `aafab7734e2af2096826b7f5a1958fb0ee6ab150` | 5 | Ported in-place maximize/minimize, one-time standalone restore and stronger company/currency conversation isolation, with focused tests. |
| `review/combined-settings-clementia-2026-10-15` `9153c386156d4d5905e034da83c570dd9b430369` | 9 | Clementia behavior above recovered; old combined settings styling is not accepted over newer business/staff flows. |
| `security/auth-company-boundary-20261013` `60c4c77ac1d8ca56fd6257e4c0f1913fee79bb2d` | 23 | Five introduced files are byte-identical; later security and server boundaries occupy the others. Current authorization/isolation tests govern; real remote membership remains unaccepted. |
| `v19/run12-supplier-tax-20261016` `2acd7ca22017b29c0470cb1ad3e9a452a5e8d87e` | 15 | Current active `run12SupplierFinanceAudit`, `run12SaleTaxAudit` and integration tests supersede the old module names. Stage 22 finance checks were merged separately. |
| `v19/run5-tenant-service-authorization-20261016` `3d48eb9378e218d9c7cc6f80a2162d0f737378bc` | 21 | Current active `run5TenantRuntime`, `run5TenantRoutes`, authorizer and policy supersede older service filenames. Live two-account/RLS acceptance remains open. |

`v19/stage22-finance-completion-20261017` at `a2c445f0f1eee41bcfb9926991ff9c23e77e88c6` is now a parent of merge commit `c9f736bb9ef023d1bfaf34604eb946f4728a7336`; see `STAGE22_FINANCE_BRANCH_INTEGRATION_2026-10-27.md`. The nine heads above remain preserved in Git and are not falsely presented as merged commit histories. The app's production acceptance still follows the 82-unit register and outstanding blocker record.
