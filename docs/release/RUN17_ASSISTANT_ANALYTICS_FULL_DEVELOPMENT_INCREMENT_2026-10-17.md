# Tallybook V19 — Run 17 Assistant and Analytics — Full Source-Development Increment

**Date:** 2026-10-17 (Asia/Dubai)  
**Branch:** `v19/run17-assistant-analytics-development-20261017`  
**Parent Run 16:** `v19/run16-public-commerce-development-20261016` at `eec6b3384f4c7fd659d9e858429757da2a0d3986`.  
**Source HEAD before documentation commit:** `c3cf9ae5690ecac4ce2cff68ee438783c5eaa0b5`.  
**Engineering classification:** **RUN 17 SOURCE-DEVELOPMENT INCREMENT DELIVERED, MANUALLY REVIEWED, UNCOMPILED, UNTESTED AND NOT ACCEPTED.**  
**Release decision:** **NO-GO**. The owner requires work stage by stage and explicitly defers all executable tests until later. This increment did not invoke Node, TypeScript, Vitest, Playwright, CI, migration tests, deployment, cloud inference, real payment, Windows/Android browsers or production operations. No merge into `main` or external services.

## Engineering purpose

Run 17 improves the pre-existing offline assistant and insights without replacing the proven local business-ledger write paths. It adds a genuinely source-linked, read-only company operating review: safe invoice and store observations, reversible-sale / partial-return evidence coverage, stock thresholds, expired customer-order reservations, outstanding dispatched store transfers and human-reviewed return/fulfillment exceptions. The existing reports, financial intelligence, expense, credit, customer refund and company tax engines remain authoritative **for their specific supported claims**. The assistant never invents missing financial or physical evidence.

A prediction, loss/fraud allegation, net profit, statutory financial statement, bank confirmation, supplier payment, external AI completion or automatic business action is **not** claimed by this release.

## Full source increment

1. **Deterministic operational evidence core** — `client/src/features/insights/run17Evidence.mjs` + `.d.mts`. Validates company/record identities, ISO dates, safe money/quantity arithmetic, currency consistency, sale-to-line/reversal/partial-return links, physical location and saved order references. Separates gross saved invoices from paid amounts; never conflates an expense or reversal with cash received. Excludes complete reversals and partial-return-affected receipts from observed unit ranking rather than inventing unavailable net units. Company-level low stock remains labelled as recorded quantity, not a physical shelf count.
2. **Store and customer-order insights** — Read-only per-store invoice counts and gross historical invoice minor-unit observations, explicitly revealing unattributed older sales; selected-period top eligible recorded product units; expired active customer reservation findings; merchant-orders with a saved POS sale but delayed preparation; late dispatched-store transfers; customer-return requests which **cannot** themselves issue money. A late transfer cannot prove loss, misconduct or theft. Results cap display at 100 findings and report the omitted count to prevent silent completeness claims.
3. **Authorized coherent read service** — `client/src/features/insights/run17Service.ts`. Uses a single company-scoped read-only Dexie transaction under existing Run 7 recovery barrier, active reports permission and unlocked-staff session checks, verifies active business identity before returning, and reads only existing local source tables. No external AI, database writes, network or background jobs.
4. **Additive IndexedDB v33** — `client/src/db/TallybookDB.ts`: appends `run17ReviewEvents` with unique company/submission and company/finding/sequence keys. Nothing backfills or fabricates historical reviews, modifies prior finance tables, reallocates Run 13 store stock, permits Run 14 network sync or activates Run 15/16 payments or public commerce.
5. **Review-journal invariants** — `client/src/features/insights/run17ReviewAudit.mjs` + `.d.mts`. Rejects malformed, repeated, foreign-company, orphan-sequence and conflicting review actions. Preserves exact evidence fingerprints, human factual notes, owner/supervisor identity, sequence and chronology. A prior acknowledgement does not hide newly changed evidence or automatically close a real operating issue. Fingerprints are a deterministic UI cache key, **not a tamperproof cryptographic financial signature**.
6. **Coordinated, release-gated human review** — `run17ReviewStore.ts` reads and reconciles saved reviews. Owner and authorized supervisors may, **only after release gates open**, acknowledge or reopen a currently grounded finding within the Run 7 recovery barrier and coordinated retail-write transaction; exact submission-key idempotency, company and staff rechecks, immutable review event and staffed audit are enforced. **`RUN17_REVIEW_WRITES_ENABLED=false` and `RUN17_AUTOMATIC_ACTIONS_ENABLED=false`** remain the authored safety defaults while acceptance is deferred. No auto-reorder, SMS, customer collection message, remote action, refund or stock mutation is performed.
7. **Version-aware backups and preflight** — `client/src/features/backup/run8BackupCompatibility.mjs` and `backup.ts` add review journal records at schema version 33 only; older backups explicitly receive empty review history. Current exports preserve company-scoped review notes and author identities, and preflight independently rejects duplicate submissions, invalid sequences, unrecognized actors, impossible transitions or malformed dates. The original assistant backup and recovery flow remains intact. No portable backup is represented as a verified restore test.
8. **Assistant tool/intent integration** — `client/src/features/assistant/assistant.ts` registers a read-only operating evidence tool and routes **explicit** business-pulse, operating alerts, analytics evidence and business-need-attention requests to the deterministic Run 17 service, but only when no financial preview or transaction confirmation is open. Returns a compact, currency-minor-unit-labelled, evidence-linked read-only answer with a route to Insights. Retains the existing assistant parser, safety validations, original confirmation/transaction flows, language preferences, optional local model fallback and company-context handling. `AssistantPage.tsx` provides a discoverable starter question.
9. **Operating Insights interface** — `client/src/features/insights/Run17EvidencePanel.tsx` is mounted on `client/src/pages/InsightsPage.tsx` and is keyed by active company and selected period. Summarizes gross saved invoices, reversal/partial-return coverage, store origin gaps, local order counts, unreceived transfers, eligible observed product units and linked individual evidence. Source references and human-review recommendations are visible; review action controls are intentionally disabled until QA acceptance. No automatic messages, sale postings or external data requests.
10. **Privacy-conscious local export** — `client/src/features/insights/run17Csv.mjs` + `.d.mts` provide UTF-8 CSV of selected company aggregate observations and source-linked findings, with escape rules against spreadsheet formula injection, bounded file size, no customer contact/address/PIN, and explicit money/profit limitations. Export is locally initiated and never automatically sent to cloud.

