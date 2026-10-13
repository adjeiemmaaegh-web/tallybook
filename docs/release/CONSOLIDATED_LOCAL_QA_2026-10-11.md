# Tallybook V19 — consolidated local engineering and QA pass

**Decision: NO-GO / INCOMPLETE.** This is a source-only local continuation of the latest `ENCRYPTED_PREFLIGHT` archive, not a certified twelve-stage release. It does not activate cash refunds or external payment/commerce operations.

## Input identity

- Verified `TALLYBOOK_V19_ENCRYPTED_PREFLIGHT_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `d5c26793b527d2f4e79ec238e04ac50414cd8236be916a56757b1c9d27435bdf`.
- Preserved all genuine input source, QA and release evidence. No earlier archive or historical build was substituted.
- The original 82 acceptance units and all 42 existing issue IDs remain. Existing statuses are retained until the required client and external evidence exists.

## Implemented, bounded source changes

1. **DATA-001 / DATA-002: portable backup and local audit retention.** New business backups export no browser/device `appMeta` metadata. Legacy backups with known metadata keys parse for compatibility, but imports reject unsafe/duplicate/unknown metadata and NEVER apply legacy schema/version, creation-time, local backup status or active-company metadata to the destination device. The restore transaction no longer silently deletes the device-local `assistantAudit` table, which was never included in the portable backup. Deliberate company deletion still follows its existing scoped deletion behavior. This conservatively preserves device history while audit retention policy remains unresolved.
2. **SEC-001: transaction-time staff scope.** Moved owner/staff permission checks into IndexedDB write transactions for staff enable/disable, role and permission changes, PIN reset, authenticator revocation and shift creation. The approved actor and active company are rechecked before writes/commit, and audit attribution uses the transaction-validated actor. Initial no-staff bootstrap remains supported; first owner creation uses a captured company identity. PIN unlock now rechecks the current company and saved verifier after the asynchronous password hash.
3. **SEC-001: read and catalogue consistency.** Introduced a small fail-closed company-scope guard. Inventory, purchases and reports now take consistent main-database read transactions for their joined snapshots; inventory, sales, customer, purchase, staff-directory and composed reporting surfaces check that the company did not switch during asynchronous reads. Category, product, stock and customer writes use the originally authorized company and recheck it in their write transaction rather than mixing captured and current company IDs.

## Actual execution evidence

- Environment: Linux, Node.js 22.16.0, OpenSSL 3.5.5. **Pinned Node.js 24.19.0 and pnpm 10.34.0 were not available.**
- Native baseline (input archive): **347/347 pass**, 0 fail, 0 skip.
- Native final on modified source: **357/357 pass**, 0 fail, 0 skip (10 additional tests across metadata and company-scope guards).
- Standalone disabled-by-default mock gateway: **4/4 pass**, 0 fail, 0 skip.
- Modified TypeScript files: syntax parse only (not semantic certification); isolated declarations compile.
- Full repository TypeScript check: **FAIL / unavailable** (missing `node` and `vite/client` type definitions).
- `pnpm` acquisition: **FAIL / unavailable**, registry DNS request blocked (`registry.npmjs.org`). Therefore current-client Vitest, real Dexie/IndexedDB, Vite production build, Playwright migration/offline tests and physical-device validation were **NOT RUN**. Added client regression assertions are specifically marked **unexecuted**.
- Results are source-local only: never sum the 4 mock tests into the native 357-test count to claim one undivided suite.

Execution logs: `artifacts/continuation-2026-10-11-consolidated/`.

## Unresolved and decision

No production claim is supported. Operational refund UI is STILL STRICTLY READ-ONLY; live cash/MoMo/card/provider refunds, wallet/loyalty/debt and batch returns remain incomplete. Global cross-tab, multi-database recovery and assistant retention policy require further verified work. Broad write/read authorization coverage, historical migrations, cloud membership and durable replay, authoritative store stock and transfers, public commerce, owner-approved automation, device profiling, notices, approved staging and real provider sandbox are still open. External deployment and real payments remain unauthorized.

**Next executable gates:** Obtain locked dependency installation without compromising toolchain provenance, execute all client Vitest/IndexedDB tests and semantic TS, fix actual failures, rebuild and run Playwright with real schema 28 migrations and crash scenarios, then redo a full final-source QA and independent financial/security review. Hardware/staging/provider requirements remain externally gated. If full suite cannot run, keep NO-GO regardless of native count.
