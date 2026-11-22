# Release gate matrix (2026-11-22)

A gate is **met** only with executed evidence for the exact candidate. Nothing below is met for production. "Automated" = CI/local executed tests; "Field" = real devices/accounts; "Owner" = a decision or approval only the owner can give.

## Task status per stage (from `ROAD_TO_COMPLETE_PROGRESS.json`)

| Stage | Tasks | Verified | Partial | Missing | Owner-blocked |
|---|---|---|---|---|---|
| 21 Integration | 13 | 1 | 10 | 0 | 2 |
| 22 Financial integrity | 10 | 0 | 10 | 0 | 0 |
| 23 Inventory | 9 | 0 | 9 | 0 | 0 |
| 24 Data reliability | 9 | 0 | 6 | 1 | 2 |
| 25 Authentication | 9 | 0 | 6 | 0 | 3 |
| 26 Synchronization | 8 | 0 | 8 | 0 | 0 |
| 27 Public commerce | 8 | 0 | 8 | 0 | 0 |
| 28 Payments | 7 | 0 | 2 | 3 | 2 |
| 29 Clementia | 9 | 0 | 8 | 0 | 1 |
| 30 UX / packaging | 14 | 0 | 9 | 0 | 5 |
| 31 Security | 10 | 0 | 9 | 0 | 1 |
| 32 Final integration | 13 | 0 | 9 | 0 | 4 |

## Gates

| # | Gate | Type | Evidence today | State |
|---|---|---|---|---|
| G1 | Candidate frozen at one exact commit with SHA-256 manifest | Automated | not produced (#112 is moving) | **not met** |
| G2 | Install, typecheck, build, dependency audit clean | Automated | #112 CI: verify, Pinned Node 24 QA, `pnpm audit` clean | met for current head only |
| G3 | Unit/integration suites (client + native) pass | Automated | client 1963+, native `qa/*.test.mjs` 836/836 locally and in CI | met for current head only |
| G4 | Financial conservation (sales, returns, credit, cash, FIFO) | Automated | seeded randomized conservation with independent oracle, mutation-checked; shift cash reconciliation | partly met: wallet, split-tender, loyalty returns and batch/service/VAT lines not covered |
| G5 | Authorization boundaries | Automated | staff permission matrix; RPC catalog audit; shift/payment/Discover role matrices | partly met: not every RPC has a role/tenant matrix; no real Auth |
| G6 | Data safety: backup tamper, restore rollback, encryption, recovery | Automated | #111 (not yet in #112) + backup fuzz | partly met: encryption opt-in, rotation/auto-lock open |
| G7 | Cross-browser engines | Automated | Chrome, Edge, Firefox, WebKit CI green on #112 | met for automated flows only |
| G8 | Secret scan, CodeQL, security tests | Automated | all green on #112 | met for current head only |
| G9 | Replication/offline convergence | Automated + Field | partial foundations only | **not met** |
| G10 | Payments settlement integrity | Automated | provider-independent ledger + service, sandbox only | not met for production: no provider |
| G11 | Accessibility, low-spec performance, onboarding | Automated + Field | partial; no real low-spec device | **not met** |
| G12 | Real-device acceptance (Android/iOS/Windows, printers, scanners, offline) | Field | none performed | **not met** (owner-run) |
| G13 | Real Supabase Auth + two-account field acceptance | Field + Owner | none | **not met** (owner) |
| G14 | Hosted DB: apply migrations 38+ with rollback rehearsal, DR drill | Owner | none; migrations unapplied | **not met** (owner approval) |
| G15 | Monitoring, alerting, incident runbook, support path | Automated + Owner | read-only smoke workflow exists; no alert delivery proven | **not met** |
| G16 | Privacy/legal: retention, consent texts, licences | Owner/Counsel | none approved | **not met** |
| G17 | Independent security review | Owner | none | **not met** |
| G18 | Historical acceptance IDs dispositioned | Automated + review | triage done: 32 have passing referenced tests (review pending), 97 have no linked test, 14 are open blockers (`HISTORICAL_IDS_TRIAGE.md`); 0 accepted | **not met** |
| G19 | Owner UAT and sign-off, GO/NO-GO | Owner | none | **not met** |

**Current verdict: NO-GO for production.** Met gates cover automated software quality on the current head only. Gates G1, G9, G11-G19 (and the open parts of G4-G6, G10) block release. Next developer-owned work: G18 criterion review for the 97 unlinked IDs, G4/G5 remainders, G9, G1 (freeze after owner decides scope).
