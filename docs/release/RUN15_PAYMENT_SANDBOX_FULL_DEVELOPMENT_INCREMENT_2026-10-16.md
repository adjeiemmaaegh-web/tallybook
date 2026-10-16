# Tallybook V19 — Run 15 Payment Gateway Sandbox — Consolidated Source-Development Increment

**Date:** 2026-10-16 (Asia/Dubai)  
**Development branch:** `v19/run15-payment-sandbox-development-20261016`  
**Parent Run 14:** `f2eedd8d52a88b94478d74719d5bf8bcda89ddcc`  
**Final implementation source HEAD before documentation:** `73c7dbb880ffdd6ebadec3f85ea4ec8dad891098`  
**Status:** **PROVIDER-NEUTRAL LOCAL MOCK SOURCE IMPLEMENTED; EXTERNAL PROVIDER SANDBOX INTEGRATION BLOCKED PENDING OWNER PROVIDER SELECTION AND SANDBOX AUTHORIZATION.**  
**QA status:** **ZERO tests/builds/typechecks/CI/browser jobs executed**, per owner's instruction. No executable pass, signoff or production readiness claimed. Full V19 commercial release remains **NO-GO**.

## Authorized development scope and money-integrity policy

Run 15's original roadmap requires a chosen payment provider and separate owner approval for a real processor sandbox. The owner has authorized *development work only* without selecting a provider or authorizing sandbox credentials, bank access, merchant onboarding or any external payment action. This source increment therefore provides a complete provider-neutral local simulator, isolated state journal, strict idempotent transitions, server-only mock callback HMAC contract, mock-only review UI and a deny-all external adapter. **No live or external provider, no real test charge, no genuine Mobile Money API and no webhook URL has been connected.**

All sandbox values explicitly state `mockOnly:true`, `provider:"mock-only"`, `authoritativeSettlement:false` and `financialPostingPerformed:false`. Neither mock success nor a mock callback changes:
- sales/payments/receipts, captured cash, outstanding customer balances, wallet credit or customer rewards;
- inventory, purchase orders, supplier payables, stock transfers, tax, return-policy snapshots or financial reports;
- any production external charge, refund, transfer or bank/Mobile Money settlement.

The existing real offline POS continues its existing business-configured receipt/tender workflow independently. Mock payment data must not be reconciled as received money.

## Source implementation

1. **Separate IndexedDB version 31**: `client/src/db/TallybookDB.ts` adds `paymentSandboxIntents` and `paymentSandboxEvents` with company/submission-key uniqueness, and unique per-intent event sequences. Existing schema v1–30 and all real finance tables remain unchanged. No legacy payment inference.
2. **Mock contract and strong state transitions**: `client/src/features/payments/run15MockContract.mjs` and typed declaration define strict creation, per-company identity, three-letter currency, safe positive minor-unit amounts, exact event keys, canonical timestamps, repeat-event checking and permitted `pending → succeeded/failed`, uncertain timeout, partial/full simulated refund and chargeback transitions. Invalid, orphan, replayed, duplicate, conflicting, over-refunded, overflowed or out-of-order simulation events fail closed.
3. **Atomic local owner-controlled simulation service**: `client/src/features/payments/run15MockStore.ts` uses the existing coordinated retail-write lock, Dexie single transaction, Run 7 recovery barrier and unlocked company-owner permission. Exact submission-key replays preserve the original intent; conflicting key reuse is denied. Each simulated action checks the complete prior event history, appends immutable sequenced evidence, updates only sandbox state and adds staff audit evidence atomically. Read-only reviews independently replay the timeline, and company currency must match.
4. **Provider-neutral server-side signed mock callback fixture**: `server/run15SignedMockCallback.mjs` signs and verifies canonical mock-only callback JSON with SHA-256 HMAC, constant-time signature comparison, max-length checks, UTC timestamp freshness (±5 minutes), company/intent/event identity and exact-body binding. Secret is server-only; no network endpoint is mounted. This signature is **not** any real provider's signature format or settlement confirmation.
5. **Legacy mock gateway composition**: `server/run15PaymentSandboxHarness.mjs` wraps the existing local `server/paymentGateway.mjs` mock for explicitly configured `local-test` or `local-development` only; preserves company isolation and exact idempotent simulated events, and never returns `authoritativeSettlement:true`. No real payment credentials.
6. **External provider denial**: `server/run15ProviderBoundary.mjs` has `RUN15_REAL_GATEWAY_ENABLED=false` and `RUN15_APPROVED_SANDBOX_PROVIDER=null`; creates a deny-all adapter for create/inspect/refund/callback/dispute. Provider SDK, merchant sandbox HTTP route, production environment and live keys are not enabled.
7. **Operator experience**: `client/src/features/payments/Run15PaymentSandboxPanel.tsx` is mounted below the actual saved sales area in `client/src/pages/SalesPage.tsx`, distinctly labeled *simulation only*. Create simulated pending mobile/card intents, choose an existing mock intent, simulate success, failure, timeout, refund or chargeback, inspect local status and reconcile the mock journal. No sandbox control completes a sale or produces a receipt.
8. **Restore / retention boundary**: Version 31 mock evidence is **device-local and intentionally excluded from portable company finance backups**. On portable ledger restore, `client/src/features/backup/backup.ts` clears both mock-only tables inside the same crash-safe transaction as other ephemeral remote state. Standard company deletion already clears all company-indexed tables. This prevents stale local simulation events from being mistaken for restored financial facts.
9. **Source typing**: separate declarations for mock event contract and server-only callback, harness and disabled provider adapter.

