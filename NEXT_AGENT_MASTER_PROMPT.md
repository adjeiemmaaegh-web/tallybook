> **12 October 2026 — newest continuation:** Resume from `TALLYBOOK_V19_FIN002_WALLET_CHRONOLOGY_CONTINUATION_2026-10-12_SOURCE.zip`, not FIN002_DATES or earlier. Wallet liability reconstruction now compares actual posting instants and checks strict posting calendars. Native 457/457 and mock 4/4 passed, full client suite unrun. FIN-002 and full release remain **NO-GO / INCOMPLETE**.

> **12 October 2026 — NEW LATEST LOCAL BASELINE:** Continue from `TALLYBOOK_V19_FIN002_PERIOD_CONTINUATION_2026-10-12_SOURCE.zip`, not the preceding FIN002_PREPAID/CURRENCY archives. FIN-002 daily/report conservation now independently reconstructs day/category figures and validates all original posting dates; native Node22 QA 449/449 and separate mock 4/4 passed. FIN-002 and all release-critical gates remain NO-GO, full client/TypeScript/browser not verified. See `docs/release/FIN002_PERIOD_CONSERVATION_CONTINUATION_2026-10-12.md`. Historical directions below are subordinate to this source-state note.

# Tallybook V19 — master prompt for the next development agent

Prepared from the verified handover dated 10 October 2026.

**How to use:** Give the new coding agent this entire document together with the handover ZIP or access to the existing repository. This document is an implementation instruction when the owner submits it to that agent to resume work. Creating this document does not itself restart the previous agent's implementation work.

---

## 1. Your assignment

You are the lead engineer responsible for completing Tallybook's remaining production-readiness work. Work in the actual repository, implement working software, exercise it in appropriate environments, fix failures, and retain reproducible evidence. Continue the existing twelve-stage roadmap. Do not replace the application, invent another stage, or deliver only recommendations.

The previous agent stopped at the owner's explicit request to hand over promptly. That stop was not a declaration of completion. My submission of this prompt to you authorizes resuming local development and testing. It does **not** authorize an external deployment, a paid hosting purchase, a live payment, a provider account, destructive changes to real business data, or external publication.

Your objective is to resolve the remaining acceptance criteria and prepare a demonstrably production-ready release. If required credentials, hardware, business decisions or deployment approval remain unavailable, complete independent authorized work and report the release as **NO-GO / INCOMPLETE** with the precise outstanding gates. Never substitute a mocked or skipped check for external verification.

## 2. Owner decisions you must preserve

These are settled requirements. Do not ask the owner to approve them again.

1. **Default market and tender:** Ghana, Ghanaian cedis (`GHS`) and Mobile Money (`mobile` / MoMo). Users choose their country and payment-provider details during business setup. Keep country, currency and provider configuration flexible.
2. **No approved online gateway:** No payment gateway account has been set up or authorized. Do not assume a particular MoMo or card gateway is approved. Provider names entered in setup are labels, not authorization or proof of an integration.
3. **Mock payments for now:** Continue local mock testing. The owner will select the provider and supply sandbox credentials securely later. Do not request secrets in chat, commit them, or include them in logs or archives. Do not initiate real charges or refunds.
4. **Tax:** Configurable per business, **off until explicitly configured by the owner**. Registration status, rate and inclusive/exclusive rules must be supplied. Do not infer a Ghana rate, auto-enable tax based on country, or claim statutory compliance from the current single-rate calculator.
5. **Deployment:** No staging host is authorized. Do not deploy to production or any external server without explicit approval. Continue local testing and present a concrete staging proposal before any deployment or external recovery drill.
6. **Offline retail:** Local checkout, stock, purchases, customers and receipts must continue without internet or a cloud account. Cloud is optional and explicitly opted into.
7. **Data integrity:** Preserve business separation, financial history and recoverability. Do not invent historical cost, due dates, delivery outcomes or forecast confidence. Do not silently waive requirements to make the release appear complete.

Ask only for genuinely missing information or approvals that affect the next dependent step. Bundle questions where practical, explain why they are needed, and continue unrelated work. A missing payment account is not a reason to stop improving local accounting, security or recovery.

## 3. Find and verify the correct starting point

Existing Windows repository:

```text
C:\Users\adjei\Videos\New folder\tallybook_fixed
```

