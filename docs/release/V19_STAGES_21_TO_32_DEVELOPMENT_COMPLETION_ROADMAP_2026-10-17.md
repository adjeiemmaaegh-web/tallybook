# Tallybook V19 — Development Completion Roadmap (Stages 21–32)

**Created:** 17 October 2026  
**Project:** Alchemy → Tallybook V19  
**Authoritative starting source:** branch v19/run20-operations-release-development-20261017, commit dc771043f47c9ef60fa53cc3143835beff9ba38b.  
**Classification:** NEW DEVELOPMENT PLAN, NOT IMPLEMENTATION OR EVIDENCE OF ACCEPTANCE.  
**Current status:** Development incomplete; owner testing NOT authorized as a development exit shortcut; commercial release NO-GO.

## 1. Why another roadmap is necessary

Runs 1–20 produced planned source increments, but several intended V19 capabilities are not operational end-to-end. The current code explicitly disables authoritative store-stock execution, live store transfers, public storefront acceptance, online reservations/fulfillment, financial cloud sync, real payment providers and certain assistant review actions. Some code was added without semantic TypeScript compilation or an end-to-end application build. A GitHub release-validation attempt failed before visible test steps (run 39000398606). Historical acceptance evidence comprises 82 units and a 47-issue status register; these are NOT automatically closed by the 20-run source roadmap.

This second roadmap is a **completion programme**, not a repeat of earlier feature scaffolding. Every stage must repair, integrate and prove its functionality internally. The owner will run real Windows/Android/shop-floor UAT **only after** the whole developer programme reaches the handoff gate.

## 2. Non-negotiable product requirements

- Preserve Tallybook as flexible, offline-first **multi-business** business-management software, not a single shop's fixed rules.
- Independently configurable per-company returns/refunds, including companies forbidding refunds entirely; require historical sale policy snapshots, authorization and correct financial reversals.
- Single-business, multi-store and authorized staff workflows must remain isolated by company/store/role; no guessed historical store attribution or financial merges.
- Recorded financial source data, inventory stock changes and customer/supplier liability must reconcile. No simulated or pending provider payment may create a real receipt, credit settlement or deduction.
- Low-spec Windows 11 computers without dedicated GPUs remain a first-class environment. Normal business users should not need Node, pnpm, a terminal or model downloads.
- Mobile/Android workflows must not risk losing offline data. Any sync is opt-in and must preserve per-device local operation and an owner-controlled conflict procedure.
- Preserve all source/record provenance; avoid destructive rewriting of historical data, partial backups, fabricated records, automatic refunds or autonomous financial writes.
- End-to-end capabilities must be **developed before they are declared ready**. Do not turn false feature flags on just to make a demo work.
- All automated developer verification can run during and at the end of development. Owner-operated **physical-device tests are a separate later phase**, not a substitute for developer tests.
- No staging, production deployment, live card/Mobile Money charge, cloud financial transfer, public commerce publication, external secret usage or main-branch merge without separate, explicit owner approval.

## 3. Stage-by-stage developer completion plan

### Stage 21 — Recover build/CI and reconcile the actual engineering baseline

**Work:** Freeze exact source/dependency lockfile; examine every migration through Dexie v33 and every source added in Runs 1–20; resolve wrong imports, incorrect TypeScript declarations, outdated contracts and missing permission/recovery dependencies. Investigate the GitHub Actions run that failed before visible steps. Make pinned Node/pnpm, native suites, semantic client/server types, browser test runner and production bundle reproducible in a clean approved developer environment. Map each of 82 acceptance units and all 47 historical issue IDs to its authoritative definition, severity, source fix and latest real evidence. Preserve the original register and report discrepancies rather than renumbering or marking PASS.

**Stage exit:** Clean reproducible source checkout, build/typecheck and runnable CI with captured logs; audited capability inventory showing implemented-but-disabled versus incomplete/missing; baseline defect register. No unreviewed source-history rewrite.

### Stage 22 — Finish financial integrity and per-company business policy

