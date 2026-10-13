# Tallybook V19 — local continuation increment (10 October 2026)

**Decision: NO-GO / INCOMPLETE.** This is a genuine *first increment*, not implementation or proof of "65%" of the roadmap. The prior percentage was a rough estimate of locally actionable work, not an acceptance count. No external services were connected, no real transactions were processed, and no deployment occurred.

## Source identity and scope

- Received handover: `TALLYBOOK_V19_HANDOVER_2026-10-10.zip`.
- Received SHA-256: `20f6800c5d26a9bbb17cd50b4eecbb9d16167feb696a3269c90afc67c653d4d8` — **matches** the master's expected hash.
- Handover contained source, old prebuilt `dist/`, logs and registers, but no `.git`, installed packages or secrets.
- Local Git was initialized with a snapshot commit. This is a new local history: old commit IDs named in the handover were **not** restored or represented as executable ancestry.
- Product source edits: `server/syncJournal.mjs`, `server/syncBackupVault.mjs`, `client/src/features/assistant/assistantLocalStore.ts`, `client/src/features/customers/customers.ts`, `client/src/features/inventory/stage2Inventory.ts`.
- New Node regressions: `server/tests/syncJournal.test.mjs`, `server/tests/syncBackupVault.test.mjs`; new pending Vitest regressions: `client/src/features/assistant/assistantLocalStore.security.test.ts`, `client/src/features/security/serviceAuthorityContinuation.test.ts`.

## Implemented changes

1. **Server journal filesystem safety** — reject symlink journal targets even if their underlying file permissions look safe; reject symlink journal parent directories; validate private lock inode before unlinking; enforce byte-size limit *including* the proposed append. Explicitly keep the journal inaccessible from HTTP and do not claim actual financial replay.
2. **Opaque backup vault safety** — reject symlink root directories and reject tampered vault metadata (unexpected fields/invalid saved date). No real cloud backup or recovery has been claimed.
3. **Assistant saved data scope** — saved workflow/alias creation and deletion now check the active company, recheck in the write transaction, and reject IDs already owned by another company. This is only a company-isolation improvement; it is not full actor/role authorization or cross-database crash recovery.
4. **Customer service mutations** — create, edit and archive now perform the required staff permission and company scope check *inside* their IndexedDB write transaction, rather than only before an awaited read.
5. **Inventory service mutations** — catalogue options, draft stock-count session create/edit/post and batch registration now revalidate staff inventory permission inside the corresponding write transaction. No new stock-cost/allocation policy was invented.

## Actual test evidence

- **PASS**: baseline on Linux, `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`: **156/156, zero skipped** (see `artifacts/continuation-2026-10-10/native-baseline.log`).
- **PASS**: final identical broad command after server changes: **160/160, zero skipped** (`native-final.log`, exit 0). Four additional regression cases prove symlink-target, symlink-parent, vault-symlink-root and malformed-record rejection.
- **PASS**: isolated mock payment contract 4/4, `payment-mock-final.log`, exit 0. This is included in 160/160 and is **not** counted again as a separate full-suite result.
- **PASS (syntax only)**: TypeScript transpile parser for changed client source/test files. Parser success **is not** type checking or client behavior evidence; see `client-changed-syntax.log`.
- **NOT RUN**: client Vitest, semantic TypeScript checks, production Vite/PWA build, Playwright and full AST authorization inventory. Handover omitted dependencies, corepack could not fetch pnpm 10.34.0 (`getaddrinfo EAI_AGAIN registry.npmjs.org`), and `node scripts/audit-write-paths.mjs` cannot resolve TypeScript package locally. `pnpm-unavailable.log`, `write-path-audit-unavailable.log` retain failure details; do **not** inherit the previous agent's green build for the new code.
- Test host: Linux x86_64, Node 22.16.0, OpenSSL; **not** the handover-pinned Node 24.19.0. Full host information and statuses in `environment.txt` and `.exit` files.

## Blockers still open

Accounting/COGS, partial refunds, supplier liabilities, legacy cost evidence, authoritative per-store stock, complete service-level actor audit, crash-safe dual IndexedDB recovery, debt ageing, automation, authenticated cloud financial replay, trusted commerce/reservations/fulfillment, provider sandbox verification, external staging, physical devices, end-to-end production build/browser QA, and dependency/runtime/license review remain **NO-GO**. An accepted local POSIX test removes only the previous *Windows-specific* file-permission/TLS test uncertainty; it is **not** proof of staging or production security.

## Reproducing independently

1. Install the exact toolchain pinned in `.node-version` and `package.json`, then `pnpm install --frozen-lockfile` in an authorized environment with available dependencies.
2. Run the full commands from `NEXT_AGENT_MASTER_PROMPT.md`, including `pnpm test`, `pnpm check`, `pnpm build`, native Node/QA, real IndexedDB browsers, static write path audit and source diff.
3. Review changes and add full negative/positive staff, company-switch and interruption tests around affected client services; existing additional Vitest regressions are present but currently **unexecuted**.
4. Do not copy the prebuilt `dist/` in the original handover into a release of this patched source; a new build must be produced and verified first.
5. Do not enable remote payment, public commerce, sync replay or deployment until their acceptance gates and explicit external approvals are satisfied.
