# Tallybook V19 — FIN-002 posting-date validation continuation (12 October 2026)

**Release: NO-GO / INCOMPLETE.** Scoped local, read-only financial report integrity fix; neither a production accounting certification nor statutory tax verification.

## Baseline

Verified `TALLYBOOK_V19_FIN002_PERIOD_CONTINUATION_2026-10-12_SOURCE.zip` with SHA-256 `3d65e2661b38d35769b2987d5c5bb8a85510aa74afd14508ab78a6fd67b7e93f`, 1007 members. All previous source/evidence paths must remain in the new source archive. This is an import of source-only handover, NOT the original git history.

## Issue and fix

The financial period conservation helper used `Number.isFinite(Date.parse(createdAt))` to accept a posting timestamp. On the tested Node runtime, `Date.parse('2026-02-30T12:00:00Z')` normalizes February 30 to March 2; a historical misdated sale or receipt could be silently counted in a different day/period. `createdAt` on expense rows was not checked even though the manually selected `expenseDate` was.

- Validate saved sale, payment, debt repayment, reversal, cash return, prepaid transfer and **expense posting** datetimes as calendar-real ISO date-time strings, including a valid time and bounded UTC offset. Offset-qualified ISO, ISO fractions and legacy local ISO `YYYY-MM-DDTHH:mm[:ss]` are accepted for backwards compatibility, without fabricating a historical time zone.
- Validate manual `expenseDate` calendar dates in UTC calendar arithmetic rather than by local timezone rollover. Require both expense date and stored creation datetime, without inferring one from the other.
- Recheck dates in the independently callable daily-display allocator, so direct callers cannot silently group impossible timestamps if they bypass `summarizeFinancials`.
- Reject missing, ambiguous locale-formatted, date-only and normalized impossible `createdAt` evidence. Such historical records require authenticated reconciliation; saved history is not rewritten and no dates/times are invented.
- Updated TypeScript declarations, five new pure native tests and two future client Vitest regressions. Existing native fixtures now contain the required expense creation timestamps.

## Testing and limits

- Baseline Linux Node 22.16 suite: **449/449 PASS**.
- Final Linux Node 22.16/OpenSSL native suite: **454/454 PASS, zero fail/skip** (`artifacts/fin002-posting-date-2026-10-12/native-full.log`); focused tests **14/14 PASS**. One initial focused attempt failed because of an incorrect regex capture index for timezone offsets; the bug was corrected and the full suite rerun. Initial focused stdout is not archived.
- The 14 focused pure tests also pass with `TZ=Asia/Dubai` and `TZ=Africa/Accra` (14/14 each; `focused-dubai.log`, `focused-accra.log`). This is not a browser timezone QA matrix.
- Independent mock-only gateway: **4/4 PASS** (`mock-gateway.log`); no real payment.
- `node --check` on changed `.mjs` and isolated strict semantic `tsc` on `.d.mts`: **PASS**. Changed TypeScript/Vitest test syntax parsed; tests remain UNEXECUTED.
- Full repo `tsc --noEmit`: **FAILS due missing `node` / `vite/client` definitions**. Pinned Node 24/pnpm, real client Vitest/Dexie/IndexedDB, production build, browser/migrations and physical hardware checks **NOT RUN**. A native-only result cannot close FIN-002.

Full-history tax policy and jurisdiction compliance, unknown historical currency/cost/liabilities, wallet/debt/cash fully evidenced reconciliation, broader returns, crash recovery and all client/browsers remain open. Existing 82 acceptance units and 47 blocker statuses retained; `FIN-002` remains `missing`, release `NO-GO / INCOMPLETE`. No gateway, staging, deployment or live payment was authorized.
