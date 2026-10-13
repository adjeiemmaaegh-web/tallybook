# Stage 3 — V10 Financial Intelligence (parallel branch)

This branch is isolated from Manus's Stage 2 work. Do NOT merge its copy of V9 into Manus's completed V9; cherry-pick only Stage 3 reporting files after reconciling schemas.

Build 1 — Financial definitions and read-only calculation architecture: IMPLEMENTED, provisional.
Build 2 — Period filtering (today/week/month/quarter/year/custom) and saved sales trends: IMPLEMENTED.
Build 3 — Sales collections, debt collections, recorded expenses, and current customer receivables: IMPLEMENTED.
Build 4 — Management dashboard and expense categories: IMPLEMENTED (read-only local UI).
Build 5 — Downloadable management CSV and printable PDF via browser: IMPLEMENTED CSV download and browser print/save PDF; device testing pending.
Build 6 — Historical COGS, gross profit, inventory valuation and supplier payables: BLOCKED BY STAGE 2 COST/TRANSACTION CONTRACT. No invented numbers permitted.
Build 7 — Jurisdiction-dependent tax summaries and reconciliation/release QA: TAX POLICY UNDECIDED; integration tests deferred.

## Accounting boundaries
- Revenue is net saved sales plus signed reversal amounts in the selected period, not money received.
- Collection is recorded sale payments plus debt repayments, adjusted by signed reversal cash amounts.
- Expenses are recorded expenses with their business expense date (not transaction creation timestamp).
- 'Collections minus expenses' is NOT true cash flow or net profit: purchase cash outflows and supplier settlements may be absent.
- Current receivables are all-time customer sales outstanding adjusted for reversals and repayments; not period scoped.
- No profit, tax, historical COGS, or bank reconciliation claims without authoritative inputs.

## Deferred QA
Install dependencies, run `npm run check`, `npm test`, `npm run build`, browser reporting tests, custom-period DST tests, report reconciliation after full V9 merge, printable PDF testing.
