# Tallybook V19 stakeholder-readiness review — 9 November 2026

**Decision: NOT READY for a comprehensive full-scope stakeholder handover or production certification.** The existing application passes the local checks recorded below, but the hosted database lacks required operations and the full approved scope still contains disabled functionality. Passing regression tests does not erase those gaps. The owner's follow-up requested review of the existing repository without new provider setup; no provider was selected or enabled.

Reviewed main: `a55686f6689ac2a2898ee7ad89ccf9c6f6317361`. Review branch: `development/v19-owner-completion-audit`. The initial review changed debt-insight aggregation. Continued implementation now also covers executable local store transfers and order fulfillment, historical return destinations, preview-bound reversals, scheduled advisory reviews, reconciled store contribution reporting, and enforced CSP. See DEVELOPMENT.md for the current implementation and verification record. No production deployment, customer-data change, hosted migration or shared-history rewrite was performed.

## Current continued verification

The exact pinned runtime (Node 24.19.0, pnpm 10.34.0) now passes **1,190 client tests in 156 files, 994 native/server/SQL tests with zero skips, TypeScript and the production build**. The customer catalogue → reservation → merchant POS → collection flow executes canonical SQL from Chromium and WebKit (2/2). The updated visual suite passes 3/3, including assistant modal focus/keyboard and 320–1536px layouts. The full WebKit functional/Auth suite previously passed 16/16 at `9c1527f`; subsequent commerce source is separately covered by the two-engine integration journey. Final source-specific logs are recorded under `evidence/continued/`.

WebKit's initial environment blocker was resolved by extracting the missing Debian shared libraries into a temporary browser installation. The system package database is unchanged. Playwright host validation was bypassed because it cannot discover those temporary libraries; browser execution and application assertions were not skipped. This is Linux WebKit evidence, not physical Safari/iOS acceptance.

The source now includes owner-controlled public catalogue publication, authenticated customer reservations, shared stock protection, private order views, retained quote terms, atomic POS linking and manual fulfilment evidence. The new migration remains local. This improves the approved commerce workflow without authorizing hosted changes or enabling online payments.

## Fixed during review

`createLocalInsights` previously added customer balances using JavaScript Number. Two individually valid balances, `9007199254740991` and `2`, produced the rounded aggregate `9007199254740992`. Aggregation now uses BigInt and renders the exact decimal string `9007199254740993`. A regression exercises the failing boundary. Existing ordinary balance behavior remains covered. No ledger records or money schemas change.

## Initial review verification (superseded by the continuation below)

Environment: Linux, Node **24.22.1**, Corepack pnpm **10.34.0**, frozen lockfile, Playwright Chromium 156. The repository CI pins Node 24.19.0; these local results must not be described as a run on that exact patch version. The first installation attempt failed because Corepack's default cache path was unavailable. Retrying with a writable task-specific COREPACK_HOME succeeded without dependency changes.

| Check | Result | Evidence |
|---|---|---|
| Frozen dependency install | PASS | evidence/install.txt |
| Complete native/server baseline | 989 passed, zero failures/skips | evidence/native.txt |
| Complete native/server after fix | 990 passed, zero failures/skips | evidence/native-final.txt |
| Complete client/IndexedDB baseline and final rerun | 1,169 passed across 154 files on each run | evidence/client.txt, evidence/client-final.txt |
| Insight regression after fix | 12 passed | evidence/insights-regression.txt |
| TypeScript after fix | PASS | evidence/types-final.txt |
| Production PWA/server build after fix | PASS | evidence/build-final.txt |
| Chromium functional/native IndexedDB | 9 passed | evidence/browser.txt |
| Chromium authentication/restart | 5 passed | evidence/auth.txt |
| Built-app offline | 3 passed; final bundle rerun recorded separately | evidence/offline.txt, evidence/offline-final.txt |
| Responsive dashboard/visual | 3 passed; widths 320–1536 | evidence/visual.txt |
| Integrated reference UI/recovery | 8 passed | evidence/reference-ui.txt |
| Dependency audit, moderate threshold | PASS; one low advisory | evidence/dependencies.txt |
| WebKit browser suite | BLOCKED before page creation by missing host libraries | evidence/webkit.txt, evidence/webkit-install.txt |

WebKit binaries downloaded, but launching the first browser test failed because `libgtk-4.so.1`, `libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`, `libmanette-0.2.so.0`, `libhyphen.so.0` and `libGLESv2.so.2` are absent. The managed package helper and `sudo` are unavailable. The run stopped after one infrastructure failure; six scenarios were not run. This is not an application assertion failure or a passing Safari/device test.

These are 28 browser scenarios across five suites, with overlapping entry scenarios counted as separate suite executions, not 28 independent workflows. Tests use synthetic identities and data. PGlite exercises real SQL on a disposable PostgreSQL-compatible engine with fixture Auth roles; it does not prove hosted OAuth, provider networking, production concurrency, or physical device behavior. Client tests use fake IndexedDB and a Web Locks shim; the Chromium suites provide separate native browser evidence. Build warnings about chunk sizes and dev-server precache globs remain warnings, not failed gates.

