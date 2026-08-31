# Prototype-Faithful Tallybook Africa Redesign

## Owner decision

The five primary operating screens—**Home, Sales, Stock, Customers, and Reports**—will be visually rebuilt to closely follow the supplied prototype. This is a substantial UI/UX redesign, not a product-engine rewrite. Tallybook Africa remains the product name and local-first operating promise.

## Visual direction

The mobile interface will adopt the prototype’s dense, app-first operating model: bright warm-neutral background, cobalt-blue action color, compact rounded white cards, simple line icons, direct summary tiles, segmented filters, product grids, and opaque bottom sheets. Desktop will not merely enlarge the mobile view; it will use a distinct fixed sidebar, utility header, multi-column dashboard surfaces, and information-dense operating panels.

## Protected engine

The redesign must keep React, TypeScript, Wouter, Dexie, IndexedDB, database migrations, local-only records, service-worker behavior, atomic sale transactions, receipts, inventory movements, derived debt, repayments, backup/restore, integrity audit, keyboard accessibility, and opaque Radix overlays intact. It must not introduce an account, backend record API, cloud storage, sync, AI, or new financial workflow.

## Acceptance criteria

The visual result should be recognizably closer to the prototype at first glance, especially on mobile. It must preserve working sales, full/partial/credit payment handling, busy/error recovery, product archive visibility, stock adjustments, customer owing balances, reports, Business Setup, and Backup. The final review will cover actual mobile and desktop interactions with isolated browser records—not static screenshots alone.

## Initial shell review

The first mobile and desktop captures confirm the cobalt primary action, mobile navigation, renamed Tallybook Africa lockup, and distinct desktop sidebar are rendering. The shared structure is visibly changed, but the remaining Home, Sales, Stock, Customers, and Reports surfaces still require their dedicated prototype-faithful card, product, filter, and checkout passes before final review.

The post-redesign mobile capture confirms a substantial Home change: the app now opens with a compact cobalt Tallybook Africa action panel and card-based local status. Sales, Stock, Customers, and Reports accurately display their setup prerequisites on clean storage; their populated-record forms require isolated browser verification rather than fabricated screen data.

The final mobile gate capture confirms that Sales, Stock, Customers, and Reports now share the same cobalt app-card vocabulary as Home, including compact icon bands, direct setup headings, pale-blue prerequisite rows, solid action buttons, and the persistent five-item navigation. The prerequisite content remains genuine because the browser profile has no business record.

## Validation outcome

The final gate passed TypeScript, **19 test files / 48 tests**, production PWA build, service-worker and manifest output checks, and production dependency audit with zero low, moderate, high, or critical findings. Isolated browser validation passed sale completion with exactly one saved sale and recovered completion control, repayments and customer history, reports reconciliation, backup/restore, keyboard skip link, integrity review, known and unknown routes, and redesigned offline status/reconnection feedback. Mobile and desktop captures confirm the visible primary-screen redesign.

The production build retains the existing Vite chunk-size advisory for the main JavaScript file. Final owner-device checks remain necessary for installed-app icon appearance, low-end phone performance, browser-specific installation, and populated-record visual review on the owner’s intended phone.
