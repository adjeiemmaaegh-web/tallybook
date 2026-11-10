# Migration history: repository vs the hosted projects

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

Not applied to production yet: `20261110140000_shop_product_details.sql` and `20261110150000_shop_daily_report.sql`.

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
