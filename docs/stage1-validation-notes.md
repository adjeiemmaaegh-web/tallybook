# Stage 1 browser validation notes

## Isolated local browser ledger

On 2026-08-26, an isolated browser ledger was seeded with one business, one active product priced at GHS 20.00, and one named customer. The checks were performed against the live local application interface, not a mocked service.

| Acceptance flow | Browser observation | Result |
| --- | --- | --- |
| Full Cash sale and rapid repeat activation | The same visible Complete sale control was activated twice rapidly. One receipt was saved; the control returned with `aria-busy=false`, stock reduced once, and the recent-sales line showed Cash. | Pass |
| Full Mobile Money sale | The owner selected Mobile Money, added **StagePay Money** in context without losing the cart, named customer, amount, or payment method, selected it, and saved reference `STAGE1-FULL`. The receipt and history showed **Mobile Money · StagePay Money · Ref STAGE1-FULL**. | Pass |
| Part-paid Mobile Money sale | With a named customer and StagePay Money selected, entering GHS 6.00 changed the live summary to **Part payment · Mobile Money** with GHS 14.00 remaining. A saved receipt then showed GHS 14.00 outstanding. | Pass |
| Named-customer credit sale | Selecting Pay later changed the visible state to **Pay later · Credit**, disabled the amount field, and displayed GHS 20.00 remaining. Completion created one sale and receipt without a payment row, then returned the control to idle. | Pass |
| Refresh/reopen persistence | After reload, recent sales retained Cash, Mobile Money, provider/reference, and Credit labels. | Pass |
| Business-first provider management | The Business page listed **StagePay Money** as **Available at checkout**, with owner controls to add or hide providers. | Pass |

The isolated browser ledger ended with four completed sales, three payment rows, four receipts, and the expected product stock reduction from 6 to 2. This evidence is separate from owner data and will be replaced by the owner’s own manual acceptance during Stage 1 review.
