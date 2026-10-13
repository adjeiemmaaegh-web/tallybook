# Tallybook V19 — Partial-return component allocation continuation

**Date:** 2026-10-11
**Release:** **NO-GO / INCOMPLETE**
**Input:** `TALLYBOOK_V19_STORE_AUTH_INTEGRITY_CONTINUATION_2026-10-11_SOURCE.zip`
**Input SHA-256:** `b5cd9f46b88f4c43d77e6c546b17533f8fc3c9b0c66e017ee8c77e961151b460`

## Changes actually implemented

- Extended the existing **read-only** partial-return draft planner to allocate **original taxable amount, tax, and discount** separately, using fixed sale-line shares and cumulative whole-quantity deltas. Repeated partial returns conserve original invoice-wide components, even with uneven penny rounding.
- Validates nonnegative safe-integer saved tax components and confirms `taxable + tax == total` using BigInt. If the sale contains its original tax policy, recomputes inclusive/exclusive saved tax with the saved rate and rejects tampered policies or totals. A legacy tax object without its original policy is visibly **unverified**, never silently assumed valid.
- Replaced imprecise `paid + debt` reconciliation with exact BigInt arithmetic. Updated `.d.mts` contract to expose `draftTaxableMinor`, `draftTaxMinor`, `draftDiscountMinor`, line components and `taxPolicyVerified`.
- Added seven tests for tax modes, cumulative allocation conservation, tampered tax, legacy uncertainty, order independence and numeric overflow.

**Important scope limit:** This planner does not create or post a return, refund money, create tax credits, change debt/wallet/points, restore stock/batches/FIFO costs, or interact with providers. It cannot accept refunds without transactional event/posting and owner-approved policy. No statutory tax compliance is asserted. An absent historical tax snapshot still has `historical-tax-unknown` status.

## Checks executed (Linux Node 22.16.0)

| Check | Result | Evidence |
|---|---|---|
| Source input SHA-256 | Matched expected | Adjacent manifest |
| Native Node/QA full suite | **288 passed / 288**, zero failures or skips | `artifacts/continuation-2026-10-11-return-components/native-final.log` |
| Mock payment gateway, separate | **4/4 passed**, not a real gateway | `artifacts/continuation-2026-10-11-return-components/mock-final.log` |
| Modified JS syntax | Pass | `artifacts/continuation-2026-10-11-return-components/syntax.log` |
| TypeScript semantics | **NOT VERIFIED**: `tsc --noEmit` exits 2 due missing Node/Vite type definitions | `artifacts/continuation-2026-10-11-return-components/types-attempt.log` |
| Client Vitest / browser / production build | **NOT RUN**: pnpm/project dependencies absent | `artifacts/continuation-2026-10-11-return-components/environment.log` |

All 82 acceptance units remain, and the issue register gains FIN-011 (**implemented-unverified**, scoped to the draft planner, not actual refunds). The earlier FIN-005 and global finance/release issues remain open. The owner has not approved external deployment or any real payment.

## Follow-up priority

Implement and independently test actual partial return events atomically linked to original sale lines, original FIFO and batch allocations, tax/discount/tender/debt/wallet/loyalty conservation, idempotency, cross-period reporting and security approval. Run full pinned client, TypeScript, build, real IndexedDB and browser checks when the environment exists. Continue from the **new** return-components source archive, not the old store archive.
