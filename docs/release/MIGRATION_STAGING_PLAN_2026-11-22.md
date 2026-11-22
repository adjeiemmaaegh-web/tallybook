# Six unapplied migrations: evidence and staging-first plan (2026-11-22)

**Nothing here was applied.** Production and staging were only read (migration list and `SELECT` catalog checks). Applying anything is an owner decision.

## 1. Evidence: repository vs hosted

| | Repository | Production "Tallybook" (`qfyydfxwvifdvffdfgeu`, ACTIVE) | "Tallybook V19 Sync Test" (`lmneuqxfyxplrxjswpma`) |
|---|---|---|---|
| Migrations | 43 files | 37 applied | **INACTIVE (paused): state NOT readable.** Reading it would need a restore, which is a hosted change; not done. |

Matching by name (the connector records its own timestamp, so versions differ by design; see `supabase/MIGRATION_HISTORY.md`), **exactly six** repository migrations are absent from production, matching the report. Production has 0 branches.

Read-only catalog checks on production: none of `cc_*` / `payment_*` tables exist; none of `tallybook_cc_platform`, `tallybook_cc_discover`, `tallybook_payment_ledger`, `tallybook_shop_shift_reconciliation`, `private.shop_shift_reconciliation` exist; trigger `shop_public_order_quote_evidence` absent. So there is **no partial application** to repair. Every prerequisite the six reference exists (`businesses`, `business_members`, `shop_sales`, `shop_refunds`, `shop_sale_tenders`, `shop_ledgers`, `shop_customer_entries`, `shop_products`, `shop_online_order_lines`, `shop_public_order_requests`, `shop_staff_shifts`, `private.shop_member_role`, `private.shop_int`, `private.shop_uuid`, `public.tallybook_active_session_proof`, `private.set_cloud_business_type`). Production holds 3 businesses and 1 shop sale (row counts only).

## 2. The six, in dependency order

| # | Migration | Creates / changes | Depends on | Rollback script | Rollback behaviour |
|---|---|---|---|---|---|
| 1 | `20261117052213_business_type_active_session` | replaces `private.set_cloud_business_type` (adds active-session proof check) | live function + session proof | `rollback/…_down.sql` | **Refuses** (would restore a revoked-session bypass). Forward repair only. |
| 2 | `20261117060608_guest_order_price_snapshots` | `private.shop_public_order_quote_guard` + trigger on guest requests | `shop_public_order_requests`, order lines | yes | **Refuses** (would remove protection). Forward repair only. |
| 3 | `20261120090000_connected_commerce_platform` | `cc_*` tables, `tallybook_cc_platform`, kill switch, outbox | `businesses`, `business_members` | yes | Drops objects; check the script's evidence guard before use. |
| 4 | `20261121090000_connected_commerce_discover` | `cc_discover_*`, two RPCs, alters `cc_outbox` constraint | **#3** | yes | Needs #4 reverted before #3. |
| 5 | `20261121120000_payment_settlement_ledger` | `payment_intents`, `payment_events`, RPCs, append-only triggers | `businesses` | yes | **Fails closed once any intent/event exists**; forward repair only after that. |
| 6 | `20261121150000_shift_cash_reconciliation` | read-only `tallybook_shop_shift_reconciliation` | `shop_staff_shifts`, sales, refunds, tenders, ledgers | yes | Drops two functions; no data. |

Order constraints: **3 before 4** (hard). 1 and 2 are independent repairs of existing behaviour and are the highest value (they close authorization/pricing gaps). 5 and 3/4 add new tables and are inert until enabled (payments stay off; Connected Commerce flags default off). 6 is read-only.

## 3. Staging-first execution plan (owner-run)