## Source review findings and corrections committed during this same increment

- Corrected assistant regex word boundaries so intended operating-review commands are actually matched instead of being treated as literal backslash sequences.
- Removed an out-of-scope variable in portable backup journal validation and retained independent ISO event checks.
- Added report role/session/company identity rechecks and fail-closed malformed or foreign-company source rows.
- Confirmed full reversal and cash partial-return evidence is not casually netted to a fictitious financial amount or product demand; annotated gross invoice and observed unit limitations.
- Added conservative by-store source counts without fabricating store origin for historical unattributed receipts.
- Added review event submission and per-finding sequence constraints and append-only staffed audit, with feature-write gates left off.
- Strengthened store directory/product title validation, and keyed Insights UI on active-company/period to avoid displaying a stale company's report after switching context.
- Added CSV formula prefix escaping, UTF-8 encoding, bounded output, disclosure of undisplayed finding count, and no automatic external transport.
- Confirmed version 33 review evidence is included only in backups that support the new table, with cross-company identity and staff-author checks.

This is **manual source inspection and correction only**. The lack of executed typechecking, integration tests or real database migrations means further defects may exist and none of these code paths is claimed to have passed runtime acceptance.

## Deliberate release boundaries

| Capability | Authored source status | Activation status |
| --- | --- | --- |
| Offline deterministic, source-linked assistant review | Implemented | Branch only, not accepted |
| Company-scoped local report and CSV | Implemented | Branch only, not accepted |
| Insight-review journal v33 | Implemented | Human writes disabled |
| Automated assistant financial actions from analytics | Not permitted | Disabled |
| AI model/cloud inference on business data | Not enabled | Disabled |
| External messages, reorder, customer collections or transfer execution | Not permitted by analytics | Disabled |
| Real provider payments / bank cash verification | Not part of Run 17 | Disabled |
| Public commerce / cloud sync | Remain independent Run 16/14 release gates | Disabled |

## Owner-deferred acceptance matrix — no execution claimed

| ID | Evidence required later | Status |
| --- | --- | --- |
| R17-01 | Exact-head Node 24/pnpm client and server types, syntax and production build | Deferred |
| R17-02 | Full native/IndexedDB and client unit/integration suites | Deferred |
| R17-03 | Real v32 to v33 migration and legacy backup reconstruction | Deferred |
| R17-04 | Cross-company reports, supervisor role, revoked unlock and active-company switch | Deferred |
| R17-05 | Gross sales versus wallet, refunds/reversals, cash returns and credit accounting | Deferred |
| R17-06 | Top-unit ranking excludes records with incomplete returns and missing provenance | Deferred |
| R17-07 | Run 13 store stock and transfer reconciliation with offline store-specific data | Deferred |
| R17-08 | Run 16 held, expired, delivered and return-requested order evidence | Deferred |
| R17-09 | Duplicate/same-key review, staff author, evidence change, impossible audit sequence | Deferred |
| R17-10 | Tampered and legacy portable backup, cross-tenant ID collision and crash recovery | Deferred |
| R17-11 | Browser accessibility, local timezone windows, Windows low-memory device and mobile | Deferred |
| R17-12 | Export CSV formula injection, large source sets, confidential-data leak prevention | Deferred |
| R17-13 | Explicit independent owner QA, human review-release and V19 commercial signoff | Blocked / NO-GO |

Historical V19 acceptance/blocker statuses remain unchanged in the absence of executed evidence; a source-only increment cannot declare them PASS.

## Engineering handoff

**Run 17 is delivered in one consolidated source-development increment**, as requested. No progress-only micro-release or further acceptance question is needed to continue source work. Future authorized source development can proceed to **Run 18**, but do not deploy, enable AI cloud inference, enable review writes, alter real payments, activate public commerce or merge to `main` merely because this source exists. All release gates remain open until owner-authorized testing proves them.
