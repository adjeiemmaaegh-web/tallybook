# Tallybook V19 Stage 1 local increment

**Status: IN PROGRESS; CLIENT RELEASE NO-GO.**

Baseline: original `tallybook-main.zip`, SHA-256 `cb8421313a7b1acb3861ebe139bcbc20df6f31a292dc2aed8dd12a04269e7565`. GitHub branches/commit identity cannot be independently established from a downloaded ZIP. Candidate metadata references another branch; compatibility is not assumed.

Work: preserved original source; copied Stage 1 modules into isolated `stage1-audit-candidate`; removed an unproven equality check from diagnostics to reduce false positives. No live app wiring, DB migration, external writes, GitHub or Supabase operations.

Verification: standalone Node suites **23/23 pass after candidate CommonJS package scope fix**. Full project integration, TypeScript, browser, build and hardware remain unverified.

Outstanding: see `STAGE1_DEVELOPMENT_LEDGER.json`. Stage 1 is not complete.
