# Database migration handoff: Claude Code -> ChatGPT (2026-11-24)

**Ownership:** ChatGPT now owns all Supabase migration assessment, sequencing, execution, verification, rollback validation and reporting. Claude Code will not apply anything to hosted databases. Claude Code may add migration SQL that its features need, and will list it here with dependencies and instructions.

## 1. Hosted state at handoff (read-only facts)
| Project | Ref | Region | State |
|---|---|---|---|
| Production "Tallybook" | `qfyydfxwvifdvffdfgeu` | eu-west-2 | ACTIVE. 37 migrations applied (names match the repository; versions differ because the connector records its own timestamps, see `supabase/MIGRATION_HISTORY.md`). **The six below are NOT applied.** Never touched by Claude Code beyond read-only `SELECT`/listing. |
| **Staging "Tallybook Staging"** | `yfbtwuptiudmeferjgko` | eu-west-2 | Created 2026-11-22 by Claude Code on the owner's approval, Free plan, quoted $0. Verified empty at creation (0 users, 0 public tables). **Partially migrated: see 1a.** |
| "Tallybook V19 Sync Test" | `lmneuqxfyxplrxjswpma` | eu-west-2 | Paused; state unread. |

### 1a. Staging is half-started: exactly what happened
- Applied: **only** `restrict_rls_helper` (repository migration #2), recorded as hosted version `20261123144342`. It is a conditional no-op (`revoke` on `public.rls_auto_enable()` only if that function exists), so it changed nothing.
- **Not applied:** migration #1 `business_identity`. The `apply_migration` call timed out after 230 s because the Supabase server asked the owner a question (most likely its destructive-statement confirmation: the file contains `revoke` and a `delete` inside a function body) and no answer arrived. Read-only check afterwards: `public.businesses` and `private.create_owned_business` do not exist.
- Consequence: staging's history lists #2 before #1. Harmless (no-op), but you may prefer to recreate staging or re-apply #2 after #1 for a clean history. Your call.
- Nothing else has been applied anywhere.

## 2. Repository chain to apply (43 files, `supabase/migrations/`, apply in filename order)
Baseline = files 1-37 (identical in name to production's 37). Then the six:

| # | File | Depends on | Rollback (`supabase/rollback/<name>_down.sql`) |
|---|---|---|---|
| 38 | `20261117052213_business_type_active_session` | live `private.set_cloud_business_type`, `public.tallybook_active_session_proof` | **refuses** by design (forward fix only) |
| 39 | `20261117060608_guest_order_price_snapshots` | `shop_public_order_requests`, order lines | **refuses** by design |
| 40 | `20261120090000_connected_commerce_platform` | `businesses`, `business_members` | drops objects; fails closed once any consent/audit/outbox/operation-key/verification row exists |
| 41 | `20261121090000_connected_commerce_discover` | **#40** (hard dependency, proven) | drops objects; revert before #40 |
| 42 | `20261121120000_payment_settlement_ledger` | `businesses` | fails closed once any payment intent/event exists |
| 43 | `20261121150000_shift_cash_reconciliation` | `shop_staff_shifts`, sales, refunds, tenders, ledgers | drops two read-only functions; always safe |

## 3. Local evidence you can re-run (no hosted access needed)
- `node --test qa/staging-six-migrations-rehearsal.test.mjs`: real PostgreSQL engine (PGlite). Applies the 37 baseline, then the six in order; customer table counts unchanged at every step; Discover refuses without the platform; #40-#43 roll back newest-first and re-apply; #38/#39 rollbacks refuse; payments rollback refuses once evidence exists.
- `node --test qa/staging-guard.test.mjs` and `node scripts/staging-guard.mjs plan <ref> <names-file>`: refuses the production ref, computes missing migrations by name (exactly the six against production), prints a read-only "synthetic data only" check (`no-live-data-sql`).
- Per-migration suites: `qa/payment-settlement-ledger-pglite.test.mjs`, `qa/connected-commerce-platform-pglite.test.mjs`, `qa/connected-commerce-discover-pglite.test.mjs`, `qa/migration-rollbacks.test.mjs`, guest-order and active-session tests.
- Full native suite as CI runs it: `node --experimental-strip-types --test scripts/historical-costing-check.mjs qa/*.test.mjs qa/*.test.cjs server/tests/*.test.mjs` (1372 pass / 0 fail on `d83b788`).

## 4. Suggested verification after each staging step (your plan governs)
1. `get_advisors` security and performance. 2. Call each new RPC as owner, non-member and anon (expect refusals for the latter two). 3. Row counts of pre-existing tables unchanged. 4. For the 37 baseline, compare `pg_get_functiondef` hashes between staging and production (read-only on production) to prove identical definitions. 5. Synthetic data only: businesses named `STG ...`, users `@staging.tallybook.invalid`.

## 5. Owner approvals on record (from the owner's messages)
- Staging: approved to create in eu-west-2 on the Free plan ($0) and apply 37 + 6 **to staging only**, with synthetic data.
- **Production database changes need completely separate authorization.** Production remains NO-GO.

## 6. Future migrations from Claude Code
None pending at handoff. Any new SQL will be added under `supabase/migrations/` with a `_down.sql`, a PGlite test, and an entry in a new section of this file.
