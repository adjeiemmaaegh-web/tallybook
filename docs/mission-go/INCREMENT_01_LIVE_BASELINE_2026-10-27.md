# MISSION GO — Increment 01 / live reconciliation baseline

**Recorded:** 2026-10-27. **Release decision:** NO-GO. **This is a baseline inventory, not a claim of engineering acceptance.**

## Exact refs inspected

- Development branch HEAD before this documentation commit: `8deb5120c6d45c885f474fc5c22a64e049dbc564`. Tree: `b97b2773429719833dd2f24d289a02ea946c64ef`.
- `main` HEAD at inspection: `ba3481eb7742b065670dbe5b5ffcb93a62ee0edb`.
- GitHub compare: development is 5 commits ahead and 9 commits behind `main`; histories diverged.
- Earlier checkpoint `b882f35` is 88 commits behind inspected development HEAD.
- The newest V48 work includes main-only source and test changes; do not cherry-pick blindly or assume it has reached development.
- This file intentionally does not change app writers, migrations, auth, live Supabase, or `main`.

## Registers loaded from the exact development ref

- Release blockers: 47. Historical recorded states: implemented-unverified: 35; implemented-and-tested: 3; missing: 6; blocked: 3.
- Acceptance units: 82. Historical recorded states: implemented-unverified: 60; missing: 18; implemented-and-tested: 1; blocked: 3.
- Central workspace blockers: 14. Historical recorded states: missing: 9; unverified: 2; implemented-unverified: 3.
- Source resolution register: 57 lines, includes manual three-way resolutions; requires test-backed current review.
- Source candidate matrix from Oct-24 must be treated as historical candidate/equivalent/integrated analysis, not proof of production integration.

## Hard release gates still requiring proof

1. Record and reconcile all main-only cloud auth / account / Run3 runner changes with current development app paths and Dexie lineage.
2. Reproducible full checkout and pinned Node/pnpm frozen install; run bounded Vitest shards, TypeScript, build, browser, migration and native QA with exits logged.
3. Atomic sales, costs, customer credit, prepaid, supplier payables, refunds and cash conserved under replay, rollback and migrations; all companies control refund permissions.
4. Service-level company, staff and store auth must fail closed after async boundaries; no remote identity permits unauthorized local staff operations.
5. Supabase RLS and real-account tests require a dedicated disposable environment and explicit approval; no production finance writes.
6. Real device, offline PWA, backup/restore, multi-tab/restart and support readiness before release.

## Requirement-by-requirement working inventory

**Current status is intentionally `UNVERIFIED` for each row until a current commit, executed assertion and reproducible output are attached. Historical statuses are preserved separately.**

