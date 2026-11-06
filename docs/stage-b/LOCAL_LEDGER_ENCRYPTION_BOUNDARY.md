# Stage B — Device-local ledger encryption boundary and safe engineering plan

**Date:** 2026-11-06
**Status:** INVESTIGATED, NOT ENCRYPTED OR ACCEPTED
**Source:** `client/src/db/TallybookDB.ts` (Dexie / `tallybook-db`, schema version 39).
**Production impact:** None. This document authorizes no migration, schema upgrade, production deployment or real-data rewrite.

## Confirmed boundary
The device-local business ledger and the cloud shared-shop queue are different stores. The shared-shop queue has an opt-in AES-GCM encrypted vault on the Stage B draft branch. The device-local ledger's working IndexedDB rows remain plaintext, including financial and personal records. `client/src/features/backup/backupCrypto.ts` encrypts *exported backups*, not rows in `tallybook-db`. Staff PIN/session restrictions are access controls and must not be advertised as disk encryption.

The v39 local database uses dozens of direct Dexie tables and indexes. Representative sensitive stores include `businessProfiles`, `customers`, `products`, `sales`, `saleLines`, `payments`, `receipts`, `repayments`, `purchases`, `suppliers`, `expenses`, `supplierPayableEntries`, `staffMembers`, `staffShifts`, `staffAudits`, `customerBenefits`, `walletTransfers`, and sync data. Indexes include company IDs, product/customer IDs, normalized names, sale dates, receipt numbers, retry keys, and compound indexes used by transactional operations.

## Why encrypting raw records in place is not safe

- Existing IndexedDB key paths and Dexie indexes rely on fields of the original object. Encrypting those fields without a compatibility layer breaks lookups, uniqueness guarantees, and rollback logic.
- Most financial actions write several stores in one IndexedDB transaction. Browser WebCrypto promises can cause an IndexedDB transaction to become inactive if encryption is placed inside a readwrite transaction without a tested strategy.
- IndexedDB metadata and blind-index strategy must be chosen explicitly. Leaving names, phone numbers, or searchable financial content as cleartext indexes negates claimed confidentiality. Encrypted equality indexes do not support ordinary range or name-prefix searches.
- Offline application access requires a complete, user-owned unlock and recovery lifecycle. A staff PIN alone is neither a high-entropy encryption key nor a substitute for a recovery plan.
- A browser-level encryption layer does not protect against XSS, active browser compromise, unlocked sessions, storage eviction, or stolen recovery secrets.

## Required development sequence (blocked until each check passes)

1. **Data inventory and classification:** enumerate all v39 tables, columns, primary/unique/indexed fields and every direct writer/reader. Mark personal, financial, secret, searchable, and cross-company data. Produce a query-dependency matrix from actual code paths.
2. **Architecture prototype on synthetic data only:** compare encrypted data-payload rows + minimal clear metadata/blind indexes against an isolated encrypted database/VFS. Benchmark transactions and offline searches on low-spec Windows, mobile browsers and 8 GB devices; document residual plaintext leakage.
3. **Key governance:** company/account-bound, nonextractable AES keys derived or unwrapped with a strong user-controlled secret; versioned envelopes, random nonces and authenticated associated data. Define sign-out, PIN logout, staff rotation, business switching, lost-secret, shared-device and cloud-nondependency behavior.
4. **Crash-safe migration:** require *verified encrypted recovery export* before any rewrite, a no-loss dry run, old/new record count and financial invariants, encrypted copy, restart/recovery, and only then atomic cutover. Preserve original DB until user-reviewed verified recovery. Never overwrite foreign company data.
5. **Full query/transaction adapter:** preserve IndexedDB uniqueness, ordering and company isolation; migrate and test all financial writers, conflict handlers and reporting readers. No partial "encrypted UI" claims if old code paths still write plaintext.
6. **Adversarial QA:** scan raw IndexedDB after a full sale/purchase/repayment/refund/shift workflow for plaintext personal and financial payload; verify same-company/foreign-company isolation, quota failures, two tabs, crash during cutover, stale version, restoring to a fresh device and nonmatching passphrase.
7. **Release authorization:** exact-head native, Vitest, PGlite, TypeScript, build, browser and physical owner-device evidence; independent finance and privacy review; explicit owner approval before deployment or real-data migration.

## Minimum quantitative proof

- All original ledger rows are accounted for by record ID, store and business, not just totals.
- Every generated receipt number, idempotency key, stock quantity, credit/customer balance, payable and repayment sum remains unchanged after migration and recovery.
- A failed migration preserves a readable source DB and verified encrypted recovery copy; **zero** unexplained missing/duplicated records.
- Raw persistent storage contains no sensitive plaintext values covered by the declared encryption threat model (except documented minimal metadata); direct business queries remain correct only after authorization and unlock.
- Production and customer data are never used as trial migration inputs.

## Current disposition

**Open B2-local-ledger blocker:** No whole-ledger at-rest encryption can be claimed. Engineering may continue in a separate tested prototype without touching the v39 working database. Shipping an incomplete migration would be worse than preserving the current offline-first ledger and explicitly documenting its storage risk.

Related: `docs/stage-b/STAGE_B_IMPLEMENTATION_GATES.md` and `docs/stage-b/STAGE_B_VAULT_RECOVERY_PROTOCOL.md`.