**Work:** Reconcile signed sale/reversal/partial-return totals, exact original-sale credit allocation, repayments, prepaid wallet, tax snapshots, flexible company refunds/returns (including opt-out), supplier payable settlement and purchase/FIFO/COGS inventory recognition. Repair unsafe write transactions, validation overflows, wrong currency, same-key retries, orphan credits, simultaneous events and legacy historical policy/currency gaps. Finish necessary user/admin screens and audit entries. Maintain separate accounting for deposits, invoices, cash received, liabilities, refunds and costs.

**Stage exit:** Every in-scope financial entrypoint writes the expected ledger records exactly once or aborts atomically; matched balances/cost conservation over synthetic fixture histories; scenario tests for multi-company policy differences, duplicate/replay, partial refund, missing originals, history and wrong roles. FIN-002 and related issues get evidence, never merely a source status.

### Stage 23 — Complete authoritative inventory, purchasing and multi-store operations

**Work:** Finish store-scoped stock authority, real transfers (request, dispatch, receive, correction, cancellation), staff location assignment, in-transit reconciliation, purchase allocations, cycle counts, inventory adjustment, weighted/FIFO historic cost as configured, negative-stock prevention and reservation competition. Confirm no branch permits inventory mutation around the central lock/role/shift checks. Connect stock, sales, supplier and management reports without double counting; preserve old unassigned store data as unattributed rather than guessing.

**Stage exit:** Working multi-store business flows and user controls under company/staff permissions, no silent stock duplication; exact before/after stock conservation and transfer negative-path suite; currently false authoritativeStoreStock/executeStoreTransfer capabilities become eligible for approved internal acceptance only after their complete end-to-end implementation.

### Stage 24 — Complete offline persistence, migration, encrypted backup and crash recovery

**Work:** Verify/repair all v1–v33+ migration steps, legacy imports, backup schema registry and portable restoration of every authoritative record type. Make encryption/passphrase behavior, download proof, restoration preflight, metadata snapshots, app version isolation, multi-tab write lock, restore journal, power interruption semantics and quota/low-memory handling consistent across all screens and services. Build crash/restart simulations using disposable browser profiles; ensure failure leaves original data intact or recoverable. Keep nonfinancial caches separate from portable ledgers.

**Stage exit:** Deterministic migration, backup/restore and adversarial failure suites, cross-tab/process restart proofs on developer-controlled test browsers, documented rollback path; zero silent partial financial restore or data truncation.

### Stage 25 — Complete identity, owner/staff authorization and trusted tenant boundary

**Work:** Close auth/PIN/WebAuthn role/shift/store controls, owner/supervisor/cashier permissions, company switching and revoke races on every read/write path. Finish approved server-side tenant lookup, authentication/session rotation, durable owner-device membership, request quotas and row-level security for any remote data used by cloud or public commerce. Remove client-supplied tenant authority. Verify audit provenance and anti-replay/CSRF/injection protections. Keep local POS usable when remote auth is unavailable according to an explicit offline trust policy.

**Stage exit:** Negative company, device, store, session and role tests for all finance and network paths; independently reproducible server-side tenant/RLS fixtures; no relying solely on UI-hidden controls for authorization.

### Stage 26 — Complete secure offline-first cross-device synchronization

**Work:** Finish opt-in device enrollment, trusted signed/encrypted message contract, local durable outbox/inbox, idempotent receipt, retry/backoff, lock/restore barriers, ordering and conflict-resolution UI. Prevent automatic cash/stock merge from untrusted remote records. Complete server relay tenancy enforcement, offline reconnection, backup/sync conflict handling and owner device revocation. Provide a fully local test relay/reference server and fixtures; any external service hookup requires owner-approved secure staging access.

**Stage exit:** Two-or-more isolated device simulations with loss, duplicate, reorder, timeout, stale tenancy, revocation, encryption and recovery; all accepted financial merges explicitly reconciled; cloud-finance and multi-device flags are not enabled for real operations before independent authorization.

### Stage 27 — Complete public commerce, reservation and fulfillment workflows

