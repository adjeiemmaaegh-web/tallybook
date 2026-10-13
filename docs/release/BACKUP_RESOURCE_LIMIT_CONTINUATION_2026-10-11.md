# Tallybook V19 — local backup resource safety continuation

**Date:** 11 October 2026. **Release:** NO-GO / INCOMPLETE.

## Starting baseline and scope

Verified `TALLYBOOK_V19_RECOVERY_JOURNAL_BOUND_CONTINUATION_2026-10-11_SOURCE.zip`, SHA-256 `57391473acb3797d245250fc107bb0296918a6888098a86c2b8ff8a646227be0`, 857 source/evidence paths. No old work, data or historical acceptance decisions were removed.

The existing restore screen read a selected file entirely before checking resource use. The backup and encrypted-backup parsers accepted unbounded input, and ciphertext base64 could be decoded and decrypted without a decoded-length guard. These are high-memory failure and denial-of-service risks, particularly on inexpensive offline Windows devices. A backup has no permission to bypass local resource limits.

## Implementation

- Added a pure, dependency-free UTF-8 byte-budget checker that handles ASCII, multibyte code points, surrogate pairs and unpaired surrogate replacement without allocating a second large encoding buffer.
- Capped local JSON backups at **64 MiB of UTF-8 data** and encrypted envelopes at **96 MiB**; the encrypted size accommodates base64 overhead and remains below the existing connected-recovery 100 MiB package limit. Limits are intentionally conservative, **not** measured device capacity.
- The restore screen now rejects oversized `File.size` metadata before `File.text()`; `parseBackup` checks bytes before `JSON.parse`; encryption checks before PBKDF2/AES; decryption checks the wrapper before JSON parsing, expected ciphertext base64 length before decoding, and authenticated plaintext bytes before UTF-8 decoding.
- Backup exports never silently drop sales or other records to fit these limits. If they exceed the limit, the operation returns a readable error and leaves saved data unchanged. The prior file format, salt/IV/key derivation, and AES-256-GCM behavior are not changed.
- Added eight native regression tests: UTF-8 edge cases, large multibyte JSON, file-size metadata, envelope headroom, actual WebCrypto roundtrip and wrong key, malformed structures, pre-encrypt bound, excessive ciphertext. Also added an unexecuted client Vitest size regression.

## Executed evidence

Full available Linux Node 22.16.0/OpenSSL native suite **344/344 passed**, zero failures/skips (previously 336). Isolated payment-gateway mock suite **4/4 passed**. Changed TS/TSX/TS declaration syntax parsed and isolated strict semantic checking for `backupCrypto.ts` plus the new size-limit declaration passed. Node byte-limit and actual WebCrypto tests executed with `--experimental-strip-types`. `tsc --noEmit` failed because the required `node` and `vite/client` typings are absent. Pinned Node 24/pnpm frozen install, Vitest, Vite build, Chromium, real IndexedDB, device memory and large-backup browser testing were **not run**. Raw command logs and exit statuses are retained in `artifacts/continuation-2026-10-11-backup-resource-limits/`.

## Remaining acceptance boundaries

This guard does not guarantee large-data usability or low RAM operation, and the new size ceilings may prevent importing an otherwise valid legacy archive bigger than those ceilings; never split an interdependent financial ledger arbitrarily. A future approved streaming import, explicit quota policy, full restore/recovery matrix and measured low-spec Windows tests remain required. No external staging or provider was used. The UI cash-return flow remains read-only and full DATA-001/002, FIN, SEC and other P0/P1 release blockers remain open. **Production remains NO-GO.**
