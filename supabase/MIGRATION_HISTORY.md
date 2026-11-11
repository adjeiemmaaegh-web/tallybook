# Migration history: repository vs the hosted projects

**New source-only development migration:** `20261111180000_shop_staff_shifts_audit.sql` adds cloud shift openings, closings, manager review and the owner activity audit RPC. It is committed for isolated PostgreSQL testing but is **not** authorized/applied to production. Its rollback removes stored shift/event history. Do not run against a live store without separate release and migration approval.


Checked on 2026-11-10 against the two Supabase projects.

## Production ("Tallybook")

Eight of the migrations were applied through the Supabase connector, which records its own timestamp as the version instead of the repository file's. The SQL is identical; only the recorded version and name differ.

| Hosted version (production) | Repository file |
|---|---|
| 20261013123347 … 20261105120712 (first eight) | same version and name |
| 20261110110434 `shop_refund_policy` | `20261106120000_shop_refund_policy.sql` |
| 20261110110609 `invite_24h` | `20261106130000_invite_24h.sql` |
| 20261110110626 `shop_stage_c_read_models` | `20261108100000_shop_stage_c_read_models.sql` |
| 20261110110705 `shop_stage_d_stock_workflows` | `20261108110000_shop_stage_d_stock_workflows.sql` |
| 20261110110806 `shop_stage_d_purchase_payables` | `20261108120000_shop_stage_d_purchase_payables.sql` |
| 20261110110840 `shop_stage_d_online_orders` | `20261108130000_shop_stage_d_online_orders.sql` |
| 20261110110901 `shop_purchase_order_read_model` | `20261109010000_shop_purchase_order_read_model.sql` |
| 20261110110905 `shared_order_lines` | `20261109020000_shared_order_lines.sql` |
| 20261110134316 `shop_sales_hot_path_indexes` | `20261110120000_shop_sales_hot_path_indexes.sql` |
| 20261110134347 `shop_sales_search` | `20261110130000_shop_sales_search.sql` |
| 20261111021126 `shop_product_details` | `20261110140000_shop_product_details.sql` |
| 20261111021150 `shop_daily_report` | `20261110150000_shop_daily_report.sql` |
| 20261111064900 `shop_attendant_stock` | `20261111100000_shop_attendant_stock.sql` |
| 20261111065003 `shop_customer_archive` | `20261111110000_shop_customer_archive.sql` |
| 20261111065040 `shop_join_codes` | `20261111120000_shop_join_codes.sql` |
| 20261111065118 `shop_expenses` | `20261111130000_shop_expenses.sql` |
| 20261111065155 `shop_refund_requests` | `20261111140000_shop_refund_requests.sql` |
| 20261111070921 `shop_profit_report` | `20261111150000_shop_profit_report.sql` |
| 20261111100842 `shop_quotations` | `20261111160000_shop_quotations.sql` |
| 20261111100923 `shop_accounts` | `20261111170000_shop_accounts.sql` |

After applying the last two, the definitions of `shop_stage_g_product_action`, `shop_stage_h_daily_report`, `shop_record_sale`, `shop_refund_sale` and `tallybook_shop_ops` in production were compared (md5 of `pg_get_functiondef`) with the repository chain replayed in a scratch database: all five identical.


### Using the Supabase CLI against production

The CLI compares the versions in `supabase/migrations/` with the hosted history, so the mismatch above makes `supabase db push` want to re-apply files that are already live. Do not rename the repository files (tests and documents refer to them). Instead, align the hosted history once. These commands have **not been run**; try them first on a copy of the database:

```bash
# For each row in the table above where the versions differ, mark the hosted version reverted and the repository version applied.
supabase migration repair --status reverted 20261110110434
supabase migration repair --status applied  20261106120000
# ...repeat for the other ten rows...
supabase migration list    # local and remote columns should now match
```

`migration repair` only edits the history table; it does not run any SQL.

From then on, apply new migrations with `supabase db push`, which records the file's own version, and the mismatch does not come back.

## Test project ("Tallybook V19 Sync Test")

It is **behind production**. It has the base migrations (under its own test-era names) and `shop_refund_policy`, and is missing everything after it:

`invite_24h`, the stage C, D (stock, purchasing, online orders), purchase-order list and order-lines functions, the sales indexes and search, and (once applied to production) product details and the daily report.

Until it is brought up to date it cannot be used to rehearse a production upgrade. The disposable PostgreSQL tests in `qa/` (they apply the whole chain, every rollback, and re-apply) are the stand-in. To bring it up, apply the missing files in repository order, oldest first, and verify with `supabase migration list`.

## Rollbacks

See [rollback/README.md](rollback/README.md). Every migration from `20261106120000` onward has a rollback script, and `qa/migration-rollbacks.test.mjs` rolls the whole chain back and forward again.

Check after applying the tier 4 set: a hash of every shop function's definition in production was compared with the repository chain replayed in a scratch database. 29 of 32 are byte-identical; the other three (`shop_refund_policy_action`, `shop_stage_c_action`, `shop_stage_f_sales_search`, applied earlier) differ only in SQL comments, and are identical once comments and whitespace are removed.

Applied to production on 2026-11-11: `20261111160000_shop_quotations.sql` then `20261111170000_shop_accounts.sql`. The router, `shop_account_components`, `shop_account_net` and `shop_quotation_guard` are byte-identical to the repository chain; `shop_stage_o_quotations` and `shop_stage_p_accounts` are identical once SQL comments and whitespace are removed (the comments were left out when applying). Nothing is pending.
