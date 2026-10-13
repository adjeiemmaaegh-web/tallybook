# Phase 2 — conversation memory, multi-step requests, activity log, more phrasings

Added on top of `tallybook-assistant-phase1` (your project). Your own docs and features were left as they were; see "Where this touches your code" for the exact points of contact.

## What was added
1. **Conversation memory** (`conversation.ts`). "she paid 100", "and last month?", "what about Adwoa?", "how many of those are left". Only records the assistant really resolved are remembered, entries expire after 15 minutes (using the assistant's own clock), a complete sentence is never rewritten, a remembered customer is never added to a request that didn't mention them, and every follow-up carries a notice saying what it was taken to mean. It now feeds your existing `clearContext()` and the "Using recent context: …" line on the page, which previously had nothing to read (the old session memory never recorded anything).
2. **Multi-step requests.** The earlier batch feature did not work: line breaks were removed before detection (so extra lines were silently dropped), confirming did not save anything yet reported success, the Confirm button was routed to the single-transaction handler, and the preview only said "Ready". Rebuilt: lines, bullets, `;`, "then" and "and sell…" are split; every line is checked against the real records *in order* (two sales cannot share one stock, two payments cannot exceed the debt); the preview shows what each line will do; unrecognised or invalid lines are shown and excluded, never dropped; saving uses the same service calls as a single confirmation and stops at the first failure; a multi-line message that is not a clean batch records nothing and says so. The composer is now a multi-line box (Enter sends, Shift+Enter adds a line). Your saved aliases also apply to each line.
3. **Activity log** (`audit.ts`, database v13). What the assistant saved or failed to save, with the owner's words, the approved preview rows, the result and the record id (including your sale reversals). Ask "what did the assistant record today?". Device-local, kept out of backups, removed with its company, newest 1,000 per company, and it can never block or undo a save.
4. **More phrasings.** Several phrases were confidently misread and are fixed (e.g. "what is our outstanding with Kofi" was a customer balance; "how much did the shop earn last year" was a stock question), plus a product filter ("which customers bought eggs this month") and more everyday wording. Harness: 252 cases, 100% on the 242 counted, 0 dangerous classifications (also 0 under the stricter rule that no non-transaction phrase may parse as a transaction); 10 documented gaps.

## Where this touches your code (everything else is untouched)
- `assistant.ts`: the old session memory and the old batch handlers are replaced. Your plan routing, aliases, workflows, dry runs, reversal flow and tool registry are kept. Touched lines of yours: `send` (the context line now reads the real memory), `clearContext` (clears the real memory), the typed-cancel line (`cancel()` now clears a waiting batch itself), the reversal "prepare" line (remembers what was asked, for the log), the reversal "execute" block (same result, now also logged), and the batch-detection block (reads the original text; your planner still runs right after it, and the multi-line safety message comes after the planner so it cannot intercept your plans).
- `intentParser.ts`: patterns extended (supplier direction, customer-balance wording, "left/remaining", sale/receipt/payment wording, refund/discount, "who bought…"). **Your `scoreInsights` and the near-tie rule are unchanged.**
- `queries.ts` (customers-who-bought now filters by product; activity reply added), `types.ts` (+`ACTIVITY_QUERY`, batch item fields, `recordId`), `replies.ts` (one phrase added to the Ask help row), `index.ts` (exports), `eval/cases.ts` (fixed gaps removed, new cases and honest gaps added).
- `AssistantPage.tsx` and `index.css`: only the composer input became a textarea. Your plan card, context line and local-tools panel are untouched.
- `TallybookDB.ts`: **your v12 (`saleReversals`) is untouched; this adds v13 with one new table** (`assistantAudit`). `activeCompany.ts` adds that table to the company-clearing lists. `purchases.test.ts`: the schema-version assertion 12 → 13.
- `transactions.ts` and `batchParser.ts` were replaced by the rebuilt versions (your project had not modified them).

## Compatibility
- **Database v13.** A device upgraded to this build cannot be opened by an older build (browsers do not allow downgrading a local database), and backups made by this build declare schema 13, which older builds will refuse to restore. Backups from older builds restore normally. The upgrade from v11 and from v12 (keeping existing sale reversals) is tested.

## Things noticed in your code (left unchanged)
1. `activeCompany.ts` does not clear `saleReversals` when a company is deleted, so a deleted company's reversals would remain.
2. `createBackup` exports an `assistant` section (history, aliases, workflows). Every message the owner typed (amounts, customer names) is therefore in every backup file. My activity log is deliberately not in backups; you may want the same for history, or a clear note to the owner.
3. The "Using recent context: <name>" line is now live and appears under every reply while a customer is remembered, including replies that do not use that customer (e.g. "Which customer paid?"). Consider "Remembering: <name>" or showing it only when it was applied.
4. The reversal success path does not call `notifyRecordsChanged()`, so other open pages may not refresh until focus returns (the other save paths do call it).
5. Your insights scorer does not recognise "are we making more than last month", "sales vs last month" or "which products are not selling" (recorded as known gaps in the harness).
6. `new_assistant_implementation.md` still describes session context and batch entry as working; after this update that is true for the first time.
7. `SessionTurn` in `types.ts` is now unused.

## Verification
`pnpm check` clean · `pnpm test` 48 files / 474 tests (your 412 unchanged and passing, plus mine) · `pnpm build` OK. Mutation checks confirmed the new tests fail when memory expiry, real batch saving, or logged outcomes are broken.
