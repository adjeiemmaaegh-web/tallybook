# Tallybook V19 — durable recovery journal byte-budget and company-clear postimage validation

**Date:** 11 October 2026. **Release:** NO-GO / INCOMPLETE.

## Scope

Resume exclusively from `TALLYBOOK_V19_CASH_RETURN_LEDGER_AUDIT_CONTINUATION_2026-10-11_SOURCE.zip` (SHA-256 `504187a8b4680c170e555718ee8edeeef9853148fb4d076444791138c56db9e7`). Preserve all existing financial, sale, inventory, authorization, and recovery features.

A durable backup/company-clear journal declared a 32 MiB resource cap, but tested `String.length`, which measures UTF-16 code units, not UTF-8 bytes. Large multibyte assistant content could exceed the declared byte budget before the journal was written or parsed. The new guard rejects input beyond the declared byte budget before parsing or saving, using a fast code-unit precheck followed by `TextEncoder`'s UTF-8 byte length.

Company-clear journals with a known `after` snapshot must show all three assistant collections empty; a malformed/nonempty postimage cannot claim to represent the authorized operation. Older journals without an `after` property remain parseable for compatibility; recovery still refuses to overwrite unexpected intervening edits.

## Evidence and limits

Two new native tests exercise oversized multibyte input for parse and serialization. One new native test checks valid and invalid company-clear postimages, including all three assistant collections. The pure guard changes neither the retail ledger nor assistant records, and is independent of a payment provider.

The 32 MiB budget is a **portable UTF-8 JSON bound**, not a measured IndexedDB quota or a promise of browser memory availability. No cross-tab global synchronization is provided. A full recovery release still requires real IndexedDB tests, physical browser-interruption/quota tests, migration/restore evidence, pinned TypeScript/Vitest/Vite/Playwright checks, and design of cross-tab coordination.

**Safety:** No refund UI posting, live charge, external deployment or staging authorization. The 82 acceptance units and open critical blockers remain tracked.
