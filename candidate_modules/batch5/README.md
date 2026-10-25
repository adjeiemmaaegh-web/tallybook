# Batch 5 — Automated QA (items 21–26)

Files: `integrationRegression.test.ts`, `financialIntegrity.test.ts`, `securityIsolation.test.ts`, `backupRecovery.test.ts`, `crossBrowserAcceptance.spec.ts`, `endToEndBusinessFlows.spec.ts`.

**Integration note:** These are standalone QA contract checks and browser acceptance scaffolds, not yet fully integrated Tallybook application regression or end-to-end implementations. The four Node suites validate their own exported contracts only, not live Tallybook services. Browser specs require Playwright, a served application, disposable fixtures, and additional workflow assertions; they were not executed. These files still require integration with Tallybook's existing code and full application testing before Batch 5 can be considered complete. No external systems were changed.

Run standalone checks with Node 22+:
`node --experimental-strip-types --test integrationRegression.test.ts financialIntegrity.test.ts securityIsolation.test.ts backupRecovery.test.ts`

Do not include these standalone suites indiscriminately in the app's Vitest glob: migrate to project imports and real fixtures first. Do not interpret a skipped browser spec as accepted QA.


## 2026-10-24 pre-Batch-7 QA review
Locally rerun standalone tests: **15/15 PASS**. See `QA_REVIEW.md` and `QA_TEST_LOG.txt` for the latest corrections/evidence; older test counts in this README refer to the earlier delivery. These remain standalone candidate modules/tests, not fully integrated application functionality. Live application tests and release acceptance remain outstanding.
