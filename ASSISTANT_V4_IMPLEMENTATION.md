# Tallybook assistant V4 QA implementation

## Added
- Conservative compound sale expansion for simple multi-product sentences (two to ten items) with shared named buyer or payment terms. Expands into **separate sales**, not one invoice.
- Existing batch confirmation process is used; no ledger write until owner confirms.
- **All-or-nothing preview preparation** for expanded compound sales: if any line cannot be resolved or validated, there is **no confirm action** and no partial sale is proposed.
- The earlier conservative multi-item warning remains for unsupported/uncertain constructions, including shared numeric partial payments.
- Regression tests for expansion, refusal to allocate partial payments, and nonmutating previews.

## Caveats
- This is **not** full multi-line invoice support. Each successful expanded item is a separate sale record.
- Compound stock receipts and combined payments require explicit separate lines.
- A partial failure *during execution* of the existing batch path can still leave prior lines saved; true transactional multi-item invoice support requires a dedicated atomic sale API.
- QA tests require dependencies before execution; syntax-only checks do not establish functional correctness.
