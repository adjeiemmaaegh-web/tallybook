# Tallybook V19 — Cash Return Read-Only Review Continuation (11 October 2026)

**Decision: NO-GO / INCOMPLETE.** Continued from exact `TALLYBOOK_V19_CASH_RETURN_CONTINUATION_2026-10-11_SOURCE.zip` (SHA-256 `0346e82c080156b487823098c9b4326b3aa03b8d44aab766877e20280ac8d058`), not the prior partial FIFO archive. All prior files and schemas preserved.

## Implemented, scope

Added a **read-only** cash-return review in Sales history. The review displays saved receipt, count of earlier recorded returns, remaining quantities for the narrow fully paid, no-customer cash lane and a provisional original-invoice amount/tax/discount breakdown for one selected line. It does not change balances, issue money, publish receipts, create a new return or call the actual posting service.

Read-side reconciliation enforces company isolation within a Dexie read transaction, requires exact one receipt and original cash tender, rejects full reversals, credit/customer/wallet, unsupported or missing stock/FIFO, batch/service and invalid previous return evidence. Original tax snapshot is checked for each quote. A second final financial transaction validation remains essential; review is NOT approval or permission to refund. User-facing screen explicitly warns that the preview cannot be used to hand out cash.

## Evidence and limitations

- Linux Node22/OpenSSL full native QA **318/318 passed, zero skipped/failures**, including **8 new pure native review tests**. Output: `artifacts/continuation-2026-10-11-cash-return-review/native-final.log`.
- Separate local mock gateway **4/4 passed**; no real payment action.
- Changed TS/TSX files syntax parsed, but semantic `tsc --noEmit` **failed** (missing Node and Vite type definitions); pnpm not installed.
- Client Dexie/Vitest tests **written but not executed**; build/browser/UI usability/keyboard/migration not run. This is an **implemented-unverified** increment.
- UI only reviews **one item per quote** and only new verified supported cash sales; no multi-line or mixed-tender quote. The service `recordConfirmedCashPartialReturn` stays unconnected to the UI pending owner policy and full client acceptance.
- Other payment providers, credit/customer debt, wallets, loyalty, services, batch, damaged-stock, tax unknowns, physical cash workflows and external integrations remain unsupported. No staging/payment/deployment authorized.

## Follow-up

Run pinned dependency install, full Vitest/semantic types/build/browser and schema-28 migration/interruption scenarios; resolve failures before enabling any refund action. Validate real staff permissions, receipt printing, cash drawer reconciliation and policy with owner. Continue global recovery and full authorization coverage.
