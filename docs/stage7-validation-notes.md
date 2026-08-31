# Stage 6 Follow-up and Stage 7 Validation Notes

## Interactive browser evidence

The End of day page was opened with saved local records. The rendered page showed distinct **Sales recorded today**, **Money actually received today**, **Still unpaid from today’s sales**, and **Named customers served** panels. It also showed the `Print / Save as PDF` control and the required disclaimer:

> End of day summary — not a receipt, invoice, tax document, or accounting statement.

The rendered print control was invoked through a temporary in-page browser-print test hook. Before and after local table counts were identical: sales `4`, payments `2`, receipts `2`, repayments `3`, products `1`, inventory movements `3`, suppliers `1`, purchases `1`, and purchase lines `1`. The temporary hook was called and no business record changed.

The real Purchases page was also exercised with an active business profile. A supplier named **Stage Seven Wholesaler** was saved through the owner interface. A purchase of **4** Stage 3 Cooking Oil units at **GHS 8.50** was completed; the rendered purchase history retained supplier, product, quantity, unit cost, and total **GHS 34.00**. The existing Stock page then showed stock of **10** and a clearly labelled `Purchase received · +4 units · Purchase from Stage Seven Wholesaler` movement.

## Public-release verification

The first cache-busted public request to `/purchases` served the previous application shell and correctly produced the pre-release route-not-found page. The sandbox browser then removed only its public-origin service-worker registrations and application-shell cache entries; business-table data was not read, modified, or removed. A second cache-busted public request is required before the release is handed over.

The second cache-busted public request to `/purchases?stage7-release=197bf57-live` displayed the deployed **Purchases** workspace, including `Record purchase`, `Add supplier`, supplier guidance, purchase-history guidance, and `Back to Stock`. The release is therefore owner-testable at the public domain.
