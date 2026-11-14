# Tallybook — strict re-audit of 16 previously marked "Exists" stages
Date: 2026-11-14. Source: GitHub main commit `cd475e799011c027ebee3f09e0a67aa6c95ded6e` and production project metadata, read-only.

## What "verified" does and does not mean
- **Code confirmed:** a matching implemented route/UI and data path were inspected, not just a filename.
- **Automated checks:** matching unit, component, browser or native tests were inspected. Most cloud services in these tests are mocked. Browser results do not imply real Supabase sign-ins, bank settlements, or customer sales succeeded.
- **Production schema confirmed:** Vercel production `VITE_SUPABASE_URL` points to the connected Tallybook Supabase project, not the older V19 Sync Test project. The production project has the corresponding tables with RLS and the public shop RPC routers. No business rows were read, no customer data was accessed and no writes were made.
- **Real-world accepted:** requires signed-in owner/attendant journeys, real network, permissions, source-of-truth records, offline reconnection, receipt/stock verification and owner signoff. No stage below meets this full evidence bar yet.
- Stage 21 repeats 2, and stage 24 repeats 6. There are **14 unique features**, not 16 independent implementations.

| Photo stage | Feature | Verified source | Automated evidence / test | Remaining gap |
|---|---|---|---|---|
| 1 | Account dropdown | `SharedShopAccountMenu.tsx`, `sharedDeviceHandover.ts` | `SharedShopAccountMenu.test.tsx` 3 cases | Real device identity switch and unsent cart handover |
| 2 | Store and currency setup — **partial parity** | `SharedShopPage.tsx:SetupLedger`, `shopClient.ts` setupLedger/saveStore, `currencies.ts` | `SharedShopOnboarding.test.tsx` first-run and retry cases | EUR shown in reference is absent from Tallybook's permitted selector. Real new-owner setup and server-confirmed reentry still unverified |
| 5 | Owner profile | `CloudBusinessPanel.tsx` identity/membership/profile | `CloudBusinessPanel.test.tsx` 11 cases | Real provider profile save and browser session |
| 6 | Role selection | `CloudBusinessPanel.tsx` create/join chooser | `CloudBusinessPanel.test.tsx` chooser, role, membership cases | Real invitation/owner role acceptance |
| 8 | Sign-in | `GoogleSignInPage.tsx`, `useRun4CloudSession.ts` | `GoogleSignInPage.test.tsx` 8 cases; auth browser negative tests | Real email confirmation, Google OAuth and reset |
| 9 | Local workspace sidebar | `AppShell.tsx`, `App.tsx` routes | `AppShell.test.tsx` and local browser acceptance | Real device keyboard/touch route navigation |
| 10 | Inter-store transfers | `SharedShopTransfers.tsx`, production `tallybook_shop_ops` | `SharedShopTransfers.test.tsx` 4 cases | Actual two-store dispatch/receipt and inventory reconciliation |
| 12 | Purchasing / suppliers | `SharedShopPurchasingPanel.tsx`, `shopPurchasing.ts`, production tables/RPC | Supplier payable model tests; new UI guard tests in this QA branch | Real supplier order, partial receiving, settlement ledger and audit |
| 13 | Online orders — **partial parity** | `SharedShopOrders.tsx`, production `shop_online_orders`/lines | UI creation case and new accept/no-false-sale case in this QA branch | The UI explicitly records orders received outside Tallybook; a live public checkout/order submission integration remains unverified |
| 15 | Inventory | `SharedShopPage.tsx:StockPanel`, `inventoryStats.ts`, production stock tables | `SharedShopProducts.test.tsx` and `inventoryStats.test.ts` | Real scans, valuation/cost, stock lock and concurrent adjustments |
| 16 | Sales transactions | `SharedShopPage.tsx:SalesPanel`, `searchShopSales` | `SharedShopSalesFilters.test.tsx` 7 cases, `searchShopSales.test.ts` 4 cases | Real server pagination, refunds/receipts, attribution |
| 17 | POS | `SharedShopPage.tsx:SellPanel`, `shopOutbox.ts` | `SharedShopPage.test.tsx`, `SharedShopScan.test.tsx`, `SharedShopParking.test.tsx` | Physical mobile POS offline replay, tender/receipt and stock reconciliation |
| 18 | Owner dashboard | `SharedShopOwnerDashboard.tsx` server sales and supplier reads | New direct tests in this QA branch plus owner desktop browser test | Live totals and accuracy of credit/payables; P&L explicitly unverified |
| 21 | Store/currency repeat — **partial parity** | Same as stage 2 | Inherits stage 2 evidence | Missing EUR; not independent |
| 24 | Role selection repeat | Same as stage 6 | Inherits stage 6 evidence | Not independent |
| 29 | Marketing hero | `TallybookWelcome.tsx`, routes in `App.tsx` | New hero link tests; `qa/shop-public-entry.spec.mjs` two desktop/mobile browser tests | Public domain and accurate operational claims; no fabricated app-store or multi-store-sync promises |

## Corrected classifications
Of the prior 16 “Exists” stages, **13 remain source-level Exists**, while **3 are now Partial**: 2 and its duplicate 21 (EUR missing from currency setup) and 13 (manual external-order entry does not prove public checkout). Across all 29 references the corrected count is **13 Exists, 13 Partial, 3 Enhanced**. This does not imply all 13 source-level paths are live accepted. A previously green mocked UI test does not substitute for real provider/network tests.

## Independent CI evidence and QA regression found
The merged PR-head Node24 release pipeline completed with **1108 native/server tests passed**, **1487 client tests passed**, browser suite 9/9 passed and auth suite 6/6 passed. It **failed 4/4 320px and 360px phone-layout cases** because `qa/shop-phone-layout.spec.mjs` still searched for the old always-visible `Sell` tab. The new drawer deliberately hides it and exposes navigation through the `Menu` button. The earlier claim that the release gate was green is incorrect.

This QA branch updates those browser tests to open the drawer, search only authorized sections, test Escape/focus return, navigate each permitted tab and retain all overflow/input-size checks. It also introduces focused dashboard, purchasing, online-order and public-hero unit tests. A failure on the new branch must remain a failure until its own CI proves otherwise.

## Remaining cross-cutting acceptance
No actual sale, transfer, supplier settlement, owner OAuth sign-in, data sync or cloud stock count was performed against live production data. No schema modification, payment or deployment is authorized by this audit. The older Sync Test project lacks several production shop tables and RPCs and cannot be substituted for production E2E verification. Deployment remained separately blocked by a Vercel API daily quota at the time of this audit.
