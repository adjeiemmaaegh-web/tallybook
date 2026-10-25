# Stages 2–12 continuation plan — 2026-10-23

## Direction and release boundary

Continue source implementation through the approved Stages 2–12 scopes in the project’s `NEXT_AGENT_MASTER_PROMPT.md` and `docs/release/traceability.json`. Defer Windows, macOS, Android, iOS, and browser-specific acceptance until the end of the 12-stage program. Those checks remain outstanding verification; they are not reasons to stop independent local engineering work. Do not describe device/browser checks as passed.

Keep the release decision **NO-GO / INCOMPLETE** until the required acceptance evidence exists. This instruction authorizes local source changes and automated tests; it does not authorize production deployment, provider selection, live payment/refund actions, customer communications, cloud provisioning, or other external actions. Keep provider-, jurisdiction-, historical-data-, and platform-dependent requirements explicitly open where their inputs are unavailable.

## Traceability snapshot

The current 82-unit register has these statuses at the start of this continuation checkpoint:

| Stage | Current traceability status counts |
|---|---|
| 1 | 6 implemented-unverified |
| 2 | 7 implemented-unverified |
| 3 | 6 implemented-unverified; 1 missing |
| 4 | 7 implemented-unverified |
| 5 | 1 implemented-and-tested; 3 implemented-unverified; 1 missing |
| 6 | 6 implemented-unverified |
| 7 | 6 implemented-unverified |
| 8 | 5 implemented-unverified; 4 missing |
| 9 | 6 implemented-unverified; 5 missing |
| 10 | 2 implemented-unverified; 3 missing; 2 blocked |
| 11 | 2 implemented-unverified; 3 missing |
| 12 | 4 implemented-unverified; 1 missing; 1 blocked |

The counts are a point-in-time view of the traceability register, not a release-readiness claim. In particular, `S3-06`, `S5-02`, `S8-04`, `S8-06`, `S8-07`, `S8-09`, `S9-06`–`S9-10`, `S10-01`–`S10-05`, `S11-02`, `S11-04`, `S11-05`, `S12-02`, and `S12-06` remain missing or blocked as currently recorded.

## Execution order

Follow the dependency order in the master prompt, keeping local work independent of external gates where safe:

1. **Phase A — inventory, accounting, historical truth (FIN-001, FIN-002, ARCH-001; Stages 2–4 and 12).** Finish purchase/batch/adjustment and base-unit costing; test partial return/refund conservation without enabling unsupported refund policy; reconcile COGS, stock, reversals, receivables, supplier liabilities and currencies from independent source events; keep unknown historical cost unknown; extend tax only from approved jurisdiction facts.
2. **Phase B — authorization and audit (SEC-001; Stages 1–10 and 12).** Manually review every static write candidate and the non-write/read surfaces. Verify direct service calls, roles, actor attribution, shift/session state, company/store scope, switch races, idempotency and foreign-record denial.
3. **Phase C — crash-safe migration/recovery (DATA-001, DATA-002).** Extend real IndexedDB migration fixtures and validate the durable cross-database restore/clear journal through injected failure and restart scenarios.
4. **Phase D — assistant and intelligence (AST-001, INT-001; Stages 5, 11 and 12).** Finish ambiguous-context handling, source-grounded ageing/demand, and explicitly opt-in automation only where all action and notification boundaries are approved.
5. **Phase E — cloud/store protocols (CLOUD-001, STORE-001, ENV-003; Stages 8–9).** Continue local protocol and deterministic tests. Keep authentication, persistence, replay, revocation, multi-store balances and transfer semantics fail-closed; do not imply durable remote replication or global offline oversell prevention.
6. **Phase F — payments/public commerce (PAY-001, COM-001; Stage 10).** Only provider-neutral contracts and isolated simulation can proceed without provider approval/credentials. No live provider, checkout, refund, fulfillment or carrier actions.
7. **Phase G — final QA/operations (ENV-001, HW-001, OPS-001, PERF-001, RUNTIME-001; Stage 12).** At the end, run the final locked-toolchain suites, cross-platform browser/device checks, real-browser IndexedDB/PWA/offline and accessibility/printing/scanning/WebAuthn checks where supported, measured performance, licensing/runtime review, and recovery runbook. Then make an evidence-based GO/NO-GO decision.

## Increment 9 checkpoint

The first continuation slice is recorded in `STAGE2_STAGE3_INCREMENT9_PROGRESS.md` and `STAGE2_STAGE3_INCREMENT9_LEDGER.json`. It advances Stage 2 batch receipt provenance and Stage 3 currency-safe current-stock valuation, and fixes one company-switch race in backup export metadata. It does not close any broad P0 finance, security, restore, device, or release blocker. The complete 70-candidate mutation inventory is available in `docs/release/write-entrypoints.json`; manual authority review remains in progress.

The next source work remains Phase A: partial return/refund limits and reconciliation, adjustment/unit-conversion cost evidence, and full-history independent costing/payables. Then continue Phase B and Phase C rather than treating platform acceptance as a prerequisite to source changes.


## Increment 10 checkpoint — Stage 11 company isolation
Owner direction remains to continue source work through Stages 2–12 while deferring platform/browser acceptance until the end. Increment 10 adds selected company-switch guards in customer/assistant, supplier-payable, inventory, store, and Mobile Money provider services, plus inventory UI state fencing and focused Dexie race tests. Full suite **806/806**, semantic TypeScript check, production build, and 13/13 native schema/policy tests pass. Stage 1 gate runner: 9 PASS, 0 FAIL, 0 BLOCKED executable gates; `stageAccepted=false` because Windows recovery evidence remains outstanding. Stage 11 isolation remediation is partial: expenses, purchases, reports, staff, backup/integrity, Company settings and other UI/result paths remain open; multi-tab/recovery/browser tests remain open. Do not close SEC-001/SEC-004/DATA-001/DATA-002/DATA-011/DATA-012. See `STAGE11_COMPANY_ISOLATION_INCREMENT10_PROGRESS.md`, `STAGE11_COMPANY_ISOLATION_INCREMENT10_LEDGER.json`, `STAGE11_COMPANY_ISOLATION_INCREMENT10_TEST_LOG.txt`, and `docs/release/STAGE11_COMPANY_ISOLATION_INCREMENT10.md`. No external action or release GO is claimed.


### Increment 10 late follow-up — stale Company-settings write
A targeted Stage 11 audit finding was addressed: the Business Setup form captures the company id that populated it, and profile-save service/context APIs require that expected identity; TaxSettings passes its profile id. Dexie tests reject a stale form and roll back when the active company changes during the profile update. The exact two-file focused set passes **22/22**; the full suite now passes **808/808 across 99 files**, and TypeScript/build pass. Stage 1 gate runner remains 9 PASS/0 FAIL/0 BLOCKED with `stageAccepted=false` pending Windows browser-recovery evidence. A page-level UI timing regression and wider Company/settings, expense, purchase, report, staff, backup/integrity and assistant/customer audits are still required. No blocker closes.
