# Tallybook operational upgrade — 2026-11-14
Baseline: main `cec7dbac2339b6e832dce00cd93b0b6068f2008a` after PR #88 full-CI acceptance.

## Implemented source increment
The user-authorized priority order targets five critical operations first, then onboarding/owner/order navigation.

| Stage | Implemented upgrade | What remains open |
|---|---|---|
| 17 — POS | Visible unreconciled sale count, manual reconciliation trigger and confirmed removal of rejected/unreadable records | Real offline device sale then restart, cross-device resync, receipt reconciliation; tests before merge |
| 15 — Inventory | Manual stock-change quantity validity, server operation ID reuse, fail-closed ambiguous retry, physical-removal confirmation and reason attached to ledger | Real stock dispatch/multi-store physical count, crash recovery and actual device tests |
| 12 — Purchasing | Real supplier payables totals using BigInt, supplier and order search/filter, receipt progress | Bank/PSP reconciliation is deliberately external, full supplier settlement QA |
| 10 — Transfers | Real transfer-state cards, searchable history, status filters, received units not confused with in-transit units | Physical store dispatch/receive sequence, concurrent inventory reconciliation |
| 16 — Sales | Owner-only export of currently loaded receipt pages to CSV, formula-escaping, explicit partial export warning | Large-history export beyond loaded pages, actual customer privacy/security acceptance |
| 2/21 — Onboarding | EUR setup choice, readable currency names, mandatory named store and no currency change migration | Full real-account setup, multi-currency acceptance; historical shops unchanged |
| 13 — Orders | External-order queue filters, lifecycle metrics and search with honest public-checkout disclaimer | Genuine public customer checkout not implemented |
| 18 — Dashboard | Quick links to sales history, purchasing and physical counts | Complete audited profit ledger, graphical sales series and store comparisons unverified |

Other original stages (1, 5, 6, 8, 9, 24 and 29) already have source paths. This increment does not pretend to reimplement Apple sign-in, independent payment processing, app-store integrations or full cloud synchronization.

## Safety and verification
- No financial mutation or Supabase migration initiated by the engineering process; code changes extend existing server RPCs and role gates.
- Real stock-adjustment idempotency was confirmed read-only in the production `private.tallybook_shop_action` procedure: `operationId` is checked against the existing movement and rejects mismatched replays.
- Test coverage includes CSV formula injection, exact BigInt supplier sums, transfer status math, owner report source restrictions, fixed-stock-retry IDs, owner navigation and online-order read-only filtering.
- Release is **not accepted** until source CI fully passes on the final commit. Real OAuth, bank/provider settlements, owner/staff real browser, physical devices, offline power-loss and customer acceptance remain open.
- Production Vercel was previously blocked by a daily API deployment quota; no deployment result should be inferred from a merged commit.

## No unsafe imitations
A public Stockdey-style checkout is not created without secure anonymous customer workflows, server-side pricing, inventory reservations/fulfilment, consent and payment/provider integration. These are distinct future engineering workstreams, not a cosmetic change to the existing staff order ledger.
