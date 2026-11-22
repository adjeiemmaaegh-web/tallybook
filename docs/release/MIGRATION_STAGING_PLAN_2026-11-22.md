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

## 4. Decisions needed
- Staging target (a/b/c above). - Approval to apply, per migration or all six. - Whether 5 (payments ledger) is applied now or held until a provider is chosen (it is inert, but holds financial-record tables). - Backup/rollback window.
