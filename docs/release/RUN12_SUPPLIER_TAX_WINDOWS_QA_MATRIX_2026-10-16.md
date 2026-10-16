# Tallybook V19 Run 12 — Supplier payables and original-sale tax acceptance matrix

**Date:** 2026-10-16. **Status:** AUTHORING COMPLETE / UNEXECUTED. This document describes checks for an isolated disposable local test profile; it does not authorize a payment, supplier transaction, customer refund, tax filing, Supabase migration, cloud sync, staging, production deployment or merge into `main`.

## Test environment and evidence

Use pinned Node 24.19.0, working pnpm dependencies and a sample-only checkout at the exact final Run 12 head. Complete `scripts/RUN12_WINDOWS_READONLY_QA.cmd` and separately the full project native/client suite, semantic TypeScript, Vite and supported real browser tests. Record source SHA and fixture SHA, OS/date/time zone, Chromium/Edge/Firefox version, 8 GB CPU-only Windows memory/latency, staff identity/shift, two company IDs and test restore digests. Never install or run against the owner's live site storage or accounts. Source-level V8 mocks are insufficient for real crash/payment/stock/tax evidence.

## Supplier recognition, manual settlement and cash reconciliation

| Synthetic scenario | Required observed result and evidence |
| --- | --- |
| Purchase receipt GHS 6.00 without recognition | Supplier unpaid status **UNKNOWN**, not assumed paid or zero liability |
| Owner acknowledges whole purchase amount unpaid | Exactly one explicit recognition linked to original supplier, purchase, GHS currency and timestamp |
| GHS 6.00 recognized, GHS 2.00 manually paid, GHS 1.00 supplier credit | Outstanding GHS 3.00; payments are **manual evidence**, credit note is noncash |
| Repeated identical submission key and exact terms | Existing entry returned once; no duplicated money, liability, inventory or audit |
| Repeated key with different amount/method/reference | Rejected without a second supplier event |
| Partial payment exceeding remaining recognized debt | Rejected before any write; no negative balance or cross-invoice offset |
| Payment or recognition predates immutable original purchase posting | Refuse new posting and reject tampered restored histories |
| Earlier recognized supplier already fully settled | Further payment or credit rejected |
| Orphan purchase supplier, archived-but-retained supplier, different-company supplier | Orphans/foreign refs fail; retained archived original is still readable, no cross-tenant mutation |
| Supplier entry tied to another purchase's supplier ID or currency | Reject before report or restore acceptance |
| GHS company with older legitimate USD purchase payable | Report USD separately, no implicit FX or summing USD plus GHS |
| GHS company creates NEW purchase or expense denominated USD | Reject inside originating financial write transaction (no FX) |
| Original GHS purchase/expense retried AFTER a currency setting change | Exact same immutable submission intent acknowledged without new write; a new stale-GHS posting rejected |
| Supplier credit without external reference | Count as local noncash evidence with missing-document warning, never as provider/bank-confirmed payment |
| Supplier payment without external reference | Count as manually attested unreferenced payment, not proof of settlement at a bank |
| Supplier payment and operating expense represent same actual payout | Display **separate streams** and conspicuous double-entry/overlap disclaimer; do not certify combined net |
| Expense previously recorded with missing or foreign original currency | Preserve portable history and flag; do not silently convert into current-currency totals |
| Concurrent supplier settlement tabs on same invoice, same/different submission keys | Web Locks + Dexie must prevent duplicate and overpaid invoices |
| Staff role revoked, cashier without permission, inactive shift or selected company switched mid-post | Atomic rejection; no supplier event or staff audit left half committed |
| IndexedDB quota or fake IO failure during settlement audit or insertion | No half-written payable/payment record or incorrect outstanding debt |
| 10k synthetic invoices/settlement rows | Compare indexed purchase lookup and in-place grouped replay to independent sums; measure CPU-only Windows responsiveness |

## Sales tax, currency and reporting

| Synthetic scenario | Required observed result and evidence |
| --- | --- |
| New company with no supplied tax policy | Checkout records explicit tax **OFF**; no rate, registration, exemption or liability invented |
| Owner-configured disabled single-rate tax | Invoice stores original disabled configuration and no tax charged |
| Registered 12.5% exclusive tax, discount applied before tax | Exact integer half-up calculation, matching full invoice and saved policy |
| Registered 12.5% inclusive tax | Extract saved tax portion using original inclusive total and exact integer rounding |
| Owner later edits active tax rate | Original saved sale configuration, receipt and signed reversal remain unchanged |
| New USD sale attempted in a GHS company | Reject before posting cash, inventory, tax and customer credit |
| Saved ON tax configuration changed to OFF without rewriting tax | Financial report and backup validation refuse inconsistent original invoice |
| Saved tax label, rate, registration status, base, discount or total altered | Reject before published verified tax or portable restore |
| Earlier pre-Run 12 sale has no original tax configuration | Preserve it and count **historical tax configuration unverified**, not auto-classify tax-free |
| Supplier settlements, operating expenses and revenue reported for one period | Supplier outflows are separate from expenses; no silently mixed currencies or statutory profit claim |
| Existing cash partial refund with saved original tax and policy | Return original tax portion and stock FIFO layer accurately; no current tax-rate substitution |
| Refund under Run 11 no-refunds company | Still prohibited; tax changes do not override company return policy |
| Zero rate, unknown registration, multiple rates, exemption or compound levies | Fail closed or expose unsupported scope, never assume jurisdiction-specific tax filing compliance |
| Tax collection and liability report | Present recorded invoice tax after signed corrections; do not imply actual tax authority payment or legal return filing |

## Mandatory reviewers' test/decision records

Capture **60 focused Node-style Run 12 cases** (20 supplier + 19 tax + 21 static wiring) and **16 authored saved-IndexedDB Vitest cases** with actual executable environment outputs and immutable source hash. Rerun the earlier Run 7–11 cash/credit/inventory/return/tax/supplier/backup suites, full `pnpm test`, `pnpm check`, build, Playwright, actual Windows multi-tab and crash/restore. Test both first-install and old local backups, including missing historical currency/tax settings. A high-risk source change requires a fresh **full** exact-head rerun, not a re-used prior green log.

The app cannot independently confirm manual vendor transfers against banks/Mobile Money, match expense-vendor duplicates, calculate VAT input credits or statutory tax payable, infer historical missing denominations, or resolve cross-company live database forensics. These limitations are **release blockers / separately governed extensions**, not silently completed features. The historical 47-issue / 82-acceptance register is not advanced without witnessed evidence.

**Run 12 full source increment != release acceptance. Runs 2–12 NOT PASSED; V19 commercial NO-GO.**
