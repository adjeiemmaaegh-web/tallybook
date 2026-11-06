# Stage B — Protected shared-shop queue: recovery and acceptance protocol

**Status:** Source implemented on draft branch, focused CI passed. **NOT accepted for production.**

## Scope and nonclaims

This opt-in vault protects **pending shared-shop sale payloads** stored in IndexedDB after the user chooses a passphrase. It encrypts product line IDs, quantities, tender references and queued human-readable summaries using PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM. Every ciphertext is bound to the account, company and submission key; nonces are randomly generated and the decryption key is never stored persistently. The IndexedDB metadata (account/company identifiers, submission key and queue timestamp) remains visible.

It does **not** encrypt the separate device-local Tallybook ledger, offline catalogue/product or stock cache, or old unprotected queued sales. It is not proof of protection from malicious JavaScript, compromised operating systems, lost passphrases, browser storage eviction or a physically compromised unlocked device.

## Controlled activation

1. On the correct authenticated account and business, finish or review every pending/rejected shared-shop sale. The activation code verifies the queue is empty; it never deletes or transparently rewrites an existing plaintext transaction.
2. Close older Tallybook tabs and make an encrypted backup of unrelated device-local books separately.
3. In Shared shop > Sell > Offline sales protection, choose a unique strong passphrase (minimum 12 characters) and confirm.
4. Verify the protected state, then make a disposable sample offline sale, disconnect and reopen. Confirm the queue requires unlocking and retains the exact submission key after unlocking.
5. If any error occurs, **do not clear browser storage**, reinstall or re-key the queue until its evidence is preserved and reviewed.

## Existing plaintext pending-sales migration (draft branch only)

**Never delete or automatically convert unresolved historical sales.** An explicit
two-step workflow is now authored for owners with nonempty unencrypted queues.

1. Close old app tabs, stop checkouts and choose **Protect existing unsent sales (backup required)**.
2. Enter a strong migration passphrase twice and download the encrypted pre-migration recovery JSON. This step DOES NOT modify the original IndexedDB queue.
3. Save the file and passphrase securely. The application requires the saved file to be **reuploaded** before continuing.
4. It authenticates the backup passphrase and verifies **every pending or rejected sale** against the current original records. If a new sale was added after the backup, migration aborts and the plaintext queue remains unchanged.
5. It encrypts and self-verifies all sale payloads *before* the write transaction, then rechecks source rows. Replacement of all rows and installation of the vault descriptor occur in the **same IndexedDB transaction**. Any changed row or failed transaction aborts the conversion.
6. Reload and unlock using the same passphrase, and inspect exact original submission keys and statuses. Keep the encrypted recovery file until independent off-device restore has been tested.

A downloaded file must be independently saved and protected; selecting the button does not prove operating-system persistence. The migration does not encrypt the separate device-local ledger or product catalogue. Old-version tabs cannot participate in the new transaction barrier, so close them first. The migration is not approved for production or commercial use without hardware, storage-pressure, interruption and cross-device QA.

## Encrypted recovery file

1. In the **unlocked** protected queue, stop recording new transactions and choose **Export encrypted recovery file**.
2. Keep the JSON backup private, alongside the passphrase in a *separately secured* location; a backup without the passphrase cannot decrypt data.
3. On another device, sign into the **same Supabase user and same business**. The target must not already have an offline queue or vault for that account/business. Choose **Restore an encrypted recovery file**, select the file, and provide the same passphrase.
4. Restore validates file structure, account/company scope, every authenticated ciphertext, nonduplicate keys and empty target before committing all records in one IndexedDB transaction.
5. Inspect the returned pending sale list. When connected, replay uses the **original submission keys** and server idempotency; existing server records should replay rather than double-post.

Never import into an account with existing pending sales. Restore does not merge, overwrite or silently discard data. Reconciliation of the restored queue with the server is required before commercial trust.

## Acceptance cases (automated, plus owner-required device tests)

| Case | Expected |
|---|---|
| Fresh empty queue activation | Encrypted descriptor created, no plaintext queued sales |
| Existing pending or rejected sale | Activation refused; original sale remains intact |
| Unauthenticated/foreign user or company | Cannot unlock or restore |
| Wrong passphrase, changed ciphertext or metadata | Failed verification; records retained |
| Reload, lock, account switch and leave Sell screen | Key not persistently available; user must unlock |
| Lost connection, retry, concurrent same submission key | Same key; server decides one authoritative result |
| Export/import on new empty same-account browser | Atomic recovery; all original sale keys preserved |
| Import into nonempty queue, mismatched scope, forged/corrupt backup | Rejected without altering target |
| Storage quota failure, browser eviction, blocked legacy localStorage | No network send before durable write; no cleanup of evidence |
| Two tabs across update versions, different devices, physical Windows/Android/iOS browsers | **Manual QA REQUIRED** |
| Exported backup vs live queue changes during export | Stop checkout for consistent snapshot |
| Existing local ledger, payments, POS data | **Out of this vault scope, not encrypted by it** |

## Release gates still open

- Existing-queue encryption migration and mandatory encrypted backup flow are authored; **real hardware, quota, interruption and recovery acceptance still outstanding**.
- Real-device storage/quota/restart and cross-tab testing, independent security review, and full release CI.
- Separate encryption-at-rest design for the local business ledger and appropriate cached catalogue data.
- Review commercial privacy and retention requirements for each jurisdiction.
- No merge, production database migration, payment operation or external deployment authorized by this protocol.
