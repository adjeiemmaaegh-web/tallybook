import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/migrations/20261109010000_shop_purchase_order_read_model.sql","utf8");
const client=readFileSync("client/src/cloud/shopPurchasing.ts","utf8");
test("owner-only purchase order read model keeps all existing shop RPC dispatches",()=>{
 assert.match(sql,/private\.shop_member_role\(p_actor,p_session,v_company\)/);
 assert.match(sql,/v_role<>'owner'/);
 for(const action of ["listPurchaseOrders","listOnlineOrders","createOnlineOrder","saveSupplier","settleSupplier","receivePurchase","startStockCount","requestTransfer"]){
  assert.ok(sql.includes("'"+action+"'"),"missing "+action);
 }
 assert.match(sql,/limit 100/);
 assert.match(sql,/where business_id=v_company/);
 assert.doesNotMatch(sql,/drop table|alter table.*drop|disable row level security/i);
});
test("client wrapper uses ops RPC and immutable keys for receipt and supplier actions",()=>{
 for(const action of ["supplierBalances","purchaseDetails","listPurchaseOrders","saveSupplier","createPurchaseOrder","receivePurchase","settleSupplier"]){
 assert.ok(client.includes('"'+action+'"'),action);
 }
 assert.match(client,/externalSettlementConfirmed:true/);
 assert.match(client,/receiptId:string/);
 assert.match(client,/orderId:string/);
});
