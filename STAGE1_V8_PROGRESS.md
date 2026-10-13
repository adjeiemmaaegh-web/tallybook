# Stage 1 — V8 Retail Foundation: Implementation slice 1

Source: V7 QA archive. Changes made in a separate copy.

## Implemented
- Existing multi-item atomic sales, payments, receipt view/print and idempotency are reused, not reimplemented.
- The POS product search now matches a product name or SKU.
- A keyboard/USB-scanner-friendly SKU entry field adds one unit of a uniquely matched active product and checks available stock.
- Park and resume a single device-local cart per company. The stored draft contains only product IDs, quantities, timestamp, and schema version; no payments are captured, no stock is reserved or moved, and no sale is committed.
- Resuming validates that products still exist and have enough stock, with live prices and full validation performed again during checkout.
- Added parked-cart regression tests covering company isolation, malformed data, and invalid quantities.

## Important limitations
- USB keyboard-style SKU scanners are supported by text entry; this release does not yet implement camera scanning or a true barcode field. Use a product's existing SKU for scanner labels.
- Parked carts use localStorage per browser/device and are lost if browser site data is cleared. They are not encrypted, do not sync, and support one draft per company. Resume assumes products are still in stock.
- Full dependency install, Vitest, full TypeScript check, browser/device QA, migration QA, and production build have not passed in this environment. Not production-ready.

## Next slice
- Barcode schema and uniqueness validation; camera scanner fallback; POS performance/accessibility checks; parked-cart recovery policies; browser integration tests for partial payment and printing; production build after dependency installation.


## Build 2 — Barcode identifiers and checkout
- Product records now support an optional dedicated barcode field (additive, no IndexedDB index migration).
- Product creation and editing validate barcode/SKU uniqueness against active products within the company, including cross-field collisions and case/space normalization. The checks and writes share an IndexedDB transaction.
- Inventory product form exposes barcode editing; POS lookup and scan input accept either SKU or barcode. Existing products remain valid with no barcode.
- Added regression cases for duplicate identifiers, unchanged stock on rejected inserts, edited codes, and reuse after archival.

## Build 2 limitations / QA gate
- Camera barcode decoding and physical thermal-printer compatibility are not implemented in this build. USB scanners that emulate keyboard input can use the code entry field.
- Full Vitest, TypeScript typechecking and browser checkout remain unverified until dependencies are installed.
- Because the schema remains additive and unindexed, bulk import or direct database edits bypassing inventory services may still introduce duplicate codes. Import validation must enforce the same invariant.
