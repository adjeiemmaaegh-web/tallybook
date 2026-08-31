# Stage 2 Browser Validation Notes

## Isolated local browser ledger

On 2026-08-26, a disposable browser-only ledger was seeded with two named customers, two completed debt-creating sales, and one existing repayment. This data exists only in the browser used for validation and is not shared with owner records.

| Scenario | Result |
| --- | --- |
| Debtor discovery | **Who owes me?** showed GHS 25.00 across two customers. The debtor-only view displayed Ama Owes at GHS 15.00 before Kojo Owes at GHS 10.00. |
| Customer detail | Ama’s detail showed **Customer owes** GHS 20.00, **Customer paid** GHS 5.00, and **Remaining balance** GHS 15.00, alongside the sale and prior payment history. |
| Payment preview | Entering GHS 10.00 showed **Customer owes** GHS 15.00, **Customer pays** GHS 10.00, and **New balance** GHS 5.00 before save. |
| Payment methods | The visible repayment choices were Cash, Card, and **Mobile Money**. No provider/reference control appeared. |
| Immediate update | The initial live test exposed that the open customer detail refreshed while the debtor list retained an old total. This was repaired by updating the existing derived summary map after a successful repayment. Retesting showed the total fall from GHS 25.00 to GHS 15.00 and the reordered debtor list immediately. |
| Final settlement | Saving the last GHS 5.00 payment showed one debtor remaining at GHS 10.00; Ama disappeared from the debtor-only list, but her completed sale and immutable payment history remained visible with a zero balance. |
| Home deep link | Home showed **Who owes me?** GHS 10.00 with a direct `/customers?view=owing` link. |

The manual browser results complement automated overpayment, customer-isolation, idempotency, offline-status, integrity, keyboard, TypeScript, test-suite, production-build, and audit checks.
