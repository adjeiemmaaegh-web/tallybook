# Tallybook V8 — Stage 1 Builds 14 & 15: consolidated engineering QA

## Build 14 — interrupted parked-cart recovery
- Resuming a parked cart now loads a working copy, retaining the original local draft until a sale is committed or explicitly discarded.
- Resuming is blocked while checkout journal is pending, damaged, or unavailable.
- Following successful checkout or recovery, remove a parked backup only if its product IDs and quantities match the committed checkout intent. Never erase a mismatched/corrupt cart.
- Added user-confirmed “Discard parked” control. A clear cart operation does not silently delete the retained saved draft.
- Added regression cases for matching/mismatching checkout and corrupted parked data.

## Build 15 — receipt/phone workflow
- Restored receipt Print control on screens narrower than 430px (the prior responsive CSS hid it).
- Kept print behavior in the existing browser print dialog; no claims about direct Bluetooth support.

## QA performed in this environment
- Changed TypeScript/TSX syntax transpilation: 3 of 3 passed.
- Six independent mocked local-storage parked-cart runtime checks: passed.
- ZIP archive integrity: checked at packaging.

## Deferred to full-system Work testing when entire project is finished
- TypeScript project typecheck, complete Vitest suite, production Vite build (project dependencies not installed).
- IndexedDB browser integration: parked cart, refresh, pending journal, checkout success/failure, recovery, company switching and partial payments.
- Actual Android/iPhone camera barcode scanner and receipt printing (80mm and normal paper), offline PWA and storage-pressure behavior.
- Product usability/UX and accessibility review, payment and stock reconciliation across the full ledger.

## Known limitations
- One parked draft per company/device; localStorage is not a durable disaster-recovery system.
- No direct printer Bluetooth protocol implementation; browser-managed print support only.
- A saved parked draft intentionally remains if cashier clears the resumed working cart without discarding the draft.
- Static transpilation and isolated mocked storage tests do not certify the full app.
