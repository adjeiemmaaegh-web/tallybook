# Tallybook Assistant V7 QA update

## Improvements

1. **Combined-sale preview**: The preview title now says "One sale with N products" instead of incorrectly describing N ledger transactions. Mixed multi-command batches retain the original wording.
2. **Single audit event**: A combined sale (whether saved or rejected at confirmation) writes a single audit event, including all approved preview lines. The previous loop wrote a separate saved event for each product line despite recording one receipt.
3. **Idempotent submission key**: Combined sale confirmations pass the preview token to `completeSale` as a stable `submissionKey`. The existing unique submission-key persistence logic can now deduplicate retries for the same confirmed sale.
4. **Regression test**: The existing combined-sale integration test additionally checks that there is exactly one audit event for its resulting sale.

## Verification and limits

- Changed TS source files parsed with the installed TypeScript compiler: passed.
- Full typecheck, Vitest suite, Vite production build, and interactive browser tests: **not executed** (dependencies unavailable).
- Atomicity remains specific to one combined sale. Independent multi-command batches still execute sequentially.
- Existing refusal to auto-allocate a single numeric payment across multiple products remains intentional. A future UX should collect a single combined payment amount rather than guessing.

## Suggested manual acceptance checks

1. Preview `Sell 2 eggs and 1 rice to Kwame, cash` and confirm it displays one sale, two products and no writes before confirmation.
2. Confirm, then inspect one sale, two sale lines, one receipt and one assistant audit entry.
3. Double-tap confirmation and check the same token cannot create an additional sale.
4. Archive a selected product after preview and confirm nothing is saved, while one failed audit event appears.
5. Switch business after preview; confirm that no write occurs.
6. Execute a mixed multiline batch and ensure separate audit entries still describe separate ledger transactions.
7. **More natural compound-sale input**: Supports `I sold ...` and `We sold ...` combined-product phrasing, plus parser regression cases. These still require a single shared customer/payment term and confirmation.
