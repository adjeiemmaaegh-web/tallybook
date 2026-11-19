# Tallybook Connected Commerce — UI/UX interface design & wireframes
**Status:** Proposed screens and behavior; not implemented. **Date:** 2026-11-18.  
**Equal treatment:** all five product tracks have a merchant entrypoint, customer/partner journey if applicable, state matrix, mobile and accessibility acceptance.

## 1. Interaction system & design language
**Do not reinvent Tallybook's current design system.** Inspect `client/src/pages/SharedShopPage.tsx`, `client/src/pages/sharedShop.css`, `client/src/cloud/SharedShopOwnerDashboard.tsx`, `client/src/pages/PublicShopOrderPage.tsx`, existing Radix/shadcn primitives and mobile tests. Respect established typography/color tokens, contrast, focus rings and role-based navigation. Introduce only reusable layout, cards, filter chips, status labels and confirmation dialogs as extensions.

- Navigation: preserve Sales, Stock, Purchasing, Reports and Account. Add one accessible **Growth** destination with FIVE equally visible sub-tabs `Discover` · `Network` · `Supply` · `Clementia` · `Passport`. Use 5-tab horizontal scrolling with visible overflow on 320px rather than silently hiding modules.
- Do not show merchant-only navigation to consumers; public search, receipt and claim views need minimal standalone mobile shell.
- Shared UI tokens: spacing 4/8/12/16/24, 44px minimum tap target, readable normal text ≥16px on forms, responsive content max width, high contrast, no information conveyed by color only.
- **Status vocabulary** always unambiguous: `Draft`, `Request sent`, `Merchant reviewing`, `Accepted`, `Availability unconfirmed`, `Reservation confirmed`, `Payment unverified`, `Paid (provider confirmed)`, `Fulfilled`, `Refund requested`, `Refund posted`; only show states supported by authoritative events.
- Accessibility: semantics and labels, focus restoration after dialog, meaningful error summary, error-inline fields, announce asynchronous transitions using `aria-live`, never trap keyboard in nonmodal panels, reduced-motion support. Do not reproduce screenshots or competitor trademarks.
- Each screen: empty/loading/error/success/no-internet/permission-denied/revoked/stale states designed, not just happy-path mockups.

## 2. Shared merchant IA — proposed
```text
TALLYBOOK | Shop switcher | Sync/Offline state | Account
Existing: Home  Sales  Stock  Customers  Purchasing  Reports
Growth:
  [ Discover ] [ Network ] [ Supply ] [ Clementia ] [ Passport ]
  Each: Overview | Queue / Actions | History | Settings / Opt-in
Mobile: compact top bar + tab-scroll + one primary action + bottom sticky action
```
A merchant not enrolled sees an understandable opt-in card, preview, scope of data sharing and a "Not now" exit. No discoverability or public data transfer until owner consent. Staff see only permitted queue views, not owner enrollment/configuration.

## 3. CC-D Discover screens
**Merchant**: `Growth > Discover > Publish offers` with chosen shop, address/area, categories, select products, public price, availability accuracy notice, privacy preview, Publish button, live listings and requests inbox. **Public**: `Find nearby products`, default location selector (NOT GPS), search + filters, store results, listing detail, request form, tracking token.

```text
┌─────────────────────────────────────┐
│ Discover                   [Area ▾] │
│ [ Search item or shop...          ]  │
│ [Category ▾] [Price ▾] [Open hours]  │
│                                     │
│ Item name                GHS 00.00  │
│ Store • Area • Updated 18 min ago  │
│ [Availability unconfirmed]          │
│ [View terms]         [Request item] │
│                                     │
│ Requests are not purchases/payments │
└─────────────────────────────────────┘
```
**Key interactions**: public results use server-verified publication only; accept empty query with category filter; list shows timestamp, not fabricated live stock; buyer's request submit returns `Request received`, never `Order paid`. Merchant can confirm/decline and share a verified next step.

## 4. CC-N Business Network screens
**Merchant**: `Growth > Network`, enroll, invitations, "Find a partner for this shortage" draft, list nearby opt-in partners, quote/terms comparison, agree, handoff tracking. **Partner**: incoming request queue, respond with quantity/price/expiry; only approved info.

```text
┌─────────────────────────────────────┐
│ Network              [Participation]│
│ Short on: Product A • 8 units       │
│ [Draft request to partner shops]    │
│                                     │
│ Offer 1: Partner (verified status)  │
│ 6 units • Price • Pickup 1 day      │
│ Expires at...                       │
│ [Review split of responsibilities]  │
│ [Decline]      [Send agreement]     │
│                                     │
│ Customer details hidden until agreed│
└─────────────────────────────────────┘
```
**Key interactions**: two explicit acceptances of immutable terms; responsibility matrix prominent (payment receiver, customer relationship, delivery, returns, commissions); dispute and cancellation timeline; no deceptive order-complete screen.

## 5. CC-S Supply screens
**Merchant**: `Growth > Supply`, replenishment draft and RFQ form, quote compare, landed-cost details, optional pooled interest and PO authorization. **Supplier**: restricted RFQ inbox and quote builder, fulfillment updates.

