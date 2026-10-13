# Tallybook V8 Stage 1 Build 12 — receipt printing and recovery UX

## Changes
- Changed the post-sale Print action to **Open to print**: the saved receipt is opened before printing; the actual Print control within the receipt dialog runs in the direct user gesture. This avoids an unreliable print popup invoked asynchronously before React renders the dialog.
- Added **Reprint** next to existing saved receipts in Recent Sales. No financial service is called by either print action.
- Added a readiness guard that refuses to open an incomplete receipt and refreshes saved records instead.
- Constrained receipt content to 80 mm in print CSS without globally modifying @page, so end-of-day reports are unaffected.

## Deferred release checks
- Vitest and TypeScript full check; project dependencies are absent.
- Run UI integration in real browsers, offline reload/recovery, iPhone/Android printing and actual 58/80 mm thermal devices.
- Production build and all financial transaction regression tests.
These must be finished in Work before production when the entire project is completed.

## Limits
- No direct Bluetooth/USB printer protocol, automatic paper-cut, or guaranteed printed-paper acknowledgment.
- Print requires a browser that supports it and a configured device printer.
