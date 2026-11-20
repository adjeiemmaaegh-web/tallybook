# ST24-05 — Active-ledger encryption at rest and recovery (implementation record)

**Status: SOURCE-IMPLEMENTED and verified in fake IndexedDB, the full existing test suite (three modes) and real Chromium. NOT deployed, NOT enabled for anyone by default.** Encryption is an explicit owner opt-in on the Backup page. Real-device, Safari/Firefox/WebKit (CI), low-spec performance, independent security review and owner acceptance remain open (see the end). Do not describe this as "production approved".

## What it does

Every row of the Dexie ledger (all tables except `appMeta`) can be stored encrypted. Services, transactions, reports, backup and restore are unchanged: a Dexie DBCore middleware (`st24LedgerSeal.ts`) seals rows on write and opens them on read, below the services. In `plaintext` mode (the default) it is a pure pass-through.

- **Cipher:** XChaCha20-Poly1305 (`@noble/ciphers`, audited, MIT), fresh random 192-bit nonce per write. The workspace, table and **primary key (including its type)** are authenticated, so a row cannot be moved to another key, table or workspace, and ciphertext/nonce bit flips are rejected.
- **Keys:** a random 256-bit DEK per ledger, wrapped twice (owner passphrase via PBKDF2-SHA-256 310k; one-time 256-bit recovery code via HKDF) by the existing `st24LedgerKeyring`. Row key and blind-index key are derived from the DEK with HKDF and distinct domain labels.
- **Blind indexes:** personal and financial indexed fields are replaced by a keyed HMAC so exact lookups and uniqueness still work but nothing is readable: `businessProfiles.name`, `categories.name/normalizedName`, `products.name/normalizedName/sku`, `customers.name/normalizedName/phone`, `suppliers.normalizedName`, `storeLocations.normalizedName`, `mobileMoneyProviders.normalizedName`, `sales.receiptNumber/outstandingMinor`, `receipts.receiptNumber`, `inventoryMovements.resultingQuantity`. A blinded index supports **exact lookups only**; ordering, prefix, range and `anyOf` throw instead of returning wrong rows. Five `orderBy("name")` call sites were replaced with an in-memory sort that reproduces IndexedDB order (`lib/indexOrder.ts`).
- **State machine (persisted in a separate IndexedDB `tallybook-keyring-v1`, never inside the ledger):** `(none) → migrating → encrypted → decrypting → (none)`. The wrapped keyring and a pre-conversion SHA-256 fingerprint are written **before the first row is touched**. Conversion runs in short per-batch transactions; every row is readable (plaintext or sealed) at every instant. Nothing is deleted.
- **Verification before commit:** per-table count + streaming SHA-256 of the decrypted contents must equal the pre-conversion fingerprint, and a raw scan must find zero plaintext rows and zero unblinded values. Otherwise the ledger stays `migrating` (resumable or reversible) and is never marked encrypted.
- **Startup gate:** `DatabaseProvider` decides the encryption state before any ledger read; an encrypted ledger shows the unlock screen instead of the app.

## Recovery matrix

| Situation | Path | Tested |
|---|---|---|
| Normal start | passphrase | yes (unit, UI, Chromium reload) |
| Forgot passphrase | recovery code → set a new passphrase; no data change | yes |
| Lost/rotated recovery code | needs passphrase; old code stops working in the current keyring | yes |
| Key record missing on this device (ledger reports `orphaned`) | import the **recovery package** (wrapped keys only) + a credential | yes |
| Crash/killed tab during conversion | start up shows "Finish turning on encryption"; resume with passphrase to the original fingerprint, or roll back | yes, incl. real tab kill in Chromium |
| Crash during rollback | resumable | yes |
| Want plaintext again | `disableLedgerEncryption` (verified against the pre-encryption fingerprint) | yes |
| **Both credentials lost** | **no backdoor.** Restore the external verified encrypted backup (independent format and passphrase) on a fresh install | backup→restore into a new ledger and into an encrypted ledger: yes |

Enabling is refused unless a verified encrypted backup receipt exists for the active company, the owner types the recovery code back, and (for multi-business devices) confirms each business is backed up.

## Deliberate trade-offs (read these)