Reproduce from the repository root using the commands in `.github/workflows/release-validation.yml`, plus `pnpm exec playwright test --config playwright.visual.config.mjs` and `pnpm exec playwright test --config qa/reference-integrated-ui.config.mjs`. Install browser binaries first. Local raw logs remain under `artifacts/owner-completion-2026-11-09/`; committed copies (trailing whitespace normalized) and SHA-256 hashes are in this directory.

## Hosted migration blocker — freshly verified, not inherited from an old report

Read-only Supabase inspection on 9 November 2026 at approximately 15:34 Dubai time found the Tallybook project ACTIVE_HEALTHY. Its migration history still ends at `20261105120712`. Catalog lookup confirmed `tallybook_shop(text,jsonb)` exists, but `tallybook_shop_ops(text,jsonb)` and `tallybook_shop_order_lines(text,jsonb)` are absent.

All eight missing hosted migrations already exist in the canonical repository. They are absent from hosted history, not absent source files or migrations renamed under a different identifier:

1. `20261106120000_shop_refund_policy.sql`
2. `20261106130000_invite_24h.sql`
3. `20261108100000_shop_stage_c_read_models.sql`
4. `20261108110000_shop_stage_d_stock_workflows.sql`
5. `20261108120000_shop_stage_d_purchase_payables.sql`
6. `20261108130000_shop_stage_d_online_orders.sql`
7. `20261109010000_shop_purchase_order_read_model.sql`
8. `20261109020000_shared_order_lines.sql`

`migrations.json` records all 16 canonical migration filenames, hashes and observed hosted application status. `qa/backend-stage-b-e.test.mjs` executes the canonical chain, populated upgrades, ambiguous-policy rejection, tenant/role/session denial, stock-transfer conservation, partial receiving, supplier settlement, order/sale matching and rollback. Historical applied migrations were not edited. Transactional migration files are ordered upgrades, not scripts to blindly reapply without their migration history.

**Required before hosted stakeholder handover:** separately authorized application of the exact pending chain against the intended environment, then verification of the deployed frontend/schema pairing and synthetic owner/attendant workflows. The owner directive explicitly prohibits live migration execution without authorization. This review prepares evidence and does not claim those changes are applied.

## Security and recovery findings

The live security advisor reports leaked-password protection disabled. [Supabase remediation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). It also reports two authenticated SECURITY DEFINER RPC warnings and 22 RLS-without-policy informational findings. The RPC-only model intentionally denies direct table access; adding permissive table policies to silence those findings would weaken it. Session and membership authorization are exercised in isolated tests, but that is not an independent full production security audit. [RPC warning guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

CSP is now enforced in both Vercel configuration and the Node server; the built-app browser suite verifies offline checkout and blocks an injected inline script. The active local Dexie ledger, parked carts and pending device-ledger checkouts remain plaintext; encrypted exports and the sealed shared-shop queue have different protection boundaries. A permanently lost device key cannot recover never-uploaded pending sales without a previously verified recovery copy. These limitations are documented in `docs/security/OFFLINE_DATA_THREAT_MODEL.md`; passing key-loss tests proves preservation/fail-closed behavior, not recovery of the lost payload.

## Requirements and branches

[TRACEABILITY.md](TRACEABILITY.md) retains all 82 original acceptance units across all 12 stages, their source paths and historical statuses, with current observations on the missing/incomplete areas. It does not silently convert historical missing statuses to complete based on test counts. In particular:

- Public storefront, online payment and automatic synchronization remain false in `COMMERCE_RELEASE_SCOPE`. Local reservation and fulfilment are enabled. A separate authenticated public-catalogue workflow now extends the authoritative shared-shop SQL ledger and is tested through customer and merchant browsers. The legacy device-local public flag remains disabled; it does not control the new SQL catalogue. Online payments remain disabled.
- `RUN17_AUTOMATIC_ACTIONS_ENABLED` remains false for financial/external actions. A separate persisted owner-approved local advisory scheduler now supports daily/weekly review, pause/cancel, audit, bounded catch-up, concurrent-tab deduplication and restore-paused behavior. It does not send external notifications.
- The shared-shop server ledger and the optional device-ledger synchronization architecture have different contracts. Successful shared-till replay does not prove full financial/business-data replication for the latter.
- Full active-ledger encryption/recovery and the historical deferred branch contracts remain unclosed development/verification work. They cannot be relabelled stakeholder-only checks.

[BRANCHES.md](BRANCHES.md) and `branches.json` record all 75 remote tips. 59 are ancestors of reviewed main. Fourteen historical divergent heads match the previously documented heads and retain their contract-specific dispositions; those deferrals are not completion evidence. Two additional divergent tips contain changed files byte-identical to main and need no duplicate integration. No speculative merge was performed.

## Handover boundary

Local regression evidence supports the existing tested workflows: setup/PIN entry, owner/attendant navigation, sales and receipts, tax checkout, offline PWA reload, populated-ledger upgrades, key continuity and isolated database finance/authorization. It does **not** support the requested declaration that every approved stage is finished or that the currently hosted full application is ready.

Remaining external acceptance includes real OAuth return, independent accounts/devices, physical printers/scanners/authenticators and owner-controlled recovery drills. These are distinct from the hosted schema mismatch and disabled source features above. The latter must not be disguised as stakeholder testing. No request is made for stakeholders to compensate for unfinished engineering.
