# V54 isolated QA sale-pull cursor repair

Date: 2026-10-30. Status: **source-only QA repair; NO-GO for production**.

The browser previously used `localeCompare` for operation IDs, while the QA SQL used the database's default collation. A shared timestamp with punctuation in operation IDs could yield different ordering and make pagination reject a valid page or skip an event. The browser now compares restricted ASCII IDs by code unit. The V50 source and a forward-only V54 replacement RPC use PostgreSQL `COLLATE "C"` for cursor comparison, row numbering, page ordering, and next-cursor selection. The V54 script requires the existing V50 RPC and changes no stored sale rows.

Verification at this checkpoint: 12 focused Node tests passed, including an in-memory PostgreSQL page/cursor test; TypeScript `tsc --noEmit` passed; Vite/PWA client build passed. The `pnpm check` wrapper could not start because Corepack attempted to download pnpm while registry DNS was unavailable; the checked-in dependency installation's `tsc.cmd` ran successfully instead. The QA schema was **not applied** and the signed pull route remains disabled. Existing full-suite results belong to earlier commits and are not exact-head evidence for V54.

Still required: real owner and attendant Auth users, approved-device enrollment, live isolated QA authorization and paging checks, signed upload and lossless second-device reconciliation, historical backup restore, Windows/Android acceptance, and deferred GitHub Linux validation. Do not promote the QA RPC or function to production without a separate security review.
