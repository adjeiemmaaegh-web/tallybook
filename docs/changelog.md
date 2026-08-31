# Changelog

## Unreleased — Enhancement Roadmap Stage 3: Receipts & Easy Sharing

Stage 3 adds a local, read-only receipt detail to saved-sale confirmation and recent sales. Receipts show saved business, customer, line-item, amount, payment, and Stage 1 Mobile Money provider/reference facts. Owners can view, share, print, or dismiss a receipt. Sharing uses the device share sheet when available, then clipboard, then a clear manual-copy fallback. Printing uses the normal browser print function.

No receipt record, sale, payment, repayment, customer balance, stock, or other business record is written or changed by receipt actions. No receipt backend, WhatsApp/SMS/email API, cloud hosting, public URL, PDF service, printer service, or later roadmap stage was added. Stage 3 is waiting for owner acceptance of the deployed build.

## Unreleased — Enhancement Roadmap Stage 2: Customer Debt / Who Owes Me?

Stage 2 makes customer debt faster to find and understand without creating another ledger. Home now links **Who owes me?** to a debtor-only customer view; Customers adds a total debt spotlight and debtor count; customer detail shows Customer owes, Customer paid, and Remaining balance; and the payment dialog previews Customer owes, Customer pays, and New balance. Cash, Card, and Mobile Money labels are consistent for customer payments. A saved payment immediately refreshes the customer detail, debtor list, total, count, and order.

No database migration, editable balance, completed-sale rewrite, provider/reference field on repayments, accounting feature, cloud service, or later roadmap stage was added. The existing derived-balance, immutable-repayment, overpayment, idempotency, local-first, backup/restore, receipt, stock, and Stage 1 payment-record safeguards remain. Stage 2 is waiting for owner acceptance of the deployed build.

## Unreleased — Enhancement Roadmap Stage 1: Mobile Money & Better Payment Experience

Stage 1 adds configurable local Mobile Money providers in Business settings, a checkout provider selector, optional transaction/reference entry, and a current-sale-preserving in-context provider add path. The internal `mobile` payment method remains unchanged for compatibility and is now shown as **Mobile Money** in checkout, receipts, and recent sales. New payment rows store a provider-name snapshot and optional reference; historical Mobile Money rows without those fields remain readable.

Database version 8 adds `mobileMoneyProviders`. Backup/restore includes the new table and accepts a version-7 backup with no provider list. The read-only integrity audit checks provider-reference consistency. Automated coverage now includes migration, provider, transaction, backup, integrity, and offline regressions; isolated browser checks cover Cash, full Mobile Money, part-paid Mobile Money, Credit, rapid repeat activation, refresh persistence, and Business-first provider visibility. No payment-provider API, remote processing, sync, account, cloud transfer, or later enhancement-roadmap stage has been added. **Stage 1 is waiting for owner approval.**

## Unreleased — Stage 6 Credit and Debt Management

Stage 6 adds an offline debt ledger. Customer detail now shows a derived balance, sale/repayment history, and a mobile repayment form with amount, method, and optional note. Repayments are stored in database version 7, require an active customer with debt, prevent overpayment, and use an idempotent submission key. The balance is calculated from completed customer-sale outstanding amounts minus verified repayments.

No due dates, interest, reminders, installments, refunds/write-offs, reports, export/import, cloud backup, accounts, server database, or AI functionality has been added.

## Stage 5 Sales

Stage 5 added atomic local checkout, receipts, sale payments, customer activity, stock movements, and explicit partial-payment/credit controls with idempotent completion.

## Earlier foundations

Stages 1–4 established the offline PWA, local business profile, products/inventory, and customer book.

### Stage 6 approval repair — Business identity and sale completion

The Today and mobile working surfaces now show the saved business name. The sales workflow now accepts grouped currency entries such as `10,000.00`, uses that same parser for its live payment preview and saved transaction, and releases the completion state after success or error. A bounded local completion guard and existing idempotency key prevent an endless busy state and duplicate retries.

### Stage 6 blocking control repair

The Complete sale button no longer receives a disabled waiting cursor merely because the cart is empty. It remains clickable for explanatory validation, while native disabling is reserved for an active sale submission.

