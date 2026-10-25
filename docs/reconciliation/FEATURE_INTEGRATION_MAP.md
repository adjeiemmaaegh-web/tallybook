# Branch feature integration map

This is a source wiring inventory, not acceptance evidence. The GitHub stage22 baseline is a descendant of `main` and contains the later V19 run modules. The Master-only `candidate_modules/` directory has no imports from the application, server or shared runtime and remains unintegrated reference code.

| Scope | Runtime connection found | Current verification boundary |
|---|---|---|
| Authentication/cloud membership | Cloud panels are imported by `CloudAccountPage.tsx` and `SyncStatusPage.tsx`; server has run2–run5 route modules. | Remote identity, production service and tenant acceptance open. |
| Secure synchronization | Run14 local/relay modules and v30 replica tables exist. | Offline-first and company isolation require wider test and browser review; no live remote claim. |
| Multi-store | Store stock tables and routed store UI exist. | Transfer, reservations and historical stock attribution remain under reconciliation. |
| Payment simulation | `Run15PaymentSandboxPanel` is imported by `SalesPage.tsx`. | Sandbox only; live processing prohibited. |
| Public commerce development | `Run16OrderOperations` is imported by `CommercePage.tsx`. | No production checkout or fulfillment acceptance. |
| Analytics/advisory | `Run17EvidencePanel` is imported by `InsightsPage.tsx`. | Review-only advisory; no automatic financial action. |
| Device and operations evidence | `Run19DeviceAcceptancePage` and `Run20OperationsPage` are app routes. | Pages collect evidence; no physical-device or release acceptance has been performed. |
| Master-only candidate modules | `candidate_modules/` is retained for provenance but has no runtime import. | Do not call these features integrated until their behavior is merged and tested. |

Exact branch heads and path hashes are in `branch_provenance.json` and `file_sha256_comparison.json`. Further import-path and behavior review is required before any feature is considered complete.
