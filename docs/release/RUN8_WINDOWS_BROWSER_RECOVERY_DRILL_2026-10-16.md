# Run 8 — Isolated Windows/browser backup and interrupted-restore drill

**Authored:** 2026-10-16. **Execution status: NOT EXECUTED.** This is a reviewer protocol, not a release acceptance or approval to modify any production data.

## Rules before using this protocol

Use a **disposable Windows test account and a fresh dedicated browser profile**, backed only by generated sample businesses and synthetic customer/payment data. Do not open or reset the owner's actual day-to-day Windows browser profile, databases or wallet. Do not connect to live Supabase, payment providers, cloud sync, staging or production. Make a verified external copy of the sample test artifacts before any simulated power-loss, deletion or rollback. Never use the developer's test result alone as permission to delete customer data.

The code builds from exact draft Run 8 HEAD. Record the full SHA, Node/pnpm version, OS build, installed browser builds, physical RAM, free disk, test profile path and test file SHA-256. Use pinned Windows Node **24.19.0** and existing pnpm dependencies. Run `scripts\RUN8_WINDOWS_READONLY_QA.cmd` in the cloned repository; it runs the focused native suite, selected client Vitest, semantic TypeScript and a local build, logs results, and performs no migration/reset/deployment. Also run **the entire repository suite** with `pnpm test`, all Node tests, the repository's complete Playwright suite and repository CI against the exact head. A passing partial script is not Run 8 PASS.

## Acceptance matrix (record observed results, not predictions)

| Scenario | Synthetic steps | Required observable evidence |
| --- | --- | --- |
| New encrypted v2 | Export sample business with zero staff, passphrase 12+ chars, reselect exact file and enter correct passphrase | v2 AES-GCM fields fixed, local file SHA-256 matches, verify receipt created only after successful decryption and ledger validation |
| Rejected password | Select same file but wrong passphrase | No import, no mutation, no verified-file marker |
| Tampered bytes | Change ciphertext, IV, KDF iterations, authenticated v2 metadata or append unknown field | Authentication or preflight fails before any ledger transaction |
| Historical v1 | Import a known-valid PBKDF2/AES-GCM encrypted-v1 fixture | Correct records recognized; restored only with explicit operator confirmation |
| Legacy plaintext | Import a known-valid v9 local JSON export | Prominent privacy warning, explicit user opt-in, no silent promotion to encrypted or verified status |
| Unknown format | v3 encrypted kind, future table/schema, unknown root or assistant table | Stop with compatibility error; no records dropped |
| Missing records | v28 omits staff/return table, or a foreign-company row/duplicate record ID is present | Fail before restore starts |
| Duplicate JSON keys | Duplicate totalMinor, customerId, companyId, including escaped equivalent property name | Reject instead of accepting JSON.parse's last-key-wins behavior |
| Size/depth | Over 64 MiB plaintext, over 96 MiB encrypted envelope, excessive nesting and malformed dates | Fail closed with no truncation or mutation; measure low-RAM performance |
| Legacy backup marker | Upgrade a synthetic old browser profile containing only lastBackupAt/lastBackupCompanyId | No new verified-file indicator; deletion gate must remain closed |
| File selection cancelled | Start import of one valid backup, choose another file, cancel its password/unsafe plain warning | Previous restore candidate must not remain armed |
| Company switch | Export A, switch to B, attempt to verify A | No backup receipt attributed to B; A's future verification requires returning to A |
| After a new mutation | Verify backup, then post a new sale | Marker's date records the earlier checked file, not proof of a backup of the new transaction; close/clear freshness remains independently unaccepted |
| Crash before assistant write | Persist durable journal, close isolated tab before assistant transaction | Startup removes untouched marker without rewriting assistant records |
| Crash after assistant commit | Persist journal and assistant postimage, kill isolated tab before ledger commit | Startup CAS-restores exact preimage, preserves ledger, deletes marker in a transaction |
| Crash after ledger commit | Simulate main ledger commit with recovery marker atomically removed | Assistant postimage remains committed, no mistaken reversal |
| Intervening edits | Modify assistant snapshot to a third state while journal pending | Sticky journal preserved, unexpected change preserved, manual reconciliation required |
| Storage/quota failure | Synthetic quota abort at assistant write and main commit | All committed data preserved or explicit recovery-needed state; no silent loss |
| Cross-tab contention | A holds shared retail lock while B attempts restore/export, then inverse | Conflicting operation denied before writes; no deadlocks; lock released on rejected operation |
| No Web Locks | Use a disposable browser with Web Locks disabled/unavailable | Coherent two-DB export and restore/clear fail closed; ordinary supported local read paths remain independent |
| Deleted/cleared company | Verify a saved file and delete only the disposable sample business | Receipt for that business is atomically removed; a recreated ID cannot inherit stale status |
| Reinstall/new profile | Independently open retained encrypted file on another *disposable* Windows browser profile using passphrase | Full financial and assistant data reconciles; no device metadata, old cloud consent or old PIN unlock copied as proof |

## Saved-data reconciliation

Before each destructive test, generate canonical fixture counts and digests for businessProfiles, inventoryCostEvents, products, sales, saleLines, payments, repayments, cashPartialReturns, supplierPayableEntries, staffShifts and assistant workflows/aliases/history. After each crash/reopen compare: tenant ID consistency, immutable sale-link evidence, stock counts and cost events, receipt/payment totals, wallet/credit liabilities, staff audit/shift links, and legacy date/currency uncertainty. A pass requires both the **main ledger** and **assistant** database to match the explicitly expected outcome; screenshots of a working UI are insufficient.

Inspect downloaded file bytes in Windows Explorer outside the browser's temporary path, compute SHA-256 using the local OS tool, and reselect that file in Tallybook. This still does not prove retention after hardware loss: off-device copy and a successful independent restore rehearsal are separate gate requirements.

## Recovery and fail-closed steps

For a corrupt or unknown recovery marker, **do not clear browser site storage** and do not delete the journal. Preserve a full encrypted test profile copy, logs and exact artifact hashes; a reviewer must reconcile manually. For a code/test failure, log the exact exception, expected vs actual mutations, lock sequence, browser version and a minimal synthetic repro. Re-run tests after every code fix at the new **exact HEAD**, not merely against a prior commit. Verify that no automated repair overwrote third-state assistant edits.

## Evidence package and decision

Collect the Windows runner logs, `pnpm test` full output, TypeScript/build/Playwright, browser trace/video/screenshots (synthetic data only), imported/exported fixture manifest, SHA-256 hashes, CPU/RAM measurements, disk quota, Web Locks contention traces, crash-point ledger/assistant digests, and a reviewer-signed PASS/FAIL per matrix row. Update the 47-blocker and 82-acceptance registers **only with observed evidence**, retain failed cases and unexecuted cases explicitly, and report the exact final PR SHA.

**Current status:** Instructions only; none of these Windows, physical power-loss, genuine file retention or real browser tests were executed by this source increment. V19 release **NO-GO**.