## Unreleased — Stage 7 Dashboard and Basic Reports

The Today page now includes a local, reconciled dashboard for completed sales today, money received today, current customer debt, transaction count, low-stock products, recent receipts, and a seven-day completed-sales rhythm. A new Reports page provides filtered sales, payment, customer-debt, and inventory record summaries. Reports are read-only, work offline, and deliberately do not claim profit, tax, cash-on-hand, or stock valuation.

## Unreleased — Stage 8 Offline Reliability and Recovery

Stage 8 adds an accurate **Working offline** indicator when the loaded browser loses connectivity and a visible device-storage recovery boundary on Today. It adds isolated local close/reopen, migration, metadata-healing, atomic-failure, offline-sale, cached-shell, and connectivity-return checks. No server, account, cloud backup, export/import, encryption claim, or synchronization feature has been added.

### Stage 8 approval repair — connection-restored toast

An offline-to-online transition now displays a local-only **Connection restored** toast that explicitly says nothing was uploaded. No manual sync control or Stage 9 backup/export work was added.

### Stage 8 final connection feedback

The restored-connection notice now dismisses after three seconds, and the header keeps a visible **Working offline** status until connectivity returns.

## Unreleased — Stage 9 Local Backup, Export, and Import

Stage 9 adds a Backup workspace for downloading a full versioned local JSON backup, checking a selected file before use, and explicitly replacing the current local records through one atomic restore. The flow has been verified for business details, inventory, customer debt, sales, payments, receipts, repayments, and report totals after a simulated reinstall. No cloud storage, provider integration, account, automatic sync, or merge behavior has been added.

## Unreleased — Stage 10 UX, Accessibility, and Product Polish

Stage 10 adds a keyboard skip-to-content path, accessible route announcement, clear visible focus treatment, polite loading/save status, and current action-oriented onboarding copy. It removes header controls that did not perform an owner task, updates older “future stage” backup language, and preserves every existing local business operation and integrity control.

## Unreleased — Stage 11 Security, Integrity, and Production Hardening

Stage 11 removes unused audited production packages, upgrades Express and Nano ID, and changes the static server’s client-route fallback to a current compatible form. Backup now includes a read-only local integrity check that cross-checks record relationships and saved totals, reports issues without altering records, and guides the owner to back up before seeking help. No authentication, account, remote record API, cloud transfer, encryption claim, or automatic repair was added.

## Unreleased — Stage 12 Release Candidate

Stage 12 adds final release-candidate documentation: completed release checklist, owner start guide, safe demo business scenario, backup/restore instructions, troubleshooting, privacy guidance, and known release limitations. It does not add new business behavior. Final validation repeats the existing local operation, backup, integrity, accessibility, dependency, and PWA checks before owner-device acceptance.

### Deep quality audit follow-up

The post-release-candidate audit adds production-origin PWA/offline-reload and route-recovery validators, refreshes managed ledger-surface assets, and replaces the header’s unreliable raster logo with a transparent inline ledger-fold vector. It confirms no client-side remote business-record path or business localStorage use. The release remains pending owner-device installation, low-end-performance, and cross-browser acceptance.

### Owner-approved mobile UI/UX refinement

The application now presents Home, Stock, Customers, Sales, and Reports as the primary mobile destinations while retaining Business and Backup as accessible utilities. Sales adds local product discovery and an explicit pre-completion outcome summary; Customers adds derived All/Owing navigation and debt-first order; Stock adds local active-product search and clearer archived-product controls. All business logic, IndexedDB records, offline behavior, backup/restore, atomic sales, derived debt, and report calculations remain unchanged.

### Prototype-faithful Tallybook Africa redesign

The five primary operating screens now use a substantially different compact cobalt app interface inspired by the owner-supplied prototype. Tallybook Africa replaces the former editorial primary-screen styling with a prototype-style mobile card hierarchy, fixed five-item navigation, direct task shortcuts, compact POS language, rounded inventory/customer/report surfaces, and coherent setup gates. Desktop now uses a distinct sidebar and operational dashboard workspace. The underlying local-only engine, database schema, business services, payments, stock movements, credit rules, backup/restore, integrity check, and accessibility foundation are unchanged.
