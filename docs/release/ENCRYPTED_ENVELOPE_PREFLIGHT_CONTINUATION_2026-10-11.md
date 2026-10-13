# Tallybook V19 — encrypted backup envelope preflight continuation

**Date:** 11 October 2026. **Release decision:** NO-GO / INCOMPLETE. **Scope:** tighten existing `DATA-008` backup import safety only; do not treat this as full backup or client certification.

## Verified starting point

Continued from `TALLYBOOK_V19_BACKUP_RESOURCE_CONTINUATION_2026-10-11_SOURCE.zip` (SHA-256 `be7637a870ae9273941a70fba7e48f13a311d0e68394a32c5a237b6be5015c73`, 872 members). Previous source and tests are preserved.

## Identified failure and changes

The previously added envelope byte cap limited total file size and ciphertext base64 length, but `decryptBackupText` still decoded `salt` and `iv` via `atob` and allocated typed arrays **before** validating their lengths. A malformed envelope fitting within the 96 MiB cap could carry enormous salt/IV strings and consume memory unnecessarily. The decrypting `TextDecoder()` was also non-fatal: if an authenticated ciphertext contained non-UTF-8 plaintext bytes, JavaScript would silently replace them with U+FFFD and might produce a valid but modified JSON record.

The code now validates the fixed-length salt and IV base64 representation *before* decoding, checks canonical decoded salt/IV values, checks ciphertext alignment/base64 alphabet/padding and minimum 16-byte GCM tag before deriving a PBKDF2 key, and retains the existing 64 MiB JSON and 96 MiB envelope limits. The decoded ciphertext length is explicitly bounded. After successful AES-GCM authentication, strict `TextDecoder('utf-8', { fatal: true })` rejects malformed UTF-8 without producing modified backup text. No financial rows are modified or truncated when rejected. The `encrypted-v1` format, 310,000 PBKDF2-SHA256 iterations, AES-256-GCM and all regular-backup encryption output remain unchanged.

## Executed verification

- `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs`: **347/347 passed, 0 failed/skipped** (up from 344); `artifacts/continuation-2026-10-11-envelope-preflight/native-qa.log`.
- `node --test server/tests/paymentGateway.test.mjs`: **4/4 passed**, local mock only; `.../mock-payment.log`.
- Three added *actual WebCrypto* native regression tests reject large malformed salt/IV fields, malformed ciphertext, and authenticated invalid UTF-8 bytes, while existing roundtrip/wrong-key/oversize tests still pass; `.../focused-crypto.log`.
- Isolated `tsc --strict --noEmit` for the encryption module and backup limits declaration: **passed**; `.../isolated-semantic-tsc.log`.
- Changed TypeScript source and test syntax: **parsed**, node test file syntax passed; `.../syntax.log`.
- Repository-wide `tsc --noEmit` **failed** due to missing installed `node` and `vite/client` type definitions; `.../repository-semantic-tsc.log`.
- Pinned Node 24, pnpm dependencies, client Vitest/real IndexedDB, Vite production build, Playwright/offline/browser/hardware tests **not run**. This code remains implemented-unverified for client integration and production.

## Remaining gates

`DATA-008` stays `implemented-unverified`; 82 acceptance units and all existing issue IDs remain. `DATA-001`/`DATA-002`, full financial refunds, cross-tab crash recovery, exhaustive staff authorization, cloud/store/payment/staging/hardware checks and all full-release critical gates remain unresolved. The cash-return Sales UI is strictly read-only; this change enables no external payment, deployment or destructive work. No staging/provider authorization was provided.
