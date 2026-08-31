# Stage 3 Browser Validation Notes

## Isolated local browser ledger

On 2026-08-27, a disposable development-browser ledger was seeded with a valid product, named customer, and Mobile Money provider. It is separate from owner data and was used solely to exercise the actual owner-facing Stage 3 interface.

| Scenario | Result |
| --- | --- |
| Cash completion | A full Cash sale completed through the visible POS once and displayed **Receipt saved** with **View receipt**, **Share receipt**, **Print**, and **Done**. |
| Cash receipt detail | The opened read-only receipt displayed business, receipt number, date/time, walk-in customer, item, quantity, unit price, subtotal, total, paid, remaining, payment method, and actions. |
| Partial Mobile Money completion | A named-customer sale for GHS 25.00 was saved with GHS 10.00 paid, GHS 15.00 remaining, provider **StagePay Money**, and reference `S3-PARTIAL-10`. |
| Original sale facts | Its receipt displayed the original GHS 10.00 paid and GHS 15.00 remaining—not a changing customer-wide balance—plus the saved provider/reference. |
| Clipboard fallback | With native sharing unavailable and an isolated clipboard stub, the visible Share receipt action copied clean receipt text and displayed the expected owner message. The text included business facts and did not expose local identifiers. |
| Manual-copy fallback | With both native sharing and clipboard unavailable, the visible Share receipt action opened a labelled, read-only text area for manual copying. |
| Print action | The visible Print action called the normal browser print function once through an isolated browser stub. |
| No mutation from actions | Before and after opening, sharing, printing, and closing the receipt, local counts stayed at 3 sales, 1 payment, 3 repayments, 1 receipt, 1 inventory movement, 1 product, and 3 customers. |
| Refresh and reopen | After reload, the partial Mobile Money receipt remained in recent sales and reopened with the same original amounts, customer, provider, and reference. |
| Earlier safeguards | Offline-status, integrity, and keyboard browser regressions passed after Stage 3. |

Native sharing was unit-tested with a supported browser interface. A real phone browser’s share sheet and a real printer dialog remain owner-device acceptance checks because availability is controlled by the device/browser.