**Work:** Turn the Run 16 local draft/preview into a complete separately isolated customer ordering flow: published tenant/catalogue, safe customer identity/contact/consent handling, server-originated quotes, price/tax snapshots, stock reservation expiry, conflicts, exact POS linking, cancelled/returned orders, pickup, delivery, human staff audit, customer notifications as independently approved, privacy/retention, rate limiting and abuse protection. Respect each company's independent returns policy. Local merchants must retain operation without public internet access; do not place public endpoints on the internet during development without approval.

**Stage exit:** Full end-to-end local reference-server/customer-browser/merchant-POS simulations including reservation races, double checkout, partial return and wrong-tenant denial; no fake cash settlement, and no public online checkout marketed as active before approved hosting.

### Stage 28 — Complete payment-provider integration and settlement logic

**Work:** Evolve Run 15 from mock-only events into a production-designed provider abstraction with one explicitly selected and approved Ghana-relevant sandbox implementation (Mobile Money and/or card, according to provider contract). Include backend-only secrets, verified signed callbacks, delivery acknowledgements, query/reconciliation, pending/unknown terminal states, strict idempotency, bank/provider settlement references, partial refunds, disputes and rollback/retry protection. Join legitimate settlements to exact customer orders and sale/credit records once, under the business's policy, without allowing a mock result to create actual cash.

**Stage exit:** Complete provider contract and automated signed sandbox/fixture integration against a specified provider, plus duplicate/missing/webhook timeout/chargeback negative cases and financial conservation. **Owner dependency:** the external provider must be selected and any real sandbox credentials/network use expressly authorized. Without that, adapter and mocks can be finished, but real-provider connectivity must remain BLOCKED—not falsely described as complete. No live funds movement.

### Stage 29 — Finish permissioned assistant, analytics and management intelligence

**Work:** Complete truthful, source-grounded queries, safe analyst summaries, source links, per-company reports, stock/purchase/credit/store dashboards, risk/exception queues, owner approval/review notes, offline CPU-friendly optional inference and no network data leakage. Correct historical data gaps and multi-company restrictions. Review actions that could write business records must remain independently authorized and fully tested; assistant recommendations must not turn into automatic ledger entries. Ensure readable exports with CSV injection and privacy safeguards.

**Stage exit:** Real local datasets and synthetic corner cases prove report conservation, stable evidence links, exact user permission and safe incomplete-source disclosures; no invented profit, demand forecast, theft verdict or settlement.

### Stage 30 — Product packaging, workflow completion and platform readiness

**Work:** Polish all remaining end-to-end UX: first-run setup, owner access, staff onboarding, sale/receipt/return, stock workflows, alerts, reports, backup, network settings and documentation. Make install/update/recovery simple for Windows 11 nondeveloper customers; finish browser/Android installable PWA and offline route precache. Implement scanner keyboard-wedge processing, explicit nonfinancial print diagnostics and supported receipt-printer layout/print paths as source. Optimize RAM, CPU, startup, background work, accessibility, touch and error/recovery messages for low-cost machines.

**Stage exit:** Reproducible installable offline artifacts and developer-controlled browser/virtual peripheral tests with no Node/pnpm required for normal users; clear supported OS/browser/peripheral list. Real scanner/printer/Android/UAT checks remain for the owner after all development.

### Stage 31 — Security, privacy, reliability and operational hardening closure

**Work:** Finish threat-driven security reviews, source dependency audits, strict CSP after validating needed application origins, safe PWA update behavior, credential/backup privacy, incident redaction, logging limits, rate limiting, protected feature flags, safe migration/rollback and portable data recovery. Define executable source-ready production/staging configuration, observability, backup retention and operational response without making any deployment. Review company/legal/privacy requirements relevant to the permitted modules; license obligations and external services must be explicit.

**Stage exit:** Internally complete critical security test matrix, no unaddressed high-severity launch security findings, documented secrets/environment profiles, fail-closed public/provider/sync switches and tested developer-owned rollback simulation. Independent field/security/legal signoff remains a release gate where required.

### Stage 32 — Final developer integration, regression correction and handoff package

