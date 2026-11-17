# Road to Complete — current engineering progress

17 November 2026. **NO-GO. All seven workflows pass on the pinned development candidate; all 12 stages remain unaccepted.** The [governing roadmap](../../road-to-complete.md) retains every requirement. Only ST21-06 is verified and checked.

[Draft PR #105](https://github.com/adjeiemmaaegh-web/tallybook/pull/105) contains the engineering work. Main remains `41d4bab619db1808f21471299bd7760eee1a6836`. Validated source is `4acc36595d80e724f2293d8c8dc322ba503daddf`; actual workflow checkout `3a87d295e30fa6672986e874881aa26d46068f4b` has an identical tree. The final evidence update does not relabel its own new documentation commit as already tested.

**Observed:** 1,211 native tests, 1,915 client tests, types/build, 30 Chromium checks, 64 checks across Chrome/Firefox/Windows Edge/macOS WebKit, security, reference UI, Clementia and read-only public smoke pass. Two builds produced identical 321-file development package manifests; 190 declared dependency licenses and 185 original notice files are retained. These results do not prove real hosted Auth, provider settlement, physical phones/hardware, independent-machine reproduction or owner acceptance.

See the [validated-source handoff and exact evidence](ROAD_TO_COMPLETE_VALIDATED_SOURCE_HANDOFF_2026-11-17.md). The [JSON register](ROAD_TO_COMPLETE_PROGRESS.json) retains each task's priority, audit status, source reuse, changes, tests, blockers and next action.

| Disposition | Tasks |
| --- | ---: |
| Verified criterion | 1 |
| Implemented pending formal acceptance | 0 |
| Partial | 94 |
| Missing engineering | 4 |
| Owner/external blocked | 20 |
| Unreviewed | 0 |
| Total | 119 |

The [143 historical acceptance IDs](ROAD_TO_COMPLETE_HISTORICAL_IDS.json) remain a separate incomplete campaign. Active-ledger encryption, real-provider settlement/refund integration, general multi-tender partial refunds, full financial replication and other recorded engineering requirements remain open. Production migrations 38/39 and leaked-password policy are unchanged and owner-gated. No main merge, production deployment, live data change or real money movement occurred.

## Task dispositions

Each ID retains its original order in the governing roadmap. This table is a disposition list, not a completion claim.

| ID | Priority | Requirement | Current disposition |
| --- | --- | --- | --- |
| ST21-01 | CRITICAL | Release Baseline | partial |
| ST21-02 | HIGH | Requirements Traceability | partial |
| ST21-03 | HIGH | Repository Architecture | partial |
| ST21-04 | HIGH | GitHub Branches | partial |
| ST21-05 | HIGH | Unmerged Engineering | partial |
| ST21-06 | HIGH | Candidate Modules | verified |
| ST21-07 | HIGH | PR #85 — Fresh-Start Release | owner-external-blocked |
| ST21-08 | HIGH | Field Acceptance Documentation | partial |
| ST21-09 | MEDIUM | Historical UI Branches | partial |
| ST21-10 | MEDIUM | GitHub Issues & Milestones | partial |
| ST21-11 | HIGH | Repository Governance | owner-external-blocked |
| ST21-12 | MEDIUM | Dead Code & Test Placeholders | partial |
| ST21-13 | HIGH | Independent Build Reproduction | partial |
| ST22-01 | CRITICAL | Sales Ledger | partial |
| ST22-02 | CRITICAL | Refunds & Reversals | partial |
| ST22-03 | CRITICAL | Customer Receivables | partial |
| ST22-04 | HIGH | Company Refund Policies | partial |
| ST22-05 | HIGH | Supplier Accounting | partial |
| ST22-06 | HIGH | FIFO, COGS & Historical Costing | partial |
| ST22-07 | HIGH | Cash, Shifts & Accounts | partial |
| ST22-08 | HIGH | Currency & Tax | partial |
| ST22-09 | HIGH | Transactional Safety | partial |
| ST22-10 | MEDIUM | Financial Reports & Exports | partial |
| ST23-01 | CRITICAL | Stock Authority | partial |
| ST23-02 | HIGH | Store Transfers | partial |
| ST23-03 | HIGH | Batch Stocktaking | partial |
| ST23-04 | HIGH | Purchasing | partial |
| ST23-05 | HIGH | Product Catalogue | partial |
| ST23-06 | HIGH | Historical Inventory | partial |
| ST23-07 | HIGH | Store Authorization | partial |
| ST23-08 | HIGH | Stock Concurrency | partial |
| ST23-09 | MEDIUM | Inventory Scale | partial |
| ST24-01 | CRITICAL | IndexedDB Migrations | partial |
| ST24-02 | CRITICAL | Cross-Database Atomicity | partial |
| ST24-03 | CRITICAL | Local Backup & Restore | partial |
| ST24-04 | CRITICAL | Hosted Database Recovery | owner-external-blocked |
| ST24-05 | HIGH | Device-Ledger Encryption | missing |
| ST24-06 | HIGH | Encryption-Key Recovery | partial |
| ST24-07 | HIGH | Multi-Tab & Storage Failure | partial |
| ST24-08 | HIGH | Import & Backup Validation | partial |
| ST24-09 | HIGH | Destructive Reset & Clear | owner-external-blocked |
| ST25-01 | CRITICAL | PostgreSQL RPC Security | partial |
| ST25-02 | CRITICAL | Real Authentication | owner-external-blocked |
| ST25-03 | HIGH | Mandatory Online Account Policy | owner-external-blocked |
| ST25-04 | HIGH | Staff Permission Boundaries | partial |
| ST25-05 | HIGH | Shared-Shop Shifts — Issue #68 | partial |
| ST25-06 | HIGH | Owner Employee Audit | partial |
| ST25-07 | HIGH | Local Staff Authentication | partial |
| ST25-08 | HIGH | Business & Employee Onboarding | partial |
| ST25-09 | MEDIUM | Shared-Device Handover | owner-external-blocked |
| ST26-01 | CRITICAL | Financial Replication | partial |
| ST26-02 | CRITICAL | Device Enrollment & Trust | partial |
| ST26-03 | CRITICAL | Offline Replay | partial |
| ST26-04 | HIGH | Conflict Resolution | partial |
| ST26-05 | HIGH | Central Management Reports | partial |
| ST26-06 | HIGH | Offline Multi-Employee Operation | partial |
| ST26-07 | HIGH | Alchemy Watchdog Contract | partial |
| ST26-08 | HIGH | Watchdog Provenance | partial |
| ST27-01 | CRITICAL | Complete Customer Ordering | partial |
| ST27-02 | HIGH | Guest Order Security | partial |
| ST27-03 | HIGH | Pricing & Quotations | partial |
| ST27-04 | HIGH | Stock Reservations | partial |
| ST27-05 | HIGH | Fulfillment | partial |
| ST27-06 | HIGH | Commerce Refund Policy | partial |
| ST27-07 | HIGH | Customer Privacy | partial |
| ST27-08 | MEDIUM | Commerce Scope & Marketing | partial |
| ST28-01 | CRITICAL | Provider Selection | owner-external-blocked |
| ST28-02 | CRITICAL | Real Payment Adapter | missing |
| ST28-03 | CRITICAL | Settlement Integrity | missing |
| ST28-04 | HIGH | Refunds & Chargebacks | missing |
| ST28-05 | HIGH | Payment Failure Testing | partial |
| ST28-06 | HIGH | Manual Payment Separation | partial |
| ST28-07 | MEDIUM | Provider Compliance | owner-external-blocked |
| ST29-01 | HIGH | Clementia Task Coverage | partial |
| ST29-02 | HIGH | Financial Intelligence | partial |
| ST29-03 | HIGH | Permissioned Automation | partial |
| ST29-04 | HIGH | Demand & Risk Insights | partial |
| ST29-05 | HIGH | Telegram Integration | owner-external-blocked |
| ST29-06 | HIGH | Assistant Write Safety | partial |
| ST29-07 | MEDIUM | Language & Speech | partial |
| ST29-08 | MEDIUM | Analytics Sharing | partial |
| ST29-09 | MEDIUM | Assistant Isolation | partial |
| ST30-01 | HIGH | All UI Entrypoints | partial |
| ST30-02 | HIGH | Onboarding UX | partial |
| ST30-03 | HIGH | Receipts & Scanning | partial |
| ST30-04 | HIGH | PWA Lifecycle | partial |
| ST30-05 | HIGH | Accessibility | partial |
| ST30-06 | HIGH | Low-Spec Performance | partial |
| ST30-07 | MEDIUM | Currencies & Business Types | partial |
| ST30-08 | MEDIUM | Premium UI Proposal | partial |
| ST30-09 | MEDIUM | Product Images | owner-external-blocked |
| ST30-10 | MEDIUM | Loyalty | owner-external-blocked |
| ST30-11 | MEDIUM | Bluetooth Printing | owner-external-blocked |
| ST30-12 | MEDIUM | App-Store Packaging | owner-external-blocked |
| ST30-13 | MEDIUM | Apple Sign-In | owner-external-blocked |
| ST30-14 | MEDIUM | Marketing, Help & Packaging | partial |
| ST31-01 | CRITICAL | Supabase Password Security | owner-external-blocked |
| ST31-02 | HIGH | Content Security Policy | partial |
| ST31-03 | HIGH | Independent Security Testing | partial |
| ST31-04 | HIGH | Security Tool Findings | partial |
| ST31-05 | HIGH | Data Privacy | partial |
| ST31-06 | HIGH | Environment Configuration | partial |
| ST31-07 | HIGH | Operational Monitoring | partial |
| ST31-08 | HIGH | Backup Operations | partial |
| ST31-09 | HIGH | Legacy Client Security | partial |
| ST31-10 | MEDIUM | Licensing & Distribution | partial |
| ST32-01 | CRITICAL | Frozen Release Candidate | partial |
| ST32-02 | CRITICAL | Complete Regression | partial |
| ST32-03 | CRITICAL | Two-Account Field Acceptance | owner-external-blocked |
| ST32-04 | CRITICAL | Disaster-Recovery Acceptance | owner-external-blocked |
| ST32-05 | CRITICAL | Final Financial & Security Certification | partial |
| ST32-06 | HIGH | Cross-Browser Matrix | partial |
| ST32-07 | HIGH | Real Hardware Acceptance | owner-external-blocked |
| ST32-08 | HIGH | Production-Scale Performance | partial |
| ST32-09 | HIGH | Reference & Requirement Signoff | partial |
| ST32-10 | HIGH | GitHub Integration Closure | partial |
| ST32-11 | HIGH | Final Distribution Package | partial |
| ST32-12 | HIGH | Owner UAT & Handoff | owner-external-blocked |
| ST32-13 | HIGH | Final GO/NO-GO | partial |

Earlier verification remains in the [continuation](ROAD_TO_COMPLETE_CONTINUATION.md), [recovery](ROAD_TO_COMPLETE_RECOVERY_2026-11-17.md), [checkpoint](ROAD_TO_COMPLETE_VERIFIED_CHECKPOINT_2026-11-17.md) and [browser/notice](ROAD_TO_COMPLETE_BROWSER_AND_NOTICE_EVIDENCE_2026-11-17.md) reports, with their original source identities. The updated summary separates those historical results from the new hosted executions.
