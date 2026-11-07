# Tallybook — Five-Stage Frontend-Only Upgrade Prototype

**Status: review-only interactive UI.** This directory implements the frontend visualization for the planned Stage A–E upgrade and takes inspiration from the **20 user-supplied Stockdey reference screenshots** (public welcome/navigation, sign-in, owner/employee onboarding, dashboard, POS, sales, inventory, products, online orders, purchases, stock take, transfers and sidebar). It does not copy Stockdey logos, text or backend claims.

## Open the preview

Open `index.html` directly in Chrome, Edge, Firefox or Safari. No npm, server, registration, connection or installation is required. For a live local web server, run `python -m http.server 8080` inside this folder and browse to `http://localhost:8080/`.

The view state switcher at the top changes **Sample data**, **Screenshot empty state**, **Offline**, **Loading**, and **Sync error**. Navigate with the sidebar or mobile hamburger menu. Use **All stages** and **Visual QA** for all planned upgrade surfaces.

## Scope

- Stage A: mobile/desktop shell, design tokens, responsive navigation, structured store selection, state previews.
- Stage B: offline/sync state screens, protected queue illustrations, receipt/reconciliation messaging, staff and refund-policy interfaces.
- Stage C: welcome/sign-in, role selection, 2-step owner setup, employee ID, success, dashboard, POS, sales and sample checkout.
- Stage D: products, inventory, online orders, purchases, quotations, stock take, transfers, customers, expenses, reports, accounting, receipts, team, settings and profile.
- Stage E: visual QA screen, simulated loading/error/offline/empty-state switcher, accessible labels and responsiveness checklist.

## Safety boundary

All data is in JavaScript memory, populated from seed fixtures. Any form or button that appears to save, create, check out, change a transfer or accept an order changes **sample UI state only**. Refresh discards all changes. There are **no API requests, no localStorage/IndexedDB writes, no authentication, no payment operations, and no effects on the actual Tallybook database or production site**. Examples are labelled as demonstrations. Demo CSV export is generated client-side.

This is not a drop-in replacement for existing application routes or an accepted production release. Stage B financial/security engineering remains separately tracked on the existing protected branch. The connected frontend can be integrated later after explicit review.

## Files

- `index.html` — semantic HTML entry point.
- `styles.css` — responsive Stockdey-reference-inspired visual system, retaining Tallybook branding.
- `app.js` — self-contained no-dependency UI, all routes, local prototype interactions.
- `visual/` — screenshots from offline verification, if generated.

## Acceptance for this prototype

- Open at mobile 390×844 and desktop 1440×900, navigate across all screens, verify menu/store, empty states, modal forms and POS sample checkout.
- Confirm accessible focus styles and labels, Escape dialog close, role and owner steps, no reliance on network.
- Verify no unexpected external requests or persistent financial-data writes.
- Compare mobile screenshot shapes to originals: rounded white cards, deep-teal hero, bold serif heading, segmented chips, clear empty states and bottom-aligned mobile workflow emphasis.