**Work:** On one final exact Git source commit, run ALL pinned native tests, semantic TypeScript, client/browser IndexedDB integration, real clean builds, offline PWA install/restart, migrations, concurrent-tab and crash-recovery simulations, finance/property invariants, role/tenant/RLS negative cases, provider sandbox if approved, public customer-to-merchant integration, local multi-device relay tests and low-resource performance checks. Fix all failures and rerun the entire suite on the changed SHA; do not stop at the first failing build. Independently reconcile every item in the historical 82 acceptance units and 47-issue snapshot with evidence, fixing remaining developer-owned functional blockers. Produce one downloadable normal-user package, source/archive hashes, full QA logs, supported/blocked feature inventory and manual real-device test instructions.

**Stage exit and owner-testing handoff:** Only declare **DEVELOPMENT COMPLETE / READY FOR OWNER UAT** when the intended V19 feature set is genuinely implemented and internally verified; no critical financial/security/data-loss or launch-scope blocker is unresolved; no compiled/imported/runtime defect is known; all mandatory automated suites are passing on the final SHA (or a clearly documented external-only dependency awaits separately granted authorization); and the exact deliverable artifacts and blocker disposition have been reviewed. A feature requiring ungranted provider/cloud approvals remains BLOCKED and means the **full online V19 scope is not yet finished**; it cannot be relabelled done by excluding it silently. This stage does not claim owner physical validation, staging GO or commercial release.

## 4. Required stage-delivery format

One complete stage per consolidated engineering increment. **No Stage 21.1/21.2 micro-releases, no incomplete stage passed off as finished.** Each increment must include:

1. A new reviewable Git branch or exact commit based on the latest stage, source diff, dependency/migration notes and reproducible artifact hashes.
2. Full intended feature integration and relevant UI/service/store/backend contracts—not just stubs or toggles.
3. Updated threat/data-loss/permission and business-finance boundary checks with regression fixtures.
4. Developer automation (native/TypeScript/client/browser/build) executed when a runner is accessible, with actual logs; unavailable checks remain BLOCKED, not PASSED.
5. The 82-unit/47-issue source trace updated only with honest evidence and exact SHA.
6. A single stage handover with achieved criteria, missing external dependencies, risks, next stage and no unauthorized external activation.

## 5. Dependency and authority rules

**Critical sequence:** Stage 21 baseline → Stage 22 financial truth → Stage 23 store inventory → Stage 24 recovery → Stage 25 trusted authorization → Stage 26 sync → Stage 27 public commerce → Stage 28 payments → Stage 29 insights → Stage 30 distribution → Stage 31 hardening → Stage 32 full engineering proof. Cross-stage fixes are allowed, but a new stage may not conceal an unfinished dependency.

**Developer tests vs owner's tests:** Developers run automated source tests, simulated hardware/network, browser integration and regression correction throughout these stages. The owner does **not** run real Windows/Android, business equipment or merchant shop-floor acceptance until **after Stage 32 passes**. Owner UAT remains a **separate later phase**, not Stage 21–32 work.

**External approvals required before relevant connections:** selected MoMo/card provider and approved sandbox account; remote tenant backend/host and explicit private staging approval; privacy/retention and legally required financial/provider terms. In the absence of these approvals, local reference implementations may be authored and tested offline; claims of actual provider or public/cloud activation remain prohibited.

**No premature GO:** The existing Run 20 external-action denial and NO-GO release policy stay in place. Source quality gates do not authorize production, live payments, public commerce hosting, cloud synchronization, staging or merging to main. The final operational release decision follows actual owner UAT and separately approved launch procedures.

## 6. What is allowed to be called complete?

- **Stage developed:** Code delivered, integration covered, stage-specific internal checks executed and tracked.
- **Development programme complete:** All Stages 21–32 meet their stated internal exit conditions, with every promised feature implemented and no critical developer-owned gap deferred to owner testing.
- **Ready for owner UAT:** Exact-source user-installable package and evidenced internal QA, plus truthful external-approval dependencies. The owner can now perform physical device/merchant tests.
- **Commercially released:** Owner UAT and independent security/finance/legal/operational signoffs succeed; the owner separately authorizes each external action. This is NOT a Stage 32 automatic outcome.

**Current decision at plan creation: DEVELOPMENT INCOMPLETE / OWNER TESTING ON HOLD / COMMERCIAL RELEASE NO-GO.**
