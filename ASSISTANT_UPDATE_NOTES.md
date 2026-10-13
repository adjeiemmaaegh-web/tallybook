# Assistant update — notes

## What changed, by request
1. **Add customer / supplier / category / product** — through the app's own services (`createCustomer`, `createSupplier`, `createCategory`, `createProduct`), with a preview and a confirm button first. Asks for what the app requires (customers need a phone number; products need a selling price). Exact duplicates are never created; similar names ask first.
2. **Stock count** — "I counted 25 eggs but we have 37" previews, then corrects stock through `adjustStock` (updates the product *and* writes a `correction` entry). Refuses to apply a preview if stock moved in the meantime.
3. **Smart recovery** — not enough stock, out of stock, unknown customer/product/supplier, discounts, fractional quantities, overpayments: each offers working choices (tappable chips that really continue the request). Adding a missing customer/product/supplier resumes the original sale or payment.
4. **Period filters** — this month, last month, this year, last year, last N days (plus today, yesterday, a date, last 7 days, all) for best-sellers, customers who bought, top debtors and sales totals. Best-sellers now rank *products* (by quantity, then revenue); before, they listed individual sales.
5. **Voice** — fixed (see below).

## Why it didn't work before (root causes)
- An older "unsupported" rule outranked the new create/count intents, so they were almost never reached.
- Records were written straight to the tables without ids or required fields.
- Category creation wrote nothing; stock counts never updated the product; period filtering had been removed.
- Voice used the wrong property (`language`, not `lang`), threw away low-confidence results and never showed errors.

## Things to know
- **Voice needs the browser's speech service**: Chrome, Edge, Safari; it needs an internet connection and may be blocked in some installed-app modes. Firefox has no support (the button is hidden). It was tested against a faithful *simulated* speech engine, **not a real microphone** — please try it on your device. Confident transcripts (≥ 80%) are sent automatically (any transaction still needs Confirm); less certain ones wait in the box to be checked.
- "Top debtors this month" = credit given that month (the unpaid part of that month's sales), since a balance has no date. With no period it shows current balances.
- "Best-sellers" with no period now covers all saved records (it used to default to today); chips offer narrower periods.
- "Top customers" now means biggest spenders (it used to mean biggest debtors).
- Low-stock now includes products that are completely out of stock.
- New products start with a low-stock level of 0 (the app's own default); say "low stock at 5" to set it.
- "Last week" and "last quarter" are still not supported and ask for a supported period.
- Multi-line batch entry was not extended to the new create/count commands.

## Verification
`pnpm check` (only the old `receiptDetail.ts` error remains) · `pnpm test` 396 tests / 40 files · `pnpm build` OK.
New suites: `recordParsers`, `intentRouting`, `createRecords`, `stockCount`, `errorRecovery`, `periodQueries`, `AssistantPage.voice`.

## 2026-10-02 — Evaluation Harness and Business Insights

### Evaluation harness (#11)

Added a deterministic offline parser evaluation suite under `client/src/features/assistant/eval/`:

- 200 cases covering supported parser intents, casual wording, typos, missing punctuation, number words, alternate phrasing, and unrelated questions.
- 12 documented parser gaps are reported separately rather than silently counted as failures.
- Entity extraction checks are included alongside intent accuracy.
- Dangerous transaction classifications are detected separately and fail the suite when present.
- Evaluation uses a fixed date (`15 October 2026`) and has a baseline guard to prevent silent accuracy regressions.

Current measured baseline:

- Counted cases: 188
- Known gaps: 12
- Intent accuracy excluding known gaps: 100%
- Entity accuracy: 100% on checked entities
- Dangerous classifications: 0

### Business insights (#8, with templates)

Added `client/src/features/assistant/insights.ts` as a pure, read-only business-logic module. It calculates:

- This-month versus last-month sales comparison.
- Reorder estimates from the last 30 days of sales.
- Explicit out-of-stock, no-sales, limited-history, and sufficient-stock states.
- Slow-moving stocked products with no sales in the last 30 days.
- Deterministic wording templates for percentages, day singular/plural, empty results, insufficient history, and estimate disclosure.

No schema changes, transaction-writing changes, AI calls, or network requirements were introduced.

### Assistant integration

Added the read-only `INSIGHTS_QUERY` intent and routed these questions through the existing assistant dispatch:

- “Are sales up this month?”
- “How are sales compared with last month?”
- “What should I reorder?”
- “What are the slow movers?”

The route returns only values calculated from the active local database. Existing transaction and conversation-state behavior remains unchanged.

### Validation

- Focused insights/evaluation tests: pass
- `pnpm test`: one existing flaky failure remains in `assistant.test.ts` because the existing `nanoid(5)` receipt suffix can contain `-`, while that pre-existing assertion only permits `[A-Z0-9_]`; the isolated assistant suite passes.
- `pnpm build`: pass
- `pnpm check`: existing unrelated failure remains in `client/src/features/receipts/receiptDetail.ts` because `BusinessShareResult` is not exported by `businessSharing.ts`.
