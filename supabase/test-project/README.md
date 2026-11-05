# Test project `lmneuqxfyxplrxjswpma` ("Tallybook V19 Sync Test")

This project has its own QA baseline (device enrollment, signed sale pull) and is **not** built from `supabase/migrations`.
On 2026-11-05 two migrations brought it to production parity for the shared shop:

1. `parity_production_membership_functions` — production's `private.tallybook_membership_action` and `public.tallybook_membership`
   (identical to `supabase/migrations/20261105022238_stakeholder_session_bound_membership.sql`, functions only; the tables already matched column for column).
2. `shared_shop_ledger` — identical to `supabase/migrations/20261105070036_shared_shop_ledger.sql`.

Hosted verification: `qa/supabase-shop-dryrun.sql` runs the owner-to-attendant journey as the real `authenticated`/`anon` roles and
always rolls back. Result on 2026-11-05: `DRYRUN PASS: 7 journey stages verified; all rows rolled back`; 0 rows left afterwards.

3. `shared_shop_refunds_and_opening_import` (QA version `20261105104748`) — identical to `supabase/migrations/20261105130000_shared_shop_refunds_and_opening_import.sql`
   (without the file's `begin;`/`commit;`). Adds owner refunds/voids and the opening import from a phone's books.

After step 3 the extended dry run (refund, retry, void, import with reuse/no-overwrite, currency refusal) gave
`DRYRUN PASS: 9 journey stages verified; all rows rolled back`; 0 refunds, 0 imports and 0 dry-run users left afterwards.
