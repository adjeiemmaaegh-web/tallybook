# Tallybook V9 Stage 2 — combined implementation pass

Stage 3 remains LOCKED. This work is not a Stage 2 pass.

## Added in this pass
- Product catalogue metadata for standalone variant SKUs, optional pack size, wholesale thresholds/prices, service flags, and local image data.
- V14 additive Dexie tables for persisted physical-count sessions and batch metadata.
- Atomic CSV product import with duplicate-name/code checks against the active company, category validation, and initial stock movement history.
- Count draft persistence, update and atomic posting; rejects intervening stock changes and repeat posting.
- Batch metadata registration with expiry syntax checks and company isolation. **No batch allocation on sales yet.**
- Pure integer pack conversion/wholesale price selection helpers.

## Must finish before passing Stage 2
- Wire advanced metadata, variants, images and import preview/commit to supported UI surfaces.
- Enforce service semantics in sale, purchase, stock movement and reporting services (not just metadata validation).
- Integrate pack/portion conversion and wholesale pricing in the transaction preview/checkout, with consent and snapshot guarantees.
- Batch receive/allocation on purchases, sales, reversals, expiry and stock counts. Batch quantities are currently metadata only, **not the authoritative quantity ledger**.
- Extend export, encrypted backup/restore, migration and integrity checks to include new count-session/batch records or explicitly mark them disposable and use reconciled recoverable records.
- Execute full TypeScript typecheck, Vitest, Dexie migration tests, browser offline scenarios and real device tests when dependencies/environment are available.
- Ensure import feature tests cover total rollback, cross-company data, row numbers, spreadsheet safety and archived identifiers.

## Validation performed
- TypeScript syntax/transpilation: all four changed/new files parsed.
- Full type-check and project tests were unavailable: node_modules absent.
