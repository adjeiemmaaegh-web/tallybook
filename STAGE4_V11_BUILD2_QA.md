# Stage 4 incremental update — quotation conversion price review

- Read-only quotation conversion preview validates company, customer, product availability and expiry, and computes current catalogue line totals.
- Conversion requires the reviewed current total; a changed price between review and conversion is rejected before the sale service is called.
- Quotation screen displays saved quoted total versus current catalogue total and warns if prices changed.
- Existing atomic `completeSale` remains the only sale-writing authority; no stock changes occur during preview.

## Tests executed
- TypeScript/TSX syntax parse of modified files: passed.
- ZIP integrity: passed.

## Deferred tests
- Full TypeScript typecheck, Vitest, browser checkout and IndexedDB integration (dependencies unavailable).
- Stage 2 wholesale/variant pricing integration remains pending; preview currently uses `sellingPriceMinor`, matching the current sale service baseline.

## Stage 4 coding still incomplete
- Automatic loyalty earning/redemption with atomic, reversible accounting.
- Verified prepaid wallet funding/payment/refunds.
- Discount permissions/policies and retention insights.
- Cross-stage integration (Manus Stage 2, V10 Stage 3).
