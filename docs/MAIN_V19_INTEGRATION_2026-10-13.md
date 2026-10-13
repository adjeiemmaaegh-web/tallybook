# V19 integration into main — 2026-10-13

Compared with main at a245449. Imported the supplied V19 Milestone 1 source into the repository root and retained repository-only files. The source ZIP SHA-256 matches 8b5661b0541bd39123546a7a36118d559da9c2465de300aae76bada4c79c80b9.

## Reconciliation

- Preserved main's Supabase-backed GoogleSignInPage instead of reverting to the snapshot's local-only Google identity flow. V19's separate opt-in Supabase preview remains available.
- Updated the authentication preservation check to cover that retained behavior.
- Fixed the company-clear result type to use BusinessProfile explicitly; the overloaded Dexie get return-type inference failed TypeScript validation.
- Retained V19's automatic Vercel deployment disablement. This source update is not a production release.
- Imported historical QA documents and artifacts as supplied; their claims describe earlier runs, not this integration.

## Validation on Windows / Node 24.19.0

- Frozen-lockfile dependency installation passed.
- TypeScript validation passed after the type correction.
- Production build passed, including PWA generation; bundle-size warning remains.
- Source QA: 342 tests passed.
- Browser release checks: 3 passed.
- Production offline checkout: 3 passed (desktop/mobile and tax scenarios).
- Full client validation reports failures in the supplied snapshot and is not a clean release gate. An isolated credit test confirms an obsolete expectation that repayment can proceed without verified historical currency; the implementation correctly rejects it. Financial safeguards have not been relaxed to satisfy that expectation.
- Server filesystem security tests cannot be validated fully on Windows: they require POSIX paths, permissions and symlink behavior. The included Linux GitHub Actions workflow remains the appropriate gate.

Outstanding client failures require separate reconciliation before treating this snapshot as production-ready.

Final client result: 759 passed, 13 failed across 96 test files (86 passed, 10 failed). Dependency audit: no known vulnerabilities found.

## Follow-up: resolve the 13 client failures

Two supplier-payable application defects were corrected: retry lookups now use the existing company/submission-key compound index, and reconciliation orders events by timestamp instead of relying on random primary-key order. Recognition is processed before settlements with equal timestamps; settlements dated before recognition remain rejected. Regression tests cover reordered events, same-time events and company-scoped retries.

The remaining failures were reconciled with current contracts: provide valid company/currency/phone fixtures; preserve local audit history on backup restore; reject repayments without verified historical currency without mutating debt; assert current validation messages; restore the wallet fixture currency before testing over-refunds; and identify FIFO source receipts through the original issue allocations rather than array position. No tests were skipped and no financial safeguards were removed.

Follow-up verification: all 773 client tests passed across 96 files; all 343 source QA tests passed; TypeScript validation passed. These results supersede the initial 13-failure client result above.
Production build also passed; the existing bundle-size warning remains.
