# Tallybook V19 — assistant snapshot recovery safety continuation (11 October 2026)

**Release: NO-GO / INCOMPLETE.** Bounded local source change from verified `TALLYBOOK_V19_CONSOLIDATED_QA_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `ec23b694da65a414a3ca66f1ec952b66600b56124c880671cce71fd72300a64d`. All existing code and evidence retained.

## Scope and change

- `client/src/features/backup/restoreJournal.mjs`: before/after assistant snapshots must be plain JSON-roundtrippable values before a recovery marker is written. Values such as Date, Map, Set, typed arrays, explicit `undefined`, NaN/Infinity, BigInt, functions, symbols, cyclic or deeper-than-32 structures, sparse or decorated arrays, getters/non-enumerable properties, and prototype-sensitive keys are rejected. Unexpected snapshot tables are rejected. Snapshot equality retains order-independent record comparison but no longer equates information-losing encodings. The journal version and byte cap are unchanged.
- `client/src/features/assistant/assistantLocalStore.ts`: future assistant-history writes omit absent optional `intent` instead of storing explicit `undefined`, making them safe for a JSON recovery snapshot.
- Native tests in `qa/restore-journal.test.mjs` and an UNEXECUTED client regression in `restoreRecovery.test.ts` and `assistantLocalStore.security.test.ts`. No changes to financial balances, original records, cloud/payment operations or refund activation.

## Executed QA and environment

- Linux Node 22.16.0 / OpenSSL 3.5.5. Pinned Node 24.19.0 and pnpm 10.34.0 not installed.
- Full dependency-free Node/QA suite: **361/361 passed**, zero failures/skips. Previous baseline **357/357**. Command `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`, exit 0.
- Separate mock-payment suite **4/4 passed**, exit 0; disabled by default, no live collections.
- New JS and TS file syntax parsing passed. Full `tsc --noEmit --incremental false` exit 2: missing Node and Vite typings. Npm registry lookup returned `EAI_AGAIN`; full client Vitest, Dexie/IndexedDB, Vite build and Playwright browser tests **NOT RUN**. No source-based test result may be treated as hardware/client certification.
- Detailed logs in `artifacts/continuation-2026-10-11-snapshot-safe/`; client test cases were authored only.

## Compatibility and outstanding limitations

Previously saved assistant records with unsupported structured-clone-only values or explicit undefined optional fields may now cause restore/company clear to **fail closed**. No existing history was silently normalized or changed. Review records under an approved recovery procedure before retrying such an operation. The conservative validation avoids irreversible data loss but requires real IndexedDB migration and recovery testing.

DATA-005 remains `implemented-unverified`, DATA-002 remains open, and the original **82 acceptance units / 42 tracked issues** are preserved. No global cross-tab coordination or physical crash matrix, complete authorization audit, broad refunds, payment provider, hosting or staging evidence was supplied. Cash refund UI remains strictly read-only. No real deployment, payment, staging or destructive customer-data operation is authorized.
