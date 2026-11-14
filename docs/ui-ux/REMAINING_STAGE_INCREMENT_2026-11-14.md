# Next partial-stage increment — business identity, secure employee joining and catalogue options
**Date:** 2026-11-14. **Baseline:** deployed Tallybook main `59c8b8b98036edade28877549c03875c3bda11f4`.

## Implemented
| Original photo stage | Change | State |
|---|---|---|
| 3, 22 | Real business-type field and owner-only read/update via RLS plus column-level UPDATE grant; optional business type in owner creation and retryable profile editing | Source implemented; requires additive database migration and live role checks before production |
| 4, 23 | More legible join instructions, code syntax checks, secure copy/expiry guidance; retains authenticated single-use/24-hour/lockout enforcement on server | UI implemented; live owner/attendant join with actual accounts still pending |
| 14 | Browse by category; create a new *independent* size/colour SKU prefilled from an existing product but inactive, with no reused barcode, stock or product ID | Usable SKU option workflow; a linked parent/variant attribute matrix is NOT implemented |

## Integrity and security constraints
- Classification is **informational only**; never used for permissions, business-scoped financial rules, refunds or pricing.
- Migration is additive and leaves existing business types NULL. It grants `UPDATE(business_type)` only and restricts rows to `owner_id = auth.uid()`. Existing owner-only business creation/idempotency and RLS stay unchanged.
- The company table has no general `UPDATE` grant; the migration **must** be applied and its live owner/attendant read/write behavior checked before enabling the feature in production.
- Long invitations remain recipient-targeted by the server. Short codes remain hashed/single-use, server-limited and do not turn public employee IDs into credentials.
- Each catalogue option is a separate product. Prices, barcodes and inventory are independent. There is no assumption that options are linked in SQL, and new options start unavailable for sale.
- No live payment, customer sale, production database write or migration has been performed by this source increment.

## Remaining partial stages
7/25 (optional Apple provider), 13 (genuine customer-facing commerce), 26 (cross-device sync and AI evidence), 27/28 (accurate Alchemy/Tallybook marketing). Stage 14 remains **partial** until a source-of-truth parent/variant option model is implemented. The 29-stage reference matrix remains historical and must not be automatically relabelled as accepted.

## Release gates
Pinned Node24 native/server suite, TypeScript, client Vitest, Windows Edge, WebKit, mobile and browser acceptance all required; plus **new SQL migration validation and live production RLS acceptance** before merge/deploy. If any gate cannot be completed, retain changes on a PR branch and report the gap. No independent real-device POS acceptance is implied by automated checks.
