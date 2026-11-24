# ST24-05: encrypted-ledger schema upgrade

**Problem.** Each sealed row stores, next to its encrypted body, copies of its indexed fields (clear for non-sensitive indexes, HMAC-blinded for sensitive ones) projected for ONE Dexie schema. Reads verify those copies against the body. If a newer Tallybook opens the ledger at a schema that adds an index, (a) IndexedDB builds the new index from rows that have no such copy (silently empty results) and (b) every row whose record has a value for the new field fails its read-time integrity check. Until now the app therefore refused to open an encrypted ledger after any schema change ("schema-mismatch").

**Fix (`upgradeEncryptedLedger`).** On start, `prepareLedgerSecurity` compares the key record's `schemaVersion` with the schema this build declares (`db.verno`), **without opening the database**:
- record older + state `encrypted` -> `schema-upgrade`: the unlock screen asks for the passphrase or recovery code once ("Update and unlock").
- record newer -> `schema-mismatch` (no downgrade).
- record older but an encryption change was interrupted (`migrating` / `decrypting` / `rekeying`) -> `schema-mismatch`: finish it in the previous version, or restore.

Upgrade order (all inside the exclusive cross-tab data lock):
1. Credentials are checked first; a wrong passphrase changes nothing (key record and database version unchanged).
2. Durable marker `upgradingTo = <new schema>` is written to the key record (compare-and-swap).
3. The key is unlocked and the seal enters `reprojecting` (index copies of not-yet-re-projected rows are not compared; every body is still AEAD-authenticated, bound to table and primary key). The database opens at the new version; Dexie upgrade functions run **through** the seal (verified empirically: Dexie routes upgrade reads/writes through DBCore middleware), so they decrypt and re-seal.
4. Bodies are fingerprinted, every row in every sealed table is re-sealed (index copies now match the new schema), `reprojecting` is switched off, every row is re-read with **strict** index verification and fingerprinted again (must be identical), and the raw store is scanned (no plaintext rows, no unblinded sensitive index values).
5. Only then is `schemaVersion` advanced and the marker cleared. A crash anywhere leaves the old version + marker; the next start offers the update again and finishes it (re-sealing is idempotent; the key never changes).

**Evidence (PR #111 branch).** `st24SchemaUpgrade.test.ts` (5 tests, simulated next schema adding a clear index on an un-indexed field, a back-filled new field via an upgrader, and a new index on a table no upgrader touches): detection without opening; wrong passphrase changes nothing; upgrade, new indexes answer, blinded index still works, nothing readable at rest; crash mid-re-projection detected and finished with the recovery code; newer-release and interrupted-change refusals; no-op when current; key rotation after an upgrade. Deliberate breaks, each caught: no relaxed reads (upgraders fail), no re-projection (rows refused with an integrity error), no durable marker, accepting interrupted changes, not advancing the version, allowing downgrade, disabling the gate. UI: older ledger -> "Update your encrypted records" -> app opens; newer ledger -> refusal. Full client suite 276 files / 2169 tests; forced-encrypted 2115 pass / 54 skipped / 0 fail.

**Limits.** Simulated in fake-indexeddb and jsdom; real browsers/devices not yet exercised for an actual schema bump (the next real bump should include a browser spec). A schema change that removes an index leaves the old index copy in stored rows until they are next written (no new exposure: those copies existed before). Recovery-package import of an orphaned ledger still records the current schema.