```text
┌─────────────────────────────────────┐
│ Supply                 [New RFQ +]  │
│ Product A • 30 cartons • Kumasi     │
│ Supplier A     GHS 0,000 all-in      │
│ Unit | Freight | Tax | MOQ | ETA    │
│ Supplier B     GHS 0,000 all-in      │
│ [Not comparable: packaging differs] │
│ [Show assumptions] [View quotes]    │
│ [Preview purchase order]            │
└─────────────────────────────────────┘
```
**Key interactions**: compare only same unit and comparable delivery terms; toggle ranking by total cost/lead time explicitly; never auto-submit purchase on "reorder suggested"; show supplier reliability evidence, no unsourced stars.

## 6. CC-C Clementia 2.0 screens
**Merchant**: `Growth > Clementia` has "Opportunities requiring review" summary, insight cards with traceable evidence, suggested action preview, reject/snooze. Existing assistant remains available, not replaced.

```text
┌─────────────────────────────────────┐
│ Clementia   Insights updated 09:10 │
│ Possible stockout next week         │
│ Product A • based on last 28 days   │
│ Confidence: limited / assumptions   │
│ [See source figures]                │
│ Recommended: draft RFQ for 24 units │
│ [Dismiss]     [Preview draft]       │
│                                     │
│ No stock or funds will move now     │
└─────────────────────────────────────┘
```
**Key interactions**: insight detail opens source data, last-sync/time, confidence and assumptions; action preview reads diffs + permissions; confirm creates existing verified operation or fails closed; stale data yields "Refresh before acting", never silent retry.

## 7. CC-P Passport screens
**Consumer**: guest receipt link → preview limited proof → opt in to keep, create/sign into account optionally, receipts list, warranty/return request, loyalty status and privacy settings. **Merchant**: `Growth > Passport`, configure terms (optional), claims inbox, verified merchant reward management.

```text
┌─────────────────────────────────────┐
│ Passport          [Privacy settings]│
│ Your receipts (opted in only)       │
│ Shop A    12 Nov   GHS 00.00        │
│ [View proof]   [Return / warranty]  │
│                                     │
│ Shop B rewards • 2 of 5 visits     │
│ Non-cash store perks only           │
│ [How this works] [Opt out]          │
└─────────────────────────────────────┘
```
**Key interactions**: if sale unverified, say "Receipt not available"; no synthetic refund promise; a return request is not a completed refund; consumer may export and revoke optional sharing. Show loyalty policy, expiry, dispute channel and merchant ownership.

## 8. Navigation, actions and states — all five equal
| Track | Owner primary action | Consumer/partner primary action | Empty state | Offline behavior |
|---|---|---|---|---|
| Discover | Publish selected offers | Search/request | "No published offers in this area" | cached listing labeled stale; request disabled until connection |
| Network | Draft partner request | Partner responds | "No partner responses yet" | draft only; no accepted terms until server confirmation |
| Supply | Create RFQ | Supplier sends quote | "No supplier quotes yet" | draft only; revalidate terms on reconnect |
| Clementia | Review recommendation | N/A — owner/staff permissions | "No actionable insights with verified data" | deterministic local help clearly scoped; no cloud-derived live claim |
| Passport | Configure claim/reward terms | Access/add receipt | "No receipts added" | locally viewed copy must not imply authoritative new refund/reward |

## 9. Three key customer journeys
**First merchant session:** owner logs in → existing ledger unchanged → Growth → independently choose any of five programs → see data-sharing preview → owner opt-in → publish/submit proposal → review eventual verified outcome. Preserve existing employee POS focus.

**First shopper session:** WhatsApp/share/search entry → public responsive web view → item detail + timestamp/terms → optional request → status link → if actual sale finalized, optional Passport receipt. No forced app download, account or GPS.

**First supplier/partner:** restricted invitation → provider/business verification status → scoped request → explicit quote/terms with expiry → merchant decides → server records signed decision → external physical fulfillment verified separately.

## 10. Responsive/visual QA checklist
- 320, 360, 390, 768, 1024 and 1440px screenshots for all FIVE, both light/dark if existing themes support.
- 200% zoom, large text, English first, optional locale labels; numeric formatting Ghana cedi with unambiguous units.
- Empty, no-shop, owner, staff, shopper, supplier, signed-out, revoked share, network outage, stale quote, duplicate submit, denied permission and retry cases.
- Mobile performance: minimal JS for public listing/receipt routes; use native skeleton with text alternative; no infinite loading.
- Accessibility/manual: keyboard-only, TalkBack or comparable screen reader, invalid submission, accessible dialogs, visible focus, proper reduced-motion.
- UX approval requires working prototypes in addition to these **text wireframes**; this Markdown is the interface specification, not finished Figma/visual assets.

[Master](00_START_HERE_MASTER_SPEC.md) · [PRD](01_PRODUCT_REQUIREMENTS_PRD.md) · [Architecture](02_TECHNICAL_ARCHITECTURE.md) · [Roadmap](04_IMPLEMENTATION_ROADMAP_AGENT_PLAYBOOK.md)
