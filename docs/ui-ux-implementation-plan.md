# UI/UX Implementation Plan — Owner Approval Required

## Decision boundary

This plan adopts the supplied Claude prototype as the **primary UI/UX reference** while preserving Tallybook as the production engine. It is a current-application UI/UX refinement, not a replacement architecture and not a move to a new development stage. The owner has approved implementation subject to the safeguards and order recorded here.

## 1. What will be adopted from the reference

The redesign will adopt the reference’s app-first mobile hierarchy rather than its mock-data code. The primary navigation will use the plain-language order **Home, Sales, Stock, Customers, Reports**. Home will prioritize a short four-measure snapshot, direct actions, recent saved activity, and low-stock attention. Sales will move toward a searchable, category-filtered product picker with a persistent cart summary and a review-first checkout sheet. Customers will make an **Owing** view and total customer debt easy to reach. Stock will prioritize search, categories, price, quantity, low-stock state, and an obvious archived-record control. Reports will use simple task tabs instead of a dense administration surface.

The visual treatment will shift toward a **compact operational ledger**: clearer contextual top bars, tighter but still touch-safe spacing, scan-friendly rows, tabular monetary figures, practical status pills, and opaque bottom sheets or dialogs. The current warm paper material and local-record language will remain, but the workspace will behave more like a daily shop tool than an editorial landing page.

## 2. What will remain from the current production application

| Production foundation | Protection in the redesign |
| --- | --- |
| React + TypeScript + Wouter | Existing components and accessible routes remain the rendering/navigation system. Page labels may change, but route behavior remains testable. |
| Dexie + IndexedDB | UI reads and writes continue through the existing feature services and database schema. No prototype arrays, localStorage records, or direct DOM data handling. |
| Offline-first PWA | Service worker, local working-offline state, reconnection truthfulness, and owner-controlled backup remain unchanged. |
| Atomic operational logic | `sales.ts`, repayment logic, inventory movements, receipt persistence, and submission-key idempotency remain authoritative. |
| Derived debt and reports | Customer debt remains completed-sale outstanding less repayments; reports remain read-only reconciliations. |
| Safeguards | Input validation, opaque select/dialog surfaces, keyboard access, visible focus, accessibility announcements, restore confirmation, and integrity audit remain required. |

## 3. Screens and components proposed for change

| Area | Proposed UI/UX change | Business behavior that must not change |
| --- | --- | --- |
| `AppShell` and routes | Rename **Today** to **Home** in the visible navigation. Use the five prototype-inspired primary destinations. Keep **Business** and **Backup** available through visible contextual utility access; do not remove their routes. | Local status, skip link, route announcements, keyboard navigation, and access to backup/business settings. |
| `StageHome` | Replace feature-like editorial blocks with an at-a-glance operational dashboard: today’s completed sales, money received, customer debt, low stock, quick actions, recent local receipts. | Every value remains derived from saved local data, never mocked. |
| `SalesPage` | Introduce a product-card picker, search/category filtering, persistent cart summary, and a checkout review sheet. | Stock validation, named-customer requirement for debt, part-payment/credit semantics, one-time completion, receipt persistence, and error recovery. |
| Checkout summary | Present **Sale total**, **Paid now**, **Remaining**, **payment method**, **customer**, and a clear completed/saving/error state before the owner confirms. | Amount parsing, payment storage, debt calculation, idempotency, and atomic transaction boundaries. |
| `CustomersPage` | Add a first-level All / Owing segment, debt-first scan order, total owing summary, and a concise customer detail header. | Archived customer behavior, derived balances, repayment flow, activities, and current data model. |
| `InventoryPage` | Use compact searchable product rows/cards, explicit low-stock state, category filter, and persistent Archived records access. Stock change opens a purpose-labelled adjustment control rather than directly changing a value. | Append-only movements, adjustment reasons, archive persistence, active/archived separation, and history. |
| `ReportsPage` | Present sales, inventory, debt, and payment summaries as simple labelled tabs/segments. | Read-only calculations and existing report boundaries. |
| `BusinessSetup` and `BackupPage` | Reduce visual ceremony, group fields/tasks more compactly, retain clearly numbered owner actions. | Profile validation, opaque select popovers, destructive restore confirmation, integrity review, and backup format. |
| Shared select/dialog styles | Standardize opaque elevated surfaces, solid backgrounds, z-index, focus, mobile width, and dismissal behavior. | Accessible Radix semantics and existing control values. |

