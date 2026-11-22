import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync, readFileSync} from "node:fs";
import {assertStagingTarget, missingMigrations, planMigrationRun, noLiveDataSql, evaluateNoLiveData, KNOWN_PRODUCTION_REFS} from "../scripts/staging-guard.mjs";

const repo = readdirSync(new URL("../supabase/migrations/", import.meta.url));
// The 37 names read (read-only) from production on 2026-11-22.
const PROD = `business_identity restrict_rls_helper company_binding_recovery_server_only company_recovery_reviewer_audit stakeholder_session_bound_membership shared_shop_ledger shared_shop_refunds_and_opening_import shared_shop_full_till shop_refund_policy invite_24h shop_stage_c_read_models shop_stage_d_stock_workflows shop_stage_d_purchase_payables shop_stage_d_online_orders shop_purchase_order_read_model shared_order_lines shop_sales_hot_path_indexes shop_sales_search shop_product_details shop_daily_report shop_attendant_stock shop_customer_archive shop_join_codes shop_expenses shop_refund_requests shop_profit_report shop_quotations shop_accounts shop_staff_shifts_audit telegram_bot phase_b_cloud_business_type shop_product_variants_20261115 shop_stocktake_batch_sessions_20261115 shop_public_order_requests_20261115 tallybook_active_session_proof company_creation_active_session telegram_daily_summary`.split(" ");

test("production is refused as a staging target; malformed refs are refused", () => {
  for (const r of KNOWN_PRODUCTION_REFS) assert.throws(() => assertStagingTarget(r), /production/);
  assert.throws(() => assertStagingTarget("short"), /20-character/);
  assert.throws(() => assertStagingTarget(undefined), /20-character/);
  assert.throws(() => assertStagingTarget("abcdefghij0123456789", ["abcdefghij0123456789"]), /production/, "extra production refs honoured");
  assert.equal(assertStagingTarget("abcdefghij0123456789", []), "abcdefghij0123456789");
});
test("exactly the six migrations are missing from production (by name)", () => {
  assert.equal(PROD.length, 37);
  assert.deepEqual(missingMigrations(repo, PROD).map(f => f.replace(/^\d+_|\.sql$/g, "")), ["business_type_active_session", "guest_order_price_snapshots", "connected_commerce_platform", "connected_commerce_discover", "payment_settlement_ledger", "shift_cash_reconciliation"]);
});
test("a brand-new empty staging project is planned as the full chain and the plan is never executable", () => {
  const p = planMigrationRun({targetRef: "abcdefghij0123456789", repoFiles: repo, hostedNames: [], productionNames: PROD});
  assert.equal(p.executable, false); assert.equal(p.steps.length, 43);
  assert.equal(p.missingOnProduction.length, 6); assert.deepEqual(p.steps.map(s => s.file), [...repo].sort());
  assert.ok(p.steps.every(s => s.rollback.endsWith("_down.sql")));
  assert.throws(() => planMigrationRun({targetRef: KNOWN_PRODUCTION_REFS[0], repoFiles: repo, hostedNames: PROD}), /production/);
});
test("staging brought to the production baseline needs exactly the six", () => {
  const p = planMigrationRun({targetRef: "abcdefghij0123456789", repoFiles: repo, hostedNames: PROD, productionNames: PROD});
  assert.equal(p.steps.length, 6); assert.deepEqual(p.steps.map(s => s.order), [1, 2, 3, 4, 5, 6]);
});
test("no-live-data check is read-only SQL and flags any non-synthetic business or user", () => {
  const sql = noLiveDataSql(); assert.ok(/^-- READ ONLY/.test(sql)); assert.ok(!/\b(insert|update|delete|drop|alter|truncate|create)\b/i.test(sql.replace(/^--.*$/m, "")));
  assert.equal(evaluateNoLiveData({businesses: 2, non_synthetic_businesses: 0, users: 3, non_synthetic_users: 0, shop_sales: 5, customer_entries: 1}).ok, true);
  assert.equal(evaluateNoLiveData({businesses: 3, non_synthetic_businesses: 1, users: 3, non_synthetic_users: 0, shop_sales: 1, customer_entries: 0}).ok, false);
  assert.equal(evaluateNoLiveData({businesses: 3, non_synthetic_businesses: 0, users: 3, non_synthetic_users: 2, shop_sales: 1, customer_entries: 0}).ok, false);
  assert.equal(evaluateNoLiveData({}).ok, false, "missing data is never 'ok'");
  assert.equal(evaluateNoLiveData(undefined).ok, false);
});
test("production's own row shape (3 businesses, 1 sale) would FAIL the no-live-data check", () => {
  assert.equal(evaluateNoLiveData({businesses: 3, non_synthetic_businesses: 3, users: 4, non_synthetic_users: 4, shop_sales: 1, customer_entries: 0}).ok, false);
});
