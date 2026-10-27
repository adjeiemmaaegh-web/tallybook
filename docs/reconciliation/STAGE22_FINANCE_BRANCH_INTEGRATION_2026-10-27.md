# Stage 22 finance branch integration — 2026-10-27

## Source and decision

- Verified development baseline: `development/v19-unified-reconciliation` at `2f60d19a8847606c02e1ed75c6aa1e058b1262b7`.
- Additional source: `v19/stage22-finance-completion-20261017` at `a2c445f0f1eee41bcfb9926991ff9c23e77e88c6` (53 commits outside the baseline ancestry).
- Current GitHub `main` before integration: `1d772d70163ce4b01d95f325321b64e651d17a81`.
- Merge performed in a separate local review worktree. Both source histories remain available; no existing branch was deleted.

The finance branch added stronger supplier liability chronology, customer debt allocation checks, wallet journal validation, historical inventory costing checks, and partial cash-return constraints. Its direct merge failed focused tests. The current merge retains these checks where they match the current schema, while preserving company-scoped operation keys and legacy unknown financial evidence.

## Conflict resolution

| Area | Resolution |
|---|---|
| Repayments, wallet transfers, full reversals and partial cash returns | Use the existing unique `[businessProfileId+submissionKey]` Dexie indexes. A key may be reused by an independent company; retries within one company are audited against saved ledger evidence. |
| Supplier payable history | Validate recognition and settlement chronology, tender, currency and safe integer conservation. Historical receipts without saved currency or timestamp and without liability events remain `unknown`; a posting against such a receipt fails closed. No historical transaction is rewritten. |
| Customer receivables | Require one company/customer and verified currency for attributed sale allocations. Reversals and payments remain separate signed entries. Existing synthetic tests were updated to include the identities now required by the ledger contract. |
| Cash returns | Preserve owner/cashier authorization, return policy, physical stock and FIFO checks, and the current per-company idempotency index. |
| Inventory cost | Retain saved batch links and stronger money bounds; never substitute current cost for missing historical cost evidence. |

## Automated evidence

- Clean baseline at `2f60d19`: TypeScript and production build passed; native QA 429/429; focused server 30/30; Chromium auth 4/4, release 3/3 and offline 3/3; full client Vitest 1,025/1,025 in 130 files.
- Merge candidate: TypeScript passed; Vite production build passed; finance client focus 58/58; native QA 435/435 with Windows symlink/disposable Git fixture permissions. Logs are retained in the workspace `evidence/` directory and will be packaged with the final source.
- Full merged-client suite is running. Its result must be recorded before this merge is accepted.

## Open release gates

This code integration does not establish production readiness. The existing `OUTSTANDING_READINESS_BLOCKERS.md` and `UNIFIED_12_STAGE_REGISTER.md` govern cloud account binding and RLS acceptance, Linux optional-sync security tests, real backup migration, Watchdog contract coverage, and Windows/Android acceptance. No hosted deployment or live payments are authorized by this code merge.
