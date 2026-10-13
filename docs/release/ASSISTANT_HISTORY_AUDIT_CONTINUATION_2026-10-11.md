# Tallybook V19 — assistant-history isolation and atomic audit continuation

**Date:** 11 October 2026. **Input:** `TALLYBOOK_V19_JOURNAL_CAS_CONTINUATION_2026-10-11_SOURCE.zip` SHA-256 `20f3b54d770c585ac594c4cc45ba5023acdcf3e7e98e583cd387001ed05b11ff`. **Release:** NO-GO / INCOMPLETE.

## Identified defects and correction

1. Direct assistant history reads, writes and clear operations accepted arbitrary company IDs even when another company was active. All direct assistant local history operations now verify the exact active company, including repeat validation inside write transactions. Assistant workflow and alias reads are likewise scoped. A background conversation must not be recorded under a different business when the owner switches during an asynchronous answer; failed background history writes are observed, not left as unhandled rejections.
2. `listAssistantHistory` combined Dexie `.reverse().sortBy("createdAt")`, which did not provide a robust newest-first ordering. It now explicitly sorts by timestamp descending and ID for ties, with a validated UI limit.
3. Backup creation reused the recent-history UI API, exporting at most **50** assistant-history rows even if more existed. The backup now uses a separately named **all-history** path. History is never backfilled, deleted, or assigned to another company. This fix can make backups larger; quota/archive-size validation and live export/restore tests are still needed.
4. Assistant activity-log insertion and pruning were separated writes; interruption could leave the log over its local retention cap and concurrent writers could prune unpredictably. Both run in a single IndexedDB read-write transaction, selecting the oldest scoped entries with deterministic ordering. A failure rolls back the new entry and still cannot roll back the actual ledger action. Existing device-local audit policy remains **1000 entries per company, excluded from backup, removed with company clear**. Whether this is sufficient audit retention remains an OPEN owner/release decision; these changes do not claim immutable or durable transaction-audit guarantees.

## Verification boundary

- Linux Node 22.16.0/OpenSSL native suite: **271/271 PASS**, 0 failed, 0 skipped (`artifacts/continuation-2026-10-11-assistant-audit/native-full.log`); includes six new pure audit/scope/history helper tests.
- Isolated mock gateway: **4/4 PASS**. TypeScript/TSX files syntax-parsed using globally available TypeScript compiler, **not** semantic typechecked. Client IndexedDB/Vitest tests were added, but **not run** because the repository dependencies, pinned Node 24 and pnpm are unavailable. Production build, browser backup verification and actual cross-tab/crash testing **not performed**.
- Outstanding: full client suite and TypeScript check, privacy/retention policy, global cross-tab mutation lock, full recovery/migration matrix, actual partial refund posting, and remaining finance/security/provider/hardware/staging gates.

## Next work

First run the new and preexisting client Dexie/Vitest tests with the pinned toolchain and exercise a real backup of more than 50 assistant history rows. Resolve retention policy and all history/archive size limits with the owner; do not silently delete or restore unverifiable audit history. Continue the original 82-unit roadmap; release stays **NO-GO / INCOMPLETE**.