Handover bundle:

```text
artifacts/release-v19/TALLYBOOK_V19_HANDOVER_2026-10-10.zip
```

Expected SHA-256 for that original handover ZIP:

```text
20F6800C5D26A9BBB17CD50B4EECBB9D16167FEB696A3269C90AFC67C653D4D8
```

The ZIP contains the `tallybook_fixed/` source directory, production build, source patch, commit list and retained evidence. It excludes `.git`, installed dependencies, secrets and the private original source backup. This new prompt was created after the ZIP and is supplied separately. If working on another machine, locate the extracted root; do not assume the Windows path exists there.

Git state at handover:

| Commit | Purpose |
|---|---|
| `a944037` | Preserved original V19 source baseline |
| `42a4e62` | Toolchain portability and audited dependency updates |
| `ca11f66` | Cost ledger, tax, guarded retail workflows and mock payment contract |
| `a0ce1e7` | Browser QA and release documentation |
| `4c8d207` | Owner-requested handover and remaining-work instructions |

Branch at handover: `codex/v19-release-completion`. The working tree was clean then; inspect it now and preserve any later changes, including this prompt. Do not reset to the original archive or overwrite the completed work. Create a safe continuation branch where appropriate. If only the ZIP is available, verify its checksum, initialize a local baseline if needed, and preserve the included patch/history evidence instead of pretending the original commits are present.

Read these before changing product code:

```text
AGENTS.md and applicable repository instructions, if present
docs/release/HANDOVER.md
docs/release/RELEASE_REPORT.md
docs/release/blockers.json
docs/release/traceability.json
docs/release/write-entrypoints.json
docs/release/OPERATIONS.md
docs/release/STAGING_PROPOSAL.md
docs/release/staging-manifest.json
docs/release/dependency-inventory.json
docs/release/stage2-archive-comparison.json
docs/release/source/TALLYBOOK_V19_DEVELOPMENT_AGENT_MASTER_PROMPT.md
docs/release/source/TALLYBOOK_V19_FULL_RELEASE_AUDIT_2026-10-10.md
```

Use the owner's latest instructions first, then this continuation assignment, then the handover's source/evidence and original acceptance documents. Treat historical completion claims as claims to verify. The traceability register contains 82 units across stages 1–12; the blocker register contains 19 issues, including one already-resolved portability issue. They define the starting backlog, not an immutable limit on newly discovered defects. The latest source and executed evidence may require correcting stale paths or notes.

## 4. Understand what already works

Preserve and extend the existing implementation:

- Schema **26** adds `inventoryCostEvents`. FIFO receipt layers, issue allocations and full sale reversals are persisted and replayable. Sales record cost evidence; unknown legacy cost stays unknown.
- Core stock/sale/purchase operations include cost and quantity changes in one transaction. Tests cover oversell, duplicate retry, late-write rollback, foreign-company records and tampered allocation evidence.
- `costReconciliation.ts` independently checks cost events against stock movements and saved sale lines. Financial intelligence separates recorded tax from sales and displays COGS only when evidence reconciles.
- `sales/tax.ts` implements an owner-supplied single-rate tax policy using exact integer intermediates. Business setup, checkout, quotations, receipts, recovery, backup validation and management reports use saved tax snapshots.
- Permission checks moved inside several core transactions; company clearing scopes the main database. Backup includes cost events plus eight previously missing sync/store tables. Restored sync consent is disabled until the owner opts in again.
- Quotations have an expiring company-scoped preparation handoff. The user must review and save the offer. Conversion links the quotation and sale atomically.
- Insights use real remaining batches and observed SKU sale quantities, with missing-evidence limitations.
- `server/paymentGateway.mjs` is an isolated local mock contract. Default mode is disabled; mock mode is restricted to local testing/development. It has no HTTP endpoint or retail-ledger posting.
- Browser QA uses isolated synthetic contexts. Production PWA tests cover offline checkout/receipt/reload, including configured tax.

Important implementation entry points:

```text
client/src/db/TallybookDB.ts
client/src/features/inventory/costLedger.ts
client/src/features/inventory/inventory.ts
client/src/features/inventory/stage2Inventory.ts
client/src/features/inventory/advancedInventory.ts
client/src/features/purchases/purchases.ts
client/src/features/sales/sales.ts
client/src/features/sales/tax.ts
client/src/features/sales/recoverSavedCheckout.ts
client/src/features/assistant/reversals.ts
client/src/features/reports/costReconciliation.ts
client/src/features/reports/financialIntelligence.ts
client/src/features/reports/reports.ts
client/src/features/reliability/integrity.ts
client/src/features/business/businessProfile.ts
client/src/features/business/activeCompany.ts
client/src/features/backup/backup.ts
client/src/features/assistant/assistantLocalStore.ts
client/src/features/staff/staff.ts
client/src/features/customers/quotations.ts
client/src/features/customers/quotationHandoff.ts
client/src/features/insights/insightEvidence.ts
client/src/features/sync/
client/src/features/stores/
client/src/features/commerce/commerce.ts
server/index.ts
server/paymentGateway.mjs
server/sync*.mjs
```

Read related tests and call sites before editing. Shared data contracts require coordinated updates to UI, validation, recovery, exports, assistant flows, sync and backups.

## 5. Reproduce the baseline; do not inherit a certification

Historical handover results were:

| Check | Recorded result |
|---|---|
| Client tests | 696 passed in 86 files |
| Types, frozen install, production build | Passed |
| Native browser suite | 3 passed; one test loops historical schemas 1–25 |
| Production offline browser suite | 3 passed, desktop/phone widths including a taxed sale |
| Mock gateway contract | 4 passed separately |
| Full Windows Node/server suite before the mock addition | 123 passed, 28 failed, 1 skipped out of 152 |
| Dependency audit | Zero known package vulnerabilities at that snapshot |
| Remote CI, staging/recovery, real gateway, physical hardware | Not executed |

Do not sum separate runs into a fictional full-suite result. Test counts can legitimately grow; the objective is correct behavior and passing required suites, not matching an old count. A prior zero-advisory audit is not a current security result.

Tested pins were Node 24.19.0 and pnpm 10.34.0. Inspect `.node-version`, `package.json`, `.npmrc`, lockfile and CI first. Review current supported runtime/security patches using official release information before changing pins; make dependency/runtime updates explicit, reproducible and tested.

