# Tallybook V19 — Administrative Recovery Coordination and Staff Credential Freshness

**12 October 2026 — LOCAL SOURCE INCREMENT / NO-GO.** Input: the verified `TALLYBOOK_V19_EXPANDED_RETAIL_WRITE_LOCK_CONTINUATION_2026-10-11_SOURCE.zip` with SHA-256 `9d16400eb0036e80fddbf79680bd89a9fa64fa3253897b985b2539ababc974b6` (950 files). These notes are not evidence of real browser or production operation.

## Source changes

- Added shared recovery coordination outside Dexie write transactions for business profile save/create, local commerce draft create/cancel/transition, and nine staff-management/shift mutation entrypoints. Dexie-nested callers retain the existing outer-lock responsibility.
- Revalidated active business identity on business profile read/write; revalidated staff identity and sell permission inside shift closing and read-only shift preview. Assistant/retail lock names and restore-journal formats are unchanged.
- Rechecked latest authenticator credential identity/public key/algorithm, active company, and monotonic sign counter under an IndexedDB write transaction after WebAuthn signature validation. A revoked/replaced credential, counter rollback or disabled staff identity must fail closed.
- Rechecked supervisor PIN verifier, role/permissions and original cashier session after asynchronous PBKDF2; discount approvals are now bound to the exact cashier as well as company, intent and amount.
- Added pure guard tests (native), source-contract tests and an **UNEXECUTED** Vitest/Dexie test for administrative writes while exclusive recovery is in progress.

## Scope and unresolved concerns

- These additional wrappers still do **not** ensure all writers or direct IndexedDB access take Web Locks; DATA-002 remains missing. Browser Web Locks are advisory and disabled browsers retain ordinary offline writes but cannot use destructive multi-DB operations.
- Client Vitest, full semantic TypeScript, production build, real IndexedDB multi-tab crashes, WebAuthn devices and external staging are unverified. Full source release remains **NO-GO / INCOMPLETE**; cash refund UI remains read-only, and real payments/provider operations are not authorized.
- The previous source QA harness failed initially because its VM import mock did not recognize the new lock adapter. The harness was updated without relaxing its assertions. Source syntax checks then detected and helped correct one mismatched wrapper parenthesis. Both initial failures and corrections are documented in the continuation report.
