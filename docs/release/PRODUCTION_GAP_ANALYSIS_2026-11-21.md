# Production-readiness gap analysis, 2026-11-21

Source of truth: `ROAD_TO_COMPLETE_PROGRESS.json` (119 tasks: **1 verified, 94 partial, 4 missing, 20 owner-external-blocked**) and `MASTER_COMPLETION_REGISTER.md`. **Verdict: not production ready.** Passing CI (all 14 checks green on #112 `bf3fcdf`) proves the software builds and its automated tests pass; it does not prove field acceptance.

## A. Gaps only the owner can close (cannot be built away)
| Gap | Tasks |
|---|---|
| Real-device acceptance (Android/iOS/low-spec Windows, printers, scanners, offline) | ST32-03/07/12, ST30-11 |
| Real Supabase Auth acceptance, mandatory-account policy, shared-device handover, password-leak protection setting | ST25-02/03/09, ST31-01 |
| Payment provider choice, licensing/compliance, credentials | ST28-01/07 |
| Hosted-database recovery drill, destructive reset/clear sign-off, disaster-recovery acceptance | ST24-04/09, ST32-04 |
| Approval to apply migrations 38/39 and later to hosted DB; merge approvals; branch protection | ST21-07/11, ST21-01 |
| Counsel-approved consent texts and legal review for public listings/Passport | CC-X-09 |
| Independent security review; app-store packaging; Apple sign-in; Telegram | ST31-03, ST30-12/13, ST29-05 |

## B. Gaps developers can close (work order)
1. **Payments (ST28-02/03/04 missing)**: provider-independent settlement ledger (this session: done in development, see below); next, a durable adapter interface + sandbox adapter driving it, and posting a succeeded payment to the sales ledger.
2. **Authorization proof (ST25-01/05)**: per-action/role/tenant negative matrix for shift RPCs, server shift attribution on offline replay, abandoned shifts, issue #68 reconciliation.
3. **Replication (ST26-01..04)**: immutable approved-event transport for refunds/repayments/shifts/purchases, conflict resolution, device trust, with an isolated real server.
4. **Stage 22/23 remainder**: wallet/split-tender/loyalty returns; batch/service/Ghana-VAT lines; multi-store partial dispatch/receipt; thousand-product scale.
5. **ST24 remainder**: DEK rotation, encrypted-ledger schema upgrade, auto-lock, encrypt residual localStorage.
6. **Operations/security (ST31-02/05/07/08)**: monitoring + incident runbook, retention/privacy, CSP review of in-memory key exposure, licence/supply-chain record.
7. **Release engineering (ST21/ST32)**: `RELEASE_GATE_MATRIX.md`, disposition of 143 historical acceptance IDs, frozen candidate + SHA-256 manifest, rollback rehearsal.
8. **UX (ST30)**: route-by-route sweep, accessibility, low-spec performance.

## C. This session's closed increments (evidence in the register)
Credit-sale returns, conservation/permission/backup/concurrency verification, active ledger encryption (#111), Connected Commerce platform + Discover backend, **payment settlement ledger** (ST28-03 engineering core).
