# Rolling migrations back

Each migration from `20261106120000` onward has a matching `*_down.sql` here.

**Order matters: run rollbacks newest first.** Each one restores the state its migration found, so they only fit together in reverse order:

1. `20261110150000_shop_daily_report_down.sql`
2. `20261110140000_shop_product_details_down.sql`
3. `20261110130000_shop_sales_search_down.sql`
4. `20261110120000_shop_sales_hot_path_indexes_down.sql`
5. `20261109020000_shared_order_lines_down.sql`
6. `20261109010000_shop_purchase_order_read_model_down.sql`
7. `20261108130000_shop_stage_d_online_orders_down.sql`
8. `20261108120000_shop_stage_d_purchase_payables_down.sql`
9. `20261108110000_shop_stage_d_stock_workflows_down.sql`
10. `20261108100000_shop_stage_c_read_models_down.sql`
11. `20261106130000_invite_24h_down.sql`
12. `20261106120000_shop_refund_policy_down.sql`

Things to know before you run one:

- **Some rollbacks delete data.** Online orders (8 above, number 7), purchasing records (number 8) and the new product fields (number 2) are removed with their tables or columns. The warning is at the top of each file. Export what you need first.
- **One refuses on purpose.** `20261108110000` will not run while the stock movement history holds entries made by a count, transfer or purchase, because rolling back would orphan them.
- **Take a backup or use point-in-time recovery first.** A rollback is a last resort; fixing forward with a new migration is usually safer.
- The test `qa/migration-rollbacks.test.mjs` applies every migration, rolls them all back in this order, checks what is left, and applies them again.