## 4. Sales and partial-payment safeguard plan

The prototype is useful for its cart-to-checkout progression, but it is insufficient on part payment. The production checkout will explicitly show the financial consequence before the owner reaches **Complete sale**:

| Checkout state | Required visible summary |
| --- | --- |
| Paid in full | Total, amount received equal to total, method, and customer/walk-in identity. |
| Part payment | Total, **Paid now**, **Remaining**, selected named customer, method, and a “part payment” label. |
| Credit / pay later | Total, paid now of zero, remaining equal to total, selected named customer, and a “credit” label. |
| Saving or failure | A clear busy label only during active submission; success leaves the busy state and shows a receipt/saved confirmation; failure returns to an actionable checkout state. |

The existing Stage 5/6 completion and duplicate-prevention fixes are retained. If the owner-reported partial/credit, completion, archive, or opaque-overlay failures are reproduced during implementation, they are release-blocking workflow defects and will be fixed—not hidden behind a new visual treatment. The redesigned interface will be tested against the actual browser flow, not only unit/service tests.

## 5. Implementation sequence after approval

1. **Shared mobile shell and reusable controls.** Update visible labels, five-primary-destination navigation, contextual access to Business/Backup, top status, and shared opaque overlays. Preserve routes and run accessibility/navigation tests.
2. **Sales and checkout.** Rebuild the visual flow around product discovery, cart review, and explicit full/partial/credit payment summary. Manually verify the real save, recovery, receipt, debt, stock, and duplicate-prevention path before moving on.
3. **Home/dashboard.** Recompose the existing derived data into the compact home snapshot. No calculation service changes unless a defect is proven.
4. **Customers.** Apply the owing-first hierarchy while keeping derived debt, repayment, activities, and archive safeguards.
5. **Stock/inventory.** Apply the scan-friendly product view, low-stock hierarchy, and unmistakable active/archived switch while retaining movement and adjustment controls.
6. **Reports.** Simplify the presentation through task-oriented segments without changing reconciled calculations or scope boundaries.
7. **Business setup and backup.** Refine forms and owner utility screens without changing validation, restore, or integrity behaviors.
8. **Responsive, accessibility, and full regression.** Complete mobile, touch, keyboard, browser, offline/PWA, backup, integrity, route, and production checks.

## 6. Tests to add or update

The redesign will update selector-sensitive tests and add focused coverage for the visible owner flows below.

| Test area | Required regression coverage |
| --- | --- |
| Navigation | Five primary destinations, contextual Business/Backup access, focus order, route announcement, and mobile bottom navigation. |
| Sales UI | Product search/category selection, cart quantity changes, full/part/credit summary visibility, named-customer enforcement, completing state recovery, duplicate-click prevention, receipt persistence, stock/customer/payment updates exactly once. |
| Customers | All/Owing filter, total debt summary, derived ordering/amounts, repayment and archive visibility. |
| Stock | Search/category filter, low-stock label, adjustment route creating movement history, active/archived switch persistence. |
| Overlays | Country/currency and all shared select/dialog/sheet surfaces have opaque backgrounds, correct focus, readable mobile layout, and working dismissal. |
| End-to-end resilience | Existing offline/reopen, backup/restore, integrity, production PWA, route, and keyboard validators must continue to pass; update their selectors only when markup changes. |

## 7. Scope and affected stages

This is primarily a **UI/UX refinement of the current application across completed Stages 2–10**. It may include narrowly scoped repairs for a confirmed existing user-facing workflow failure. It does not add cloud sync, accounts, backend services, AI, new financial rules, refunds, supplier features, pricing, language expansion, or unapproved data fields. It will not start a Stage 13.

## Approval requested

The owner approved this plan with the safeguards above. Implementation will proceed in the guarded sequence above and finish with the same human-approval discipline.
