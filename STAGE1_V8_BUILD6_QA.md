# Stage 1 V8 — Build 6 checkout recovery hardening

## Change
- Introduced read-only lookup of previously committed sales by company and submission key.
- Saved sale recovery opens the existing receipt and payment directly without replaying `completeSale`.
- If no committed sale exists, original immutable pending intent is retried with the original submission key.
- Existing committed records missing a receipt, containing duplicate receipts, or with irreconcilable payments cause recovery to stop without writing.
- Added targeted Vitest tests for normal recovery, company isolation, missing/uncommitted sales, corrupted receipts/payments, and duplicate keys.

## Validation status
- Automated tests and build cannot execute without project dependencies (`vitest` and `vite` missing).
- Camera, hardware printing, offline browser reload, and physical-device testing remain outstanding.
- This is a QA development build, not a production release.
