# Rolling migrations back

Each migration from `20261106120000` onward has a matching `*_down.sql` here.

**Order matters: run rollbacks newest first.** Each one restores the state its migration found, so they only fit together in reverse order:

1. `20261111180000_shop_staff_shifts_audit_down.sql` (removes shift and review history)
2. `20261111170000_shop_accounts_down.sql`
3. `20261111160000_shop_quotations_down.sql`
4. `20261111150000_shop_profit_report_down.sql`
5. `20261111140000_shop_refund_requests_down.sql`
6. `20261111130000_shop_expenses_down.sql`
7. `20261111120000_shop_join_codes_down.sql`
8. `20261111110000_shop_customer_archive_down.sql`
9. `20261111100000_shop_attendant_stock_down.sql`
10. `20261110150000_shop_daily_report_down.sql`
11. `20261110140000_shop_product_details_down.sql`
12. `20261110130000_shop_sales_search_down.sql`
13. `20261110120000_shop_sales_hot_path_indexes_down.sql`
14. `20261109020000_shared_order_lines_down.sql`
15. `20261109010000_shop_purchase_order_read_model_down.sql`
16. `20261108130000_shop_stage_d_online_orders_down.sql`
17. `20261108120000_shop_stage_d_purchase_payables_down.sql`
18. `20261108110000_shop_stage_d_stock_workflows_down.sql`
19. `20261108100000_shop_stage_c_read_models_down.sql`
20. `20261106130000_invite_24h_down.sql`
21. `20261106120000_shop_refund_policy_down.sql`

Things to know before you run one:

- **Some rollbacks delete data.** Online orders (number 15), purchasing records (number 16) and the new product fields (number 10) are removed with their tables or columns, and so are account transfers and reconciliation counts (number 1), quotations (number 2), profit report (number 3: the recorded cost of past sales is lost), refund requests (number 4), expenses (number 5), join codes (number 6) and archived customers (number 7). The warning is at the top of each file. Export what you need first.
- **One refuses on purpose.** `20261108110000` will not run while the stock movement history holds entries made by a count, transfer or purchase, because rolling back would orphan them.
- **Take a backup or use point-in-time recovery first.** A rollback is a last resort; fixing forward with a new migration is usually safer.
- The test `qa/migration-rollbacks.test.mjs` applies every migration, rolls them all back in this order, checks what is left, and applies them again.