## Source-level defects found and corrected

- The initial v31 source insertion left malformed statement boundaries between version 30 and 31; corrected to explicit complete `});` statements.
- Millisecond-equal timestamps could reorder mock success/refund events. Added an explicit sequential ordinal and uniquely indexed `[businessProfileId+intentId+sequence]`; audits re-evaluate ordinal replay independently from time.
- Server mock callback originally required company IDs of eight or more characters, but existing companies may use `primary`; company identity validation now permits 1–128 safe characters and keeps event/intent IDs strict.
- Aligned legacy server mock IDs and callback simulation IDs; no automatic mapping from a real provider charge to a sandbox intent.
- Ensured simulated payment currency equals the selected company's configured currency.
- Verified new tables remain absent from portable authoritative finance export lists and are purged on restore instead of imported as real receivables or payments.
- Confirmed no new gateway network routes, no API keys and no payment confirmation integration with `completeSale` or real receipts. Existing mock server generator remains separately local-only.

This was a **manual source inspection**, not semantic TypeScript compilation or functional testing. Other implementation defects may remain.

## Functional and authorization limitations

- No owner-selected provider, merchant account, webhook specification, sandbox onboarding authorization, external sandbox endpoint, transaction API, real provider signature verification or reconciliation to actual settlement statement. These are **not delivered or claimed**.
- No real-time payment collection, refund initiation, chargeback resolution, fee accounting or actual Mobile Money/card transaction is enabled by the mock source.
- Browser mock actor actions are explicitly simulated and do not prove possession of provider credentials; the HMAC signed fixtures are server-only mock proofs.
- The sales UI mock panel is an isolated owner-operated engineering demo and must never be presented as customer payment success.
- Live gateway is disabled even if an environment variable or unauthorized API key were supplied. A future owner-selected provider adapter requires a separate explicit change and new security/financial review.

## Deferred full acceptance matrix — planned only, NOT EXECUTED

| ID | Acceptance evidence required | Status |
| --- | --- | --- |
| R15-01 | Node 24/pnpm full TypeScript, native and client build on final SHA | Deferred |
| R15-02 | v30→31 IndexedDB migration and restart with existing customer/sale data | Deferred |
| R15-03 | Multi-company mock intent isolation and original submission-key replay | Deferred |
| R15-04 | Timeout outcome uncertainty; duplicate callback idempotency and conflict denial | Deferred |
| R15-05 | Full/refund/partial/refund overflow, chargeback and impossible state transitions | Deferred |
| R15-06 | HMAC callback tampering, wrong tenant, stale timestamps and key misuse | Deferred |
| R15-07 | Cross-tab simultaneous event creation and unique event sequence conservation | Deferred |
| R15-08 | Simulated success NEVER updates real payments, sales, receivables, payables or stock | Deferred |
| R15-09 | Company opt-out, staff owner-only mutation, shifted/revoked actor, crash recovery | Deferred |
| R15-10 | Portable backup restore purges mock evidence without corrupting genuine receipts | Deferred |
| R15-11 | Windows 11 low-resource browser and Android UI accessibility / recoverability | Deferred |
| R15-12 | Real **owner-selected, separately approved provider** sandbox contract, signatures, API fees, settlement and callback tests | Blocked on provider/owner approval |
| R15-13 | Finance reconciliation and explicit release authorization before activating any payments | Blocked / NO-GO |

The historical 82 acceptance units and 47 release blockers remain unchanged because this increment did not execute evidence-generating checks. No CI or test assertions are represented as passed.

## Handover and next run

**Run 15 local sandbox source development is delivered in this single consolidated increment.** A real payment-provider sandbox remains explicitly blocked until selection and approval; do not interpret this as an authorized gateway integration. Run 16 public commerce source work may proceed under the owner's stage-by-stage development-only policy, with all external order submission, customer-facing production exposure and payment collection still release-gated. Do not merge to `main`, activate real payment routes or deploy.
