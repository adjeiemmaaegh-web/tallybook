# Tallybook V19 — Independent receivable-integrity audit continuation

**Date:** 11 October 2026
**Input:** `TALLYBOOK_V19_RECEIVABLE_CURRENCY_CONTINUATION_2026-10-11_SOURCE.zip`
**Verified source SHA-256:** `8a0aa86b83475dfa401d29d2a30c2d54004b89f22b99268de23cb10c66b49bd7`
**Decision:** **NO-GO / INCOMPLETE**. No external provider, deployment, hosting, real payment, or physical hardware access was used.

## Independent scope and rationale

The existing local `auditLocalIntegrity` inspected individual repayment amounts but did not reconstruct customer receivables from the original saved sales, immutable full reversals, and explicit repayment allocations. A corrupt or duplicated reversal, refunded sale repaid after reversal, excess collection, duplicate allocation, or mixed-currency debt could remain absent from the local integrity report even though some of those states were blocked during newer write operations. Backup imports and old local data require their own read-only post-facto detection.

Added `client/src/features/reliability/receivableAudit.mjs` as a standalone, deterministic, **independent** per-customer audit that does not call the transaction-authorizing calculator `creditLedger.mjs`. It uses BigInt internal sums of saved minor-unit balances, checks sale/company/customer identities, original full-reversal signed amounts and receipts, orphan/duplicate reversals, positive repayment amounts, exact links and cumulative allocation bounds, reversal-before-repayment conflicts, currency snapshots, and over-repayment / safe-money totals. It explicitly preserves all-unknown legacy currency and unallocated repayments as *unknown*, not falsified as GHS or FIFO allocations. Reports only issue code and record ID; it makes **no mutations** and no forex conversion.

Wired the new checker into the existing IndexedDB local integrity audit, adding `saleReversals` to its consistent Dexie read transaction and incrementing `recordsChecked`. The Backup screen already invokes that audit; it can now report detected receivable inconsistencies using the existing `attention` status. Added read-only client Dexie regression tests for tampered allocation and signed full reversal (authored but **not executed**).

### Verification and boundaries

- Linux Node 22.16.0 / OpenSSL 3.0.16 native full suite: **250/250 passed**, zero failed or skipped. New independent tests: **13**, previous baseline **237**. Record: `artifacts/continuation-2026-10-11-receivable-audit/native-full.log`.
- Separate mock-payment suite: **4/4 passed**; not added to the native count.
- Changed TS/test/declaration files parsed with TypeScript 5.8.3 compiler API; `.mjs` files passed Node syntax checks. **Syntax is not a TypeScript semantic or build pass.**
- Full client Vitest, fake/real IndexedDB integration, semantic TypeScript check, production build, Playwright, pinned Node 24/pnpm tests, staging and physical recovery: **NOT RUN** because the pinned package runtime and dependencies were unavailable in this environment.
- This is **detection**, not repair or posting: no partial refunds, inventory/tax/tender/wallet corrections, historical currency migration, provider verification, crash-safe two-database recovery, or fully reconciled financial reports were implemented.
- Existing scoping audits only the currently active company; a global database-wide forensic audit has not been implemented. Independent audit of saved receivables does not prove the main accounting state is correct in every supported client/migration environment.

## Follow-up

`FIN-009` remains **implemented-unverified** pending actual client integration tests and migration verification. The complete 82-unit traceability register remains open per prior statuses. Next steps: run the pinned full client suite and review actual IndexedDB integrity results, implement transaction-safe partial return/refund postings with conserved quantities/cost/tax/tenders, and design durable main/assistant database restore recovery. **Release remains NO-GO / INCOMPLETE.**