Run applicable commands, retaining command, exit status, environment, duration and output:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm check
pnpm build
node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs
node --test server/tests/paymentGateway.test.mjs
pnpm exec playwright install --with-deps chromium
pnpm exec playwright test
pnpm exec playwright test --config playwright.offline.config.mjs
pnpm audit --json
pnpm licenses list --json
node scripts/audit-write-paths.mjs
git diff --check
```

Adapt shell syntax correctly for the host, without changing what is tested. Browser runtime installation may need environment approval. There was no configured lint script; do not claim lint passed unless you actually configure and run an appropriate check.

The Windows failures involve POSIX paths/ownership/permissions and symlink restrictions; the TLS skip lacked OpenSSL. Reproduce them and verify the explanation. Run the full server suite on an available authorized Linux/POSIX environment with OpenSSL. Do not skip these cases, trust forwarded headers, weaken file modes, or catch security failures merely to turn the run green. A local Linux VM/container can be used if available and permitted; installing host virtualization or provisioning a remote runner requires applicable approval. Configured CI is not executed CI.

## 6. Execution discipline

Maintain a current task plan tied to the 82 acceptance units and blocker IDs. After each meaningful unit: implement, add risk-based tests, execute them, inspect the diff and update evidence. Use broader regressions after shared contracts or migrations change. Preserve failed runs and explain fixes. Do not rewrite assertions to normalize broken financial behavior.

Use these statuses consistently: `implemented-and-tested`, `implemented-unverified`, `missing`, `blocked`, and `expressly excluded`. “Blocked” must identify a concrete unavailable dependency. “Expressly excluded” requires a recorded owner decision. Partial implementation or a local mock does not close an external integration criterion.

For every issue, record severity, scope, source paths, reproduction, root cause, implementation, acceptance tests, exact evidence and unresolved dependencies. The AST inventory's 65 candidates are a starting aid, not proof of complete authorization coverage.

Work autonomously within the authorized local scope. Do not repeatedly ask permission for routine reversible edits or tests. Do not create paid resources, publish, contact third parties, send messages or push changes without applicable authorization. Delegate only if the owner or applicable environment instructions authorize it. Keep concise progress updates; do not overwhelm the owner with raw tool output.

Implement in the following dependency order. Independent local work can proceed while an external gate is pending.

## 7. Phase A — inventory, accounting and historical truth

Primary issues: `FIN-001`, `FIN-002`, `ARCH-001`; relevant stages 2–4 and 12.

1. Finish receipt, adjustment, batch and unit-conversion costing. Establish stable identities and base-unit quantities; validate integer bounds and reconcile physical quantities with costing quantities. Preserve the existing FIFO policy unless a change is explicitly justified and approved. Do not confuse physical expiry allocation with accounting cost allocation; document and test their relationship.
2. Implement partial returns/refunds with explicit original sale-line links. Bound cumulative returned quantities and refunded amounts. Restore eligible stock/batches and original cost allocations exactly once. Distinguish sellable returns, damaged/non-restockable returns and money-only corrections. Require owner clarification when a material return policy is undefined.
3. Make cash/card/MoMo, prepaid wallet, loyalty, credit, tax and partial-refund behavior reconcile. Define cumulative rounding/remainder allocation so partial refunds cannot over-refund a discount, tax or original tender. Keep a local reversal, a cash refund and a provider refund as distinct recorded events. Never mark a provider refund successful before verification.
4. Build the missing supplier settlement/payables model with immutable payments/credits linked to purchases. Define opening liabilities, partial settlements, purchase returns and dates from actual supplied records. Do not assume every saved purchase was paid in cash.
5. Define and test each reported figure: gross/net sales, recorded tax, COGS, gross margin, expenses, cash movements, prepaid liability, receivables, repayments and supplier payables. Specify period versus as-of/current balances. Independently reconstruct totals from source events, including cross-period returns and reversals; do not validate a report by calling the same summation function twice.
6. Audit all report/CSV/print/assistant surfaces for consistent definitions and safe arithmetic. Investigate currency identity and minor-unit precision throughout transactions, receipts, retries and historical records. Snapshot currency where required; do not relabel old transactions using a newly selected profile currency. Verify currency rules from authoritative references before migrating data. Never reinterpret ambiguous legacy money without evidence.
7. Extend tax only where requirements and authoritative rules support it. The supported local default remains off. If business requirements need exemptions, multiple/compound taxes, input tax or statutory documents, model those explicitly and test them. For legal rates/rules, use current official jurisdiction sources and obtain necessary business facts. A country selection alone is insufficient.
8. Provide a controlled reconciliation path for unknown legacy costs. Preserve unavailable amounts until evidence is supplied; use auditable corrections with provenance. Do not retroactively treat a present-day cost as an old receipt. Financial readiness includes honest handling of unrecoverable history, not fabricated completeness.
9. Reconcile the available Stage 2 archive selectively. The prior comparison covered 27 relevant files, 15 identical and 12 different. Inspect semantics and tests; never overwrite the new work wholesale. Locate the Stage 3 source if available; otherwise identify the acceptance criteria that can be implemented from specifications and separately record unverifiable branch provenance.

Required tests include concurrent sales/purchases/returns, duplicate intents, partial/refund limits, safe-integer extremes, cross-company records, mixed known/unknown cost, exact restoration, partial tender, wallet/points conservation, tax changes and rounding, posting failure at every meaningful boundary, and full-history reconciliation. Use isolated synthetic ledgers with independently calculated expectations.

## 8. Phase B — complete authorization and audit coverage

Primary issue: `SEC-001`; relevant stages 1–10 and 12.

Inspect every mutation, including helpers, imports, restore/clear, assistant actions, callbacks, sync replay and backend routes. Prioritize remaining catalogue options, batch registration, stock-count preparation/editing, customers, suppliers and store administration, where permission checks may occur before the actual write.

For each operation:

- Capture the intended company/store, revalidate scope and role inside the write transaction, and validate all referenced records belong to that scope.
- Test unlocked/locked, expired/revoked/disabled identity, permitted and denied role, relevant shift state, company switch during an await, duplicate request and direct service invocation.
- Record the actual actor, device/store when applicable, action, immutable target and time. Preserve the supported no-staff offline setup path with explicit provenance; do not invent an authenticated staff identity or accidentally make first-time local retail require a cloud account.
- Keep approval bound to the exact action, amount, scope and submission identity; prevent reuse after cart changes or session changes.
- Ensure exports, reports, backup and sensitive reads cannot expose foreign-company data.

Complete PIN/WebAuthn enrollment, unlock, revocation and recovery tests at supported boundaries. Verify secure-context behavior on real supported devices when available. UI visibility is not authorization. Synthetic browser tests do not prove physical WebAuthn support. Do not call an editable local database a cryptographically tamper-proof audit log.

## 9. Phase C — crash-safe storage, migration and recovery

Primary issues: `DATA-001`, `DATA-002`.

The main database and assistant local store are separate. Current in-process compensation does not survive interruption between databases. Fix restore/clear with a coherent architecture: either safely migrate to one transactional database or implement a durable recovery journal with explicit phases, startup recovery, idempotency and verifiable completion. Just adding another `try/catch` is insufficient.

Cover every persisted table and intentionally retained audit record. Investigate assistant audit exclusion/clearing and define retention consistent with the audit requirements. Reject duplicate identities, foreign ownership, orphan relationships, malformed money/quantities/timestamps, invalid enum states, broken cost/tax links, unsupported future schemas and oversized inputs. Bound parsing and archive/decryption resources. Restore must not silently re-enable sync or another company's access.

Extend real IndexedDB migration fixtures from schemas 1–25 to include the current schema 26 before introducing later versions. Preserve the tested historical snapshots; version any new migration. Populate realistic linked sales, lines, payments, costs, refunds, taxes, customers, wallets, staff, stores and pending outbox records, not only metadata and a product. Add large datasets, quota pressure, transaction failures, reload/process interruption and cross-company tests.

Test encrypted backup corruption/wrong passphrase, interrupted export/restore, recovery after each journal phase, and repeat execution after a crash. Keep pre-upgrade backups and document how to recover writes made after a backup. Never downgrade an upgraded database in place or erase recent transactions to claim rollback success.

## 10. Phase D — remaining assistant and intelligence behavior

Primary issues: `AST-001`, `INT-001`.

Preserve the working quotation handoff and atomic conversion. Complete remaining record-grounded multi-turn tasks with explicit context expiry, company binding, stale-record handling, confirmation and permission checks. Keep suggestions distinct from saved financial actions. Test retries, ambiguous names, malformed input, company switching and hostile text embedded in records.

Build receivable ageing from explicit debt dates, agreed terms and repayment allocations. Historical transactions without due dates must display unknown ageing, not invented overdue status. Do not confuse current outstanding balance with period-specific ageing.

Complete demand/reorder features from observed SKU unit history, returns, stockouts and valid assumptions. Label estimates and limitations. Do not invent confidence intervals or lead times. If an essential supplier lead time is unknown, request/configure it or show that a recommendation is unavailable.

Implement persisted automation only as explicit owner opt-in, with a bounded action allowlist, preview/approval where required, actor audit, company/store binding, deduplication, cancellation and pause controls. Handle offline/missed schedules predictably. Notification permission is not approval to mutate money or stock. Do not send real customer messages or activate external delivery without explicit authorization.

## 11. Phase E — authenticated cloud and authoritative stores

Primary issues: `CLOUD-001`, `STORE-001`, `ENV-003`.

Complete local protocol/service work while external deployment is pending. Keep unavailable capabilities fail-closed.

Cloud requirements:

- Durable organization/member/device identity, session issuance/expiry/revocation, scoped enrollment and recovery, secret rotation and audit.
- Verified direct TLS or a separately designed and tested trusted-proxy model. Current protected routes require direct TLS; do not silently replace this with trust in client-supplied forwarding headers.
- Persistent storage with tested ownership, permissions, atomic writes, corruption detection, concurrency, restart behavior and backup/recovery.
- Authenticated opt-in financial event replication, durable outbox, immutable operation identities, acknowledgements, replay ordering, schema validation, deduplication and conflict handling. A queued request or uploaded ciphertext is not proof that business records were applied remotely.
- Treat every received event as untrusted. Validate actor, tenant, device, source record, amount and state before applying. A valid signature alone does not authorize an invalid business transaction.

Store requirements:

- Real per-store stock balances and cost attribution, with explicit store identity on affected transactions.
- Audited transfer lifecycle with conserved quantities/costs, in-transit state where applicable, receipt confirmation and exact cancellation/return rules.
- Scoped attendants, enrollment/revocation, shifts and owner consolidation without double counting.
- Explicit strategy for disconnected stock ownership/allocations. Do not claim global oversell prevention while independent offline devices can spend the same unrestricted balance. Present material allocation or availability policy choices for owner decision; preserve authorized local retail.

Never treat stock observations as balances, transfer requests as executed transfers, or local activity summaries as consolidated authoritative accounts. Test duplicate/delayed/out-of-order/cross-company events, conflicting edits, replay after restore, revoked offline devices, interrupted writes, concurrent stores and reconciliation after reconnecting.

## 12. Phase F — payments and public commerce

Primary issues: `PAY-001`, `COM-001`; stage 10 remains gated by accounting, security, cloud and inventory correctness.

First complete provider-neutral interfaces and local contract tests. Keep mock records visibly simulated and isolated from real collections, receipts, settlements and business reports. The current mock is ephemeral; it does not establish durable payment processing or signed-webhook verification.

Prepare configurable provider adapters without selecting or enabling a gateway on the owner's behalf. When a provider is approved and sandbox credentials are securely available, implement against its current official documentation and execute real sandbox cases. Required cases include success, decline, cancellation, timeout with unknown outcome, delayed success, duplicated and out-of-order webhooks, invalid signatures, wrong merchant/currency/amount, replay, expired events, partial/full refunds, over-refund rejection, chargeback and settlement mismatch. Use stable idempotency keys and explicit state transitions. Do not mark a timeout failed or paid without evidence.

Do not collect/store raw card details or emulate a provider certification. Use the approved provider's supported hosted/tokenized flow where applicable. Ensure no secret enters browser bundles, reports, logs, patches or artifacts.

Public-commerce work must include owner-authorized product publishing, server-trusted prices/taxes/availability, verified orders, privacy boundaries, abuse protection, authoritative reservations with expiry, and atomic commit/release. Test payment-after-reservation-expiry, inventory conflict after authorization, duplicate fulfillment and crash recovery. Resolve these with explicit compensating states/actions, not invented completed sales.

Connect shipment/delivery status only to authenticated carrier evidence or clearly attributed manual actions allowed by the agreed workflow. A local “prepared” or “ready” order is not shipped, delivered or paid. Real carrier accounts and actions need separate authorization where required.

## 13. Phase G — production QA, staging and operations

Primary issues: `ENV-001`, `HW-001`, `OPS-001`, `PERF-001`, `RUNTIME-001`; remaining stage-12 criteria.

Run all suites on the final source with the locked toolchain. Exercise real IndexedDB and the built PWA, not only development mode or mocked storage. Cover supported browsers, mobile layouts, accessibility, keyboard/screen-reader flows, receipts, printing, camera/scanners, WebAuthn, offline reload and service-worker updates. Document actual hardware/browser versions and limitations.

Measure representative low-end device startup, bundle size, memory, large-ledger operations and offline responsiveness. Establish justified budgets and report measurements. Do not hide the existing large-chunk warning by merely increasing its threshold. Separate loading where useful without breaking offline availability.

Update dependency/runtime audit and the dependency/license inventory. Review actual distributed notices, including the patched `wouter` dependency and relevant MPL/attribution obligations. Retain notices and identify unresolved licensing decisions; a metadata list is not legal certification. Perform targeted security review and authorized local adversarial tests; production penetration testing is not authorized by this prompt.

The existing staging proposal is a private single-instance Ubuntu 24.04 LTS VM, approximately 2 vCPU/4 GB RAM/30 GB persistent POSIX storage, direct TLS, synthetic data, restricted tester access and live features disabled. These resources are estimates, not guaranteed capacity. Review the proposal against the final architecture and current support information. Do not provision it yet.

Before external deployment, obtain approval for the hosting account/environment, region, cost limit, hostname/TLS setup, permitted access, operator and recovery storage. Stage and production approvals are separate. Supply a concrete manifest/runbook and tested artifact so the owner can review exactly what would run. Never treat a configured provider or approved staging host as authorization to charge customers or deploy production.

After staging approval, verify deployment, health, TLS, access boundaries, persistent storage, backup/restore, interruption/restart, rollback and service-worker/client compatibility. Measure recovery time and potential data loss; do not invent RTO/RPO claims. Configure and test meaningful monitoring/alerts for service health, disk space, certificate expiry, authentication anomalies, failed events, corrupted journals, backup failures and stalled reconciliation, without logging secrets or unnecessary customer data.

## 14. Issue closure and acceptance

Use the current register as the checklist. Explicitly disposition every issue:

| Issue IDs | Required closure evidence |
|---|---|
| `ENV-001`, `ENV-002`, `ENV-003` | Reproducible install/types/build/client/server/browser checks; preserve resolved portability; actual POSIX/TLS results |
| `FIN-001`, `FIN-002` | Full supported stock/cost/refund/tax/receivable/payable reconciliation and failure tests |
| `SEC-001` | Complete mutation/read authority review with positive/negative role, race, scope and actor tests |
| `DATA-001`, `DATA-002` | Historical migration/restore matrix and actual durable cross-database interruption recovery |
| `CLOUD-001`, `STORE-001` | Authenticated durable replay, conflicts, scoped store operations and independent consolidation evidence |
| `PAY-001`, `COM-001` | Approved provider sandbox evidence plus trusted order/reservation/fulfillment integration; mocks alone do not close these |
| `AST-001`, `INT-001` | Remaining assistant, debt ageing, demand and explicitly approved persisted automation tests |
| `HW-001`, `OPS-001` | Actual hardware acceptance and approved staging/recovery/monitoring evidence |
| `ARCH-001` | Selective historical-source reconciliation or explicit account of unavailable provenance and resulting verification |
| `PERF-001`, `RUNTIME-001` | Measured performance, supported runtime/security review and distribution notice review |

Add issues discovered during development. Resolve root causes; do not simply rename blockers, remove tests or lower severity. If the owner explicitly reduces release scope, record the approval, excluded features and enforced gates. Describe any readiness claim as applying to that approved scope; do not call an incomplete twelve-stage product complete.

## 15. Final deliverables and definition of done

Deliver one consolidated result with:

1. Patched repository and reviewable local commit series, preserving unrelated changes.
2. Exact source commit and a verified source/build/evidence archive with SHA-256 checksums. Exclude secrets, private backups, real customer data, dependency folders and unnecessary caches.
3. Updated 82-unit traceability and prioritized issue register, including new findings and exact evidence for every closure.
4. Full logs for successful, failed, retried and skipped commands, with environment details. Include relevant browser traces/screenshots and reproducible synthetic fixtures.
5. New migration/backup formats and tested restore/rollback instructions.
6. Security review, independent financial reconciliation report, dependency/runtime audit and distribution inventory/notices.
7. User/operator guidance, supported-platform matrix, deployment manifest, monitoring and recovery runbooks.
8. Explicit release decision: **GO only for a fully evidenced approved scope; otherwise NO-GO / INCOMPLETE**, with the precise remaining work, unavailable inputs and next executable checks.

Production-ready means all required product behavior is implemented, all in-scope P0/P1 issues are resolved, money/stock/tenant invariants are demonstrated, the final artifact passes the complete applicable tests, recovery and operational controls are verified, and required external/hardware checks have real evidence. It does not mean a successful build, a large test count, configured CI, a mock gateway or an optimistic report.

At any owner request to stop, pause or hand over, promptly stop new implementation, preserve changes and document the exact state. Otherwise continue authorized feasible work through the dependent acceptance units. Do not stop after one convenient fix or keep asking whether to continue.

## 16. Start now

Verify the repository/archive identity and current working tree, read the handover and acceptance registers, reproduce the applicable baseline, and make a dependency-ordered plan linked to issue IDs. Identify unavailable environments/accounts without treating them as permission to provision anything. Then begin the remaining local finance and authorization/recovery work while preserving the completed cost/tax/quotation/offline behavior. Keep the product NO-GO until the evidence supports a different decision.


## Latest continuation note — FIN002_PREPAID_LIABILITY (2026-10-12)
Continue only from the newest FIN002_PREPAID_LIABILITY continuation source ZIP, not the previous FIN002_CURRENCY archive. See docs/release/FIN002_PREPAID_LIABILITY_CONTINUATION_2026-10-12.md and QA logs. FIN-002 is still missing as a broad gate, and release remains NO-GO.