| Family | ID | Short description | Historical status | Current HEAD evidence |
|---|---|---|---|---|
| RELEASE | `ENV-001` | Frozen dependencies and full toolchain | implemented-unverified | UNVERIFIED |
| RELEASE | `ENV-002` | Nonportable Node QA compiler paths | implemented-and-tested | UNVERIFIED |
| RELEASE | `ENV-003` | Server filesystem adapters rely on POSIX security | implemented-and-tested | UNVERIFIED |
| RELEASE | `FIN-001` | Persisted inventory history and atomic cost allocations | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-002` | Financial reconciliation and tax policy | missing | UNVERIFIED |
| RELEASE | `SEC-001` | Complete authorization and actor coverage | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-001` | Historical migration and restore matrix | implemented-unverified | UNVERIFIED |
| RELEASE | `CLOUD-001` | Authenticated financial replication and durable identity | missing | UNVERIFIED |
| RELEASE | `STORE-001` | Authoritative store stock, transfers and attendants | missing | UNVERIFIED |
| RELEASE | `PAY-001` | Payment provider and sandbox credentials | blocked | UNVERIFIED |
| RELEASE | `COM-001` | Public storefront, reservations and delivery | missing | UNVERIFIED |
| RELEASE | `AST-001` | Quotation handoff and complete assistant workflows | implemented-unverified | UNVERIFIED |
| RELEASE | `INT-001` | Live intelligence and permissioned automation | missing | UNVERIFIED |
| RELEASE | `HW-001` | Physical devices and supported hardware acceptance | blocked | UNVERIFIED |
| RELEASE | `OPS-001` | Staging deployment, recovery, monitoring and release | blocked | UNVERIFIED |
| RELEASE | `ARCH-001` | Historical Stage 2/3 reconciliation | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-002` | Crash atomicity across main and assistant databases | missing | UNVERIFIED |
| RELEASE | `PERF-001` | Device performance and bundle budget | implemented-unverified | UNVERIFIED |
| RELEASE | `RUNTIME-001` | Runtime patch and distribution notices review | implemented-unverified | UNVERIFIED |
| RELEASE | `SEC-002` | Optional server identity snapshot cross-process and file safety | implemented-and-tested | UNVERIFIED |
| RELEASE | `FIN-003` | Customer credit reversal sign, net-balance reporting and full-reversal linkage | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-004` | Explicit supplier payable recognition, manual settlements and currency integrity | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-005` | Partial return allocation groundwork and ambiguous credit-sale reversal prevention | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-006` | New per-sale repayment evidence is service-implemented; legacy allocations and full refund reconciliation remain open | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-007` | Repayment UI with explicit recorded-currency target evidence is source-implemented but unverified in real browser | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-008` | Mixed and unknown currency customer receivables can be silently summed | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-009` | Independent saved customer receivable/reversal/allocation integrity audit | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-003` | Durable cross-IndexedDB backup restore preimage journal | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-004` | Cross-IndexedDB company clear assistant preimage recovery | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-005` | Recovery journal protects against stale and unexpected assistant preimage overwrites | implemented-unverified | UNVERIFIED |
| RELEASE | `SEC-003` | Assistant local conversation and saved-record read isolation | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-006` | Assistant backup history truncated to recent display limit and activity-log prune non-atomic | implemented-unverified | UNVERIFIED |
| RELEASE | `SEC-004` | Stage 9 store and Stage 4 customer benefit writes had time-of-check staff authorization gaps | implemented-unverified | UNVERIFIED |
| RELEASE | `STORE-002` | Local store records lacked an independent read-only integrity audit | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-011` | Saved invoice tax/discount component conservation in partial-return draft | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-012` | Partial FIFO cost restoration conserves original receipt allocations | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-013` | Narrow atomic, staff-confirmed cash-only partial-return posting and reporting | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-014` | Read-only return review and narrow cash refund workflow activation | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-015` | Match prior cash refunds with immutable physical stock and original FIFO evidence before further returns | implemented-unverified | UNVERIFIED |
| RELEASE | `FIN-016` | Audit cash-return physical stock and original FIFO links across backups and company history | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-007` | Portable byte-bound enforcement and semantic postimage validation for durable recovery journals | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-008` | Bound local backup import and encryption/decryption resources | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-009` | Origin-wide Web Locks coordination for destructive two-database work and assistant writers | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-010` | Coordinate selected core retail mutations with origin-wide recovery Web Locks | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-011` | Coordinate additional customer, wallet, store, catalogue, stock-count and supplier mutations with recovery lock | implemented-unverified | UNVERIFIED |
| RELEASE | `DATA-012` | Business, staff and local commerce mutations participate in recovery coordination | implemented-unverified | UNVERIFIED |
| RELEASE | `SEC-006` | Staff authenticator and supervisor approval must reject stale credentials and sessions | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-01` | Atomic checkout and partial payments | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-02` | Barcode and SKU POS | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-03` | Park, resume and recover checkout | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-04` | Receipts and money arithmetic | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-05` | Discount, loyalty and wallet checkout | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S1-06` | Retail offline acceptance | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-01` | Catalogue variants and categories | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-02` | Wholesale units and pricing | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-03` | Services and attachments | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-04` | Secure catalogue CSV | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-05` | Persisted stock counts | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-06` | Batch receiving and expiry allocation | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S2-07` | Historical inventory ledger | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-01` | Financial definitions | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-02` | Periods and trends | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-03` | Collections and receivables | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-04` | Management dashboard | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-05` | Financial export and print | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S3-06` | COGS, gross profit, valuation and payables | missing | UNVERIFIED |
| ACCEPTANCE | `S3-07` | Tax policy and reconciliation | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-01` | Customer profiles and groups | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-02` | Credit policies and due dates | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-03` | Quotation conversion | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-04` | Loyalty lifecycle | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-05` | Prepaid wallet lifecycle | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-06` | Discount authorization | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S4-07` | Customer durability | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S5-01` | Confirmed quotation handoff | implemented-and-tested | UNVERIFIED |
| ACCEPTANCE | `S5-02` | Multi-turn customer tasks | missing | UNVERIFIED |
| ACCEPTANCE | `S5-03` | Language and speech | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S5-04` | Record-grounded finance | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S5-05` | Assistant integration and adversarial QA | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-01` | Local identities and PIN | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-02` | Every write-service permission | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-03` | Shift cash reconciliation | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-04` | Device lock and WebAuthn | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-05` | Actor attribution and audit | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S6-06` | Security recovery | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-01` | Onboarding and navigation | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-02` | Mobile POS and customer display | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-03` | Printing and receipt recovery | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-04` | Local notifications | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-05` | Encrypted backup and restore | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S7-06` | Accessibility, performance and offline | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-01` | Cloud opt-in and durable outbox | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-02` | Organization/member/device identity | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-03` | TLS and request boundaries | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-04` | Durable server storage | missing | UNVERIFIED |
| ACCEPTANCE | `S8-05` | Remote receipts and acknowledgements | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-06` | Business-data replication | missing | UNVERIFIED |
| ACCEPTANCE | `S8-07` | Conflict and power-failure recovery | missing | UNVERIFIED |
| ACCEPTANCE | `S8-08` | Encrypted recovery and keys | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S8-09` | Browser/cloud integration | missing | UNVERIFIED |
| ACCEPTANCE | `S9-01` | Store directory | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S9-02` | Staff store assignments | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S9-03` | Physical count observations | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S9-04` | Transfer requests | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S9-05` | Local store activity | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S9-06` | Authoritative store balances | missing | UNVERIFIED |
| ACCEPTANCE | `S9-07` | Actual stock transfers | missing | UNVERIFIED |
| ACCEPTANCE | `S9-08` | Offline attendant checkout | missing | UNVERIFIED |
| ACCEPTANCE | `S9-09` | Multi-device replay | missing | UNVERIFIED |
| ACCEPTANCE | `S9-10` | Owner consolidation | missing | UNVERIFIED |
| ACCEPTANCE | `S9-11` | Multi-store acceptance | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S10-01` | Authorized public catalogue | missing | UNVERIFIED |
| ACCEPTANCE | `S10-02` | Verified customer orders | missing | UNVERIFIED |
| ACCEPTANCE | `S10-03` | Payment adapter and settlement | blocked | UNVERIFIED |
| ACCEPTANCE | `S10-04` | Stock reservations and fulfillment | missing | UNVERIFIED |
| ACCEPTANCE | `S10-05` | Shipment and delivery tracking | blocked | UNVERIFIED |
| ACCEPTANCE | `S10-06` | Portable commerce backup | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S10-07` | Commerce security and acceptance | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S11-01` | Evidence-based local insights | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S11-02` | SKU demand and reorders | missing | UNVERIFIED |
| ACCEPTANCE | `S11-03` | Live batch expiry | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S11-04` | Receivable ageing | missing | UNVERIFIED |
| ACCEPTANCE | `S11-05` | Persisted permissioned automation | missing | UNVERIFIED |
| ACCEPTANCE | `S12-01` | Reproducible toolchain and CI | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S12-02` | Stock and money reconciliation | missing | UNVERIFIED |
| ACCEPTANCE | `S12-03` | Migration and recovery matrix | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S12-04` | Security and dependencies | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S12-05` | Full production acceptance | implemented-unverified | UNVERIFIED |
| ACCEPTANCE | `S12-06` | Deployment and release artifact | blocked | UNVERIFIED |
| CENTRAL | `CENTRAL-001` | Trusted server-side ingestion endpoint/RPC with auth-user, device, shop, staff, version and payload authorization; no direct browser finance writes | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-002` | Durable full-operation payload and outbox written atomically with each local sale/shift/refund; retry, replay, revocation and status UI | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-003` | Real PostgreSQL test-project migrations, constraints, RLS negative tests and authorization review | unverified | UNVERIFIED |
| CENTRAL | `CENTRAL-004` | Mandatory sale staff/shift/MoMo changes may break older onboarding/UI integration tests; real Dexie and Vitest not run | implemented-unverified | UNVERIFIED |
| CENTRAL | `CENTRAL-005` | No-sale PIN/shift/store/device workflow integrated locally but device ID is a local claim; physical drawer hardware not connected | implemented-unverified | UNVERIFIED |
| CENTRAL | `CENTRAL-006` | Source v29 vs other branch v33 needs an additive migration rebase and three-way merge before any GitHub integration | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-007` | Authoritative shop and device provenance in new sale data; central ingest must never invent or trust client claims | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-008` | Watchdog v1 export per-shop per-day with version/row-count, verified field contract and actual Watchdog importer test | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-009` | Owner cross-shop reports and provider MoMo-statement reconciliation verified against trusted central data | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-010` | Full React/Vitest/typecheck/build/Playwright real-browser multi-tab and recovery tests; pnpm dependency installation unavailable locally | unverified | UNVERIFIED |
| CENTRAL | `CENTRAL-011` | Full refund disbursement and financial ledger reconciliation still incomplete across app | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-012` | New Watchdog daily JSON preview and local integrity review pass native focused tests; full React/Vitest/IndexedDB/actual Watchdog importer test unverified | implemented-unverified | UNVERIFIED |
| CENTRAL | `CENTRAL-013` | Batch 1–5 candidate-only financial/inventory/backup modules cannot replace existing authoritative writers without domain-specific migrations and full integration acceptance | missing | UNVERIFIED |
| CENTRAL | `CENTRAL-014` | Watchdog JSON output is explicitly local-preview; genuine importer-negotiated v1 contract, authoritative register/device provenance, signed central receipts and full multi-store events remain unimplemented | missing | UNVERIFIED |

## Completion contract

- Update this register only with exact source commit, test command, test output, and domain reviewer disposition.
- Do not downgrade Dexie schema or replace authoritative writers with standalone candidate modules.
- Do not merge to `main`, deploy, trigger payment processing, or mutate live Supabase in this increment.
- Increment 01 is **IN PROGRESS** until current-source checkout, reproducible QA and each critical issue disposition exist.