1. **Raw key bytes in memory while unlocked.** Every service does read → compute → write in one IndexedDB transaction, so ciphertext cannot be staged beforehand and async WebCrypto would let the transaction auto-commit. A synchronous cipher is therefore required, which means the derived row/blind keys exist as `Uint8Array`s in the tab's heap while unlocked (unlike the non-extractable handle in the original keyring module, which is unchanged and still used for key wrapping). Locking overwrites them best effort; JavaScript cannot guarantee every copy is erased. Malicious script in the page, or an unlocked unattended device, defeats any at-rest scheme.
2. **Still readable at rest (metadata):** table names, primary keys (random ids), row counts, and the non-blinded index fields: foreign ids, timestamps, statuses, payment/movement kinds, operation/submission keys, sequence numbers, `lowStockThreshold`, staff role, currency/country/business type. This reveals activity volume and timing and relationships between random ids, not names, phone numbers, amounts, receipt numbers or contents. The list is pinned by a test; adding an index forces a classification decision.
3. **`appMeta` is exempt** (schema version, active company id, backup timestamps/receipt fingerprint, restore journal). It must be readable before unlock.
4. **Integrity is tamper-evident for edited, swapped or injected rows**, but an attacker with write access to the browser profile can still delete the database or the key record (denial of service). A stale plaintext-mode tab is stopped by a synchronous `localStorage` fence.
5. **Schema upgrades are blocked for encrypted ledgers.** Sealed rows carry index copies projected for one schema; opening them under a newer schema would let Dexie build empty indexes. The key record pins the schema version and `prepareLedgerSecurity` returns `schema-mismatch` (and does not open the database) until an encrypted-ledger upgrade path is built and reviewed. **Any release that bumps `DATABASE_SCHEMA_VERSION` or adds an index must ship that path first.**
6. **Credential compromise ≠ credential change.** Changing the passphrase or recovery code re-wraps the same DEK; old copies of the keyring stay unlockable with old credentials. A full response requires DEK rotation and re-encryption of all rows, **which is not implemented.**
7. **Deleted-row residue.** Conversion rewrites rows in place; IndexedDB may retain old plaintext pages in browser storage until compaction. Disk-level forensics of previously stored plaintext is out of scope and cannot be guaranteed away from application code.
8. **Multi-company databases share one DEK** (one ledger = one workspace database), and the backup gate checks the active company's receipt only; the owner must confirm the others.

## Residual plaintext outside the ledger (inventory, not remediated)

`localStorage`/`sessionStorage` is used for: owner entry/verification markers (`tallybook.entry.verifiedOwner.v1`, `friendsTestVerifiedAuthUserId`), theme, parked carts (`tallybook:parked-cart:v1:*`), per-company report visit markers, a pending batch-stocktake draft, saved-scope keys, and the new seal fence. **Parked carts and the pending stocktake draft can contain product/quantity data and are not encrypted by this work.** The service-worker cache holds app shell assets only (no ledger data found in this review, not exhaustively proven). Backups are a separate, already-encrypted format.

## Verification evidence (local, this branch; not yet exact-commit CI)

- `node --test qa/st24-row-cipher.test.mjs`: cipher, AAD binding, nonce uniqueness, tamper, blind-index separation, key-order preservation.
- `st24LedgerSeal.test.ts` (19): confidentiality of stored rows, transparent Dexie behaviour (add/put/bulk/get/where/modify/update/delete/transactions/unique indexes), refusal of unsupported blinded queries, locked/tampered/injected/moved rows, fence.
- `st24LedgerSecurity.test.ts` (21): enable/refuse gates, conservation of money/stock/receivables, reload+lock/unlock, crash at three points + resume, rollback, credential changes, recovery package, orphaned key record, schema guard, two tabs, concurrent credential change; mutation-checked (removing pre-conversion keyring persistence fails 5 tests; removing verification fails the altered-row test).
- `ledgerEncryptionUi.test.tsx` (6): startup gate, wrong/right passphrase, recovery path, schema message, owner wizard incl. refusal paths.
- **Whole existing client suite with every `TallybookDB` forced encrypted** (`TALLYBOOK_ENCRYPTED_TESTS=1` migrating, `=2` strict). First run exposed 223 failures; all traced to the five `orderBy("name")` sites, legacy-upgrade tests that seed plaintext on purpose, a codec key-order bug (idempotent replay checks compare `JSON.stringify` of stored objects) and a plaintext-mode query bug, all fixed or explained. **Final counts (local, this branch):** normal mode 1872/1872 pass. Migrating mode (`=1`): 1844 pass, 0 fail, 28 skipped (the new encryption suites and the Stage C plaintext-fixture tool deliberately skip themselves when the suite is forced). Strict mode (`=2`): 1824 pass, 20 fail, all 20 being legacy-upgrade tests that seed plaintext rows on purpose and are correctly refused by strict mode ("A plaintext row was found in an encrypted ledger"); 0 other failures. Those 20 prove strictness, not defects, but they are expected-fail in strict mode and are not run that way in CI.
- `qa/st24-active-ledger-browser.spec.mjs` in real Chromium: no plaintext in raw IndexedDB after encryption; reload shows the unlock gate; wrong passphrase refused; two tabs; **a tab killed mid-conversion (provably half converted) resumes to a fingerprint-identical encrypted ledger**. Added to the Playwright and device-engine configs so Firefox/WebKit/Edge run it in CI; no non-Chromium result is claimed here.

## Open before this may be called production-ready

1. Exact-commit CI including Firefox, Windows Edge and macOS WebKit for the new browser spec.
2. Real devices: Android Chrome, iOS Safari/PWA (storage eviction, background kill during conversion, low memory), low-spec Windows. **Performance at scale is unmeasured** (one conversion batch = 200 rows, sync crypto per row, full-ledger fingerprint passes before and after; a very large ledger needs a timing/memory budget and likely a progress/cancel UX review).
3. Independent security review of the threat model above, CSP/XSS posture (key bytes live in page memory), and the backup/receipt gate.
4. DEK rotation (credential compromise), encrypted-ledger schema-upgrade path, encryption of the residual `localStorage` items, and a policy for inactivity auto-lock (today: manual "Lock now", reload, or closing the tab).
5. Owner decisions: acceptance of the documented metadata leakage and in-memory-key trade-off; rollout (opt-in only is what is built); whether encrypted-ledger users may receive schema-changing releases.
6. Nothing here touches production data, Supabase, deployments or payments.
