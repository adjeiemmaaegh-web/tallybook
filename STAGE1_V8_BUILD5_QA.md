# Tallybook V8 Stage 1 — Build 5

## Implemented
- Device-local pending checkout journal stores an immutable checkout request and idempotency key **before** writing ledger records.
- If a page reloads or checkout times out, the cashier sees a recovery action instead of an unlocked replacement checkout.
- Recovery checks the saved sale and receipt, then safely replays the **same original request and submission key** through the existing idempotent sales service; no new key is generated.
- Pending intent is scoped to the active company and cleared only after receipt recovery/confirmed successful completion.
- Browser print adapter waits for the receipt dialog render before opening standard OS print UI, which can target printers installed on the device (including configured thermal printers).
- Regression tests for journal persistence, isolation, immutable keys, and invalid journal handling.

## Limitations and risks
- The recovery journal uses device localStorage; clearing site data loses it. Existing committed receipts remain in IndexedDB if that storage survives.
- A malformed/tampered journal is ignored; operator must inspect sales history. A company may have at most one pending checkout on a device.
- If storage cannot be written, new checkout is refused to avoid unsafe retries.
- Standard browser print does **not** mean direct Bluetooth ESC/POS support. Printer driver, page-size setup, and actual physical printing are unverified.
- No claims of full tests, browser QA, device printer certification, or production readiness without running those checks.
