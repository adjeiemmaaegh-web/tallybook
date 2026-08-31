# Claude Prototype UI/UX Reference Analysis

## Reference boundary

The supplied `microbusiness-app-demo.html` is a **visual and interaction reference only**. Its page-specific JavaScript uses in-memory arrays and direct DOM mutation, so none of that storage, transaction, or rendering implementation will be adopted. Tallybook remains React + TypeScript, Dexie, IndexedDB, offline-first, and transaction-safe.

## Useful reference patterns

| Prototype area | UX pattern worth adapting | Production constraint |
| --- | --- | --- |
| App shell | A concise contextual top bar and five plain-language bottom destinations: Home, Sales, Stock, Customers, Reports. | Keep accessible Wouter routes, the current Backup workspace, route announcements, and persistent local/offline state. |
| Home | Four immediately useful measures, three direct actions, recent activity, and low-stock attention in one short scan. | Every figure must remain derived from saved local records; no placeholder or fabricated business activity. |
| Sales | Search and category-filtered product cards with a persistent compact cart summary; checkout follows product selection. | Preserve stock validation, idempotent completion, named-customer rules, receipt creation, and atomic local writes. |
| Checkout | A review-first bottom sheet that shows cart items, customer, payment choice, total, and a single completion action. | Add explicit paid-now and remaining balance summary for full, part-paid, and credit paths; the prototype itself does not do this sufficiently. |
| Customers | Clear All / Owing segmentation, debt-first ordering, total debt summary, and direct customer detail. | Continue deriving balances from completed sales minus immutable repayments. |
| Stock | Search, category filters, compact product rows/cards, quantity, price, and conspicuous low-stock state. | Keep movement history, stock-adjustment reason, archival persistence, and obvious Show/Hide Archived access. |
| Reports | Simple task tabs rather than dense administration controls. | Retain reconciled, read-only local calculations and scope limits. |
| Surface design | Compact spacing, predictable card rhythm, monospace-like monetary figures, visible section labels, and high-contrast bottom-sheet/modal surfaces. | Retain keyboard focus, opaque Radix overlays, responsive touch targets, and truthful local-only language. |

The observed stock screen reinforces a short, scrollable list where search and category filters sit before quantity and price. Its `− / quantity / +` control is visually easy to parse, but the production version must continue to require an adjustment reason and create an immutable inventory movement instead of applying a direct count change. The observed customer screen makes the **Debts / Owing** view a first-level control, orders owing customers before paid-up customers, and puts the balance/status on the scan edge. Those information priorities are suitable for the production customer book.

## Shared shell implementation check

The approved five primary destinations now fit the mobile footer as Home, Stock, Customers, Sales, and Reports. Business and Backup remain directly accessible in the header rather than disappearing from the product. The initial phone check preserved the local status indicator and touch-sized controls. In a clean browser state, Sales correctly presented its existing business-profile prerequisite; the next work item is the sales checkout with isolated populated data.

## Early sales regression

After the visible checkout-outcome summary was added, the isolated browser checks passed for the saved sales/repayment flow and the protected completion control. The control returned to the actionable **Complete sale** state with `aria-busy="false"` and was not disabled after the tested completion sequence. These checks exercise the existing atomic production services; they do not replace the final redesigned mobile walkthrough with a populated sales screen.

## Mobile refinement check

The updated phone view retains readable five-item primary navigation and header utilities. Home leads with the clearer at-a-glance action hierarchy; Reports retains an accurate setup prerequisite rather than displaying invented figures when no business has been configured. This verifies presentation only; the final populated-business browser walk-through remains required before human approval.

The current mobile pass confirms that Customer and Stock still show accurate business-setup prerequisites in a clean browser, rather than suggesting unavailable data can be used. Business Setup and Backup remain legible, opaque, and touch-reachable; the five primary destinations remain visible at the bottom. A populated-record browser check remains required for the new Owing and active-stock search controls.

## Patterns not to adopt

The phone-frame simulation, demonstration badge, mock greetings, in-memory records, direct `innerHTML` rendering, direct inventory mutation, and credit-only checkout model are not suitable for the production app. The production redesign must improve on the reference by making partial payment and credit consequences explicit before completion.

## Initial visual direction

The strongest fit is a **compact operational ledger**: the prototype’s direct navigation and dense mobile workspaces combined with Tallybook’s trustworthy local-record language. A dark app-chrome treatment and warmer paper work surface may be considered in the later approved implementation, but no styling or product behavior is changed by this analysis.
