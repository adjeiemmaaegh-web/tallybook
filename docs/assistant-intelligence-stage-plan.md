# Assistant Intelligence Stage Plan

**Status: implementation approved by owner request on 2026-10-03; no new remote service or cloud data path.**

## Purpose
Make Tallybook feel more agent-like while keeping IndexedDB authoritative, offline use truthful, and writes confirmation-gated.

## Included
- Typed local task plans for compound read-only questions.
- Evidence and visible context in assistant replies.
- Suggested follow-up actions.
- Local alias normalization for common shop language and correction-friendly matching.
- Dry-run wording for transaction previews.
- Reversal preparation guidance without destructive deletion.
- Reusable local workflow definitions and built-in morning/end-of-day plans in memory.
- Developer documentation and focused tests.

## Excluded
- Cloud AI, synchronization, remote storage, automatic uploads.
- Automatic scheduled background execution while the browser is closed.
- Destructive deletion, automatic reversals, or unconfirmed ledger writes.
- Replacing existing IndexedDB services or historical records.

## Invariants
- Existing sales, payments, purchases, stock, receipts, and balances remain authoritative and unchanged.
- Read-only plans never write.
- Transaction previews still require explicit confirmation.
- Derived recommendations are labelled estimates and include source evidence.

## Acceptance
- Compound overview returns a plan and follow-up actions.
- Insight answers expose evidence and next actions.
- Alias matching remains deterministic and local.
- Existing transaction tests continue to pass except any documented pre-existing flaky assertion.
- Production build succeeds and the package includes `new_assistant_implementation.md`.