0. **Decide the staging target.** The only other project is paused. Options: (a) owner restores "V19 Sync Test", (b) create a Supabase branch of production (`list_branches` is empty), (c) a new disposable project. Staging must first be brought to the same 37-migration baseline and diffed against production function bodies (the 2026-11-15 note says they matched).
1. **Pre-flight (production, read-only):** re-run the name diff; confirm backups (PITR/dated dump) and record the time; confirm no other writer is mid-deploy.
2. **Staging apply, one at a time, in order 1→6.** After each: run the PGlite assertions for that migration (already green in the repo: `pnpm test` native suites incl. `qa/payment-settlement-ledger-pglite.test.mjs`, guest-order and active-session tests), `get_advisors` security and performance, and call each new RPC as owner, as a non-member, and as anon (expect refusal).
3. **Staging soak:** run the repo's guarded rollback for #6, #5 (empty), #4, #3 to prove the rollbacks, then re-apply. Confirm #1/#2 refusals are intended.
4. **Staging acceptance:** sale → payment intent → signed sandbox webhook → reconcile; Discover request with consent withdrawal; shift reconciliation against a real shift; guest request repricing attempt rejected.
5. **Production apply** only after written approval, in a quiet window, same order, with the advisor check and a smoke after each. Stop on the first anomaly; do not "fix forward" without a reviewed migration.
6. **Post-apply:** update `MIGRATION_HISTORY.md` with the recorded hosted versions; keep Discover/payments/commerce flags **off**.

## 3b. Owner decision recorded: new, isolated Supabase staging project
Approved: a **new project separate from production** (not the paused "V19 Sync Test", not a branch of production). Approved for preparing and testing the plan; **hosted execution is not approved yet.**

**What I prepared and ran (all local, nothing hosted):**
- `scripts/staging-guard.mjs` (+ `qa/staging-guard.test.mjs`, 6 tests): refuses the production project ref (and any in `PRODUCTION_PROJECT_REFS`), computes the exact missing-migration list by name (**exactly the six** against the production list read on 2026-11-22; a brand-new empty project needs all 43 in order), and prints a **read-only** SQL check that staging contains only synthetic data. Its plans are never executable.
- `qa/staging-six-migrations-rehearsal.test.mjs` (4 tests, real PostgreSQL engine via PGlite): applies the 37-migration baseline, then the six in order; customer table counts are identical after every step; Discover fails without the platform; the four additive migrations roll back cleanly (newest first) with data unchanged; the two security repairs **refuse** to roll back and leave everything intact; the four re-apply and recover; once a payment intent exists the payments rollback refuses and the evidence stays, and reconcile is clean.

**Staging contains no live customer data: how it is confirmed (owner-run on the new project):**
1. Create the project; record its ref; run `node scripts/staging-guard.mjs plan <ref> <names-file>` (refuses production).
2. Apply the 37-migration baseline, then run `node scripts/staging-guard.mjs no-live-data-sql` on staging and expect `non_synthetic_businesses = 0` and `non_synthetic_users = 0`. Convention: synthetic businesses start with `STG `, users end with `@staging.tallybook.invalid`. Production's own shape (3 businesses, 1 sale, real accounts) would fail this check.
3. Never restore a production backup into staging; load synthetic fixtures only.

**Exact operation needing your authorization (not yet given):** creating the staging project and applying the baseline + six migrations to it (staging only), in the order above, with advisor checks after each. Production application is a separate, later approval.

## 4. Decisions needed
- ~~Staging target~~ decided: new isolated project. - Approval to create it and apply (staging only), per migration or all six. - Whether 5 (payments ledger) is applied now or held until a provider is chosen (it is inert, but holds financial-record tables). - Backup/rollback window.


## 5. Cost and provisioning status (2026-11-22, later)
- Organization "adjeiemmaaegh-web's Org" is on the **Free** plan (read-only check). It has 3 projects: production "Tallybook" (active), and two paused (V19 Sync Test, Cashflow-app).
- A new project in `eu-west-2` would be the **second active project**. Free-plan limits (to verify in the dashboard before provisioning): a small fixed number of active projects, projects pause after a period of inactivity, and no point-in-time recovery or daily backups. If the limit is exceeded, or you want backups/PITR for staging, the project would be a **paid** project: the exact monthly figure must be confirmed in the Supabase dashboard (I have no tool that quotes it).
- **Not provisioned.** I am waiting for your cost confirmation. Nothing hosted was created or changed.
