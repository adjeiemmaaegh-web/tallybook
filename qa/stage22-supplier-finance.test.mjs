/** Stage 22 supplier liability regression suite; no real provider payments.
 * Runs under native Node test with only disposable in-memory data.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {reconcileSupplierPayable,reconcileSupplierPayables}
 from "../client/src/features/purchases/supplierPayables.mjs";

const purchase=()=>({
 id:"purchase-001",businessProfileId:"company-A",supplierId:"supplier-A",
 currency:"GHS",totalCostMinor:10000,createdAt:"2026-10-17T09:00:00.000Z"
});
const event=(kind,amount,sequence,extra={})=>({
 id:"entry-"+sequence,businessProfileId:"company-A",supplierId:"supplier-A",
 purchaseId:"purchase-001",currency:"GHS",kind,amountMinor:amount,
 submissionKey:"submission-"+sequence,
 createdAt:"2026-10-17T10:00:0"+sequence+".000Z",...extra
});
test("manual recognized liability settles only from exact same-purchase attested events",()=>{
 const rows=[event("recognition",10000,0),event("payment",6000,1,{method:"cash"}),
   event("credit",4000,2)];
 assert.deepEqual(reconcileSupplierPayable(purchase(),rows),{
  status:"settled",recognizedMinor:10000,paidMinor:6000,creditedMinor:4000,outstandingMinor:0
 });
 assert.equal(reconcileSupplierPayable(purchase(),[]).status,"unknown");
});
test("unrecognized payments and excessive settlements never produce negative debt",()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase(),[event("payment",200,1,{method:"cash"})]),
   /explicit liability recognition/);
 assert.throws(()=>reconcileSupplierPayable(purchase(),[
   event("recognition",10000,0),event("payment",10001,1,{method:"cash"})
 ]),/exceeds/);
});
test("duplicate keys, foreign tenant and unsupported tender are rejected",()=>{
 const initial=event("recognition",10000,0);
 assert.throws(()=>reconcileSupplierPayable(purchase(),[initial,event("payment",100,1,{
  method:"cash",submissionKey:initial.submissionKey
 })]),/duplicate/);
 assert.throws(()=>reconcileSupplierPayable(purchase(),[initial,event("payment",100,1,{
  method:"cash",businessProfileId:"foreign"
 })]),/foreign/);
 assert.throws(()=>reconcileSupplierPayable(purchase(),[initial,event("payment",100,1,{
  method:"crypto"
 })]),/tender/);
});
test("strict saved purchase currency and chronological recognition protect legacy finance",()=>{
 const old=event("recognition",10000,0,{createdAt:"2026-10-16T10:00:00.000Z"});
 assert.throws(()=>reconcileSupplierPayable(purchase(),[old]),/malformed/);
 assert.throws(()=>reconcileSupplierPayable({...purchase(),currency:"ghs"},[]),/requires reconciliation/);
 assert.throws(()=>reconcileSupplierPayable({...purchase(),createdAt:"not-a-date"},[]),/requires reconciliation/);
});
test("recognition cannot claim bank/reference payment evidence",()=>{
 assert.throws(()=>reconcileSupplierPayable(purchase(),[
  event("recognition",10000,0,{reference:"bank-reference"})
 ]),/recognition/);
 assert.throws(()=>reconcileSupplierPayable(purchase(),[
  event("recognition",10000,0,{method:"cash"})
 ]),/recognition/);
});
test("mixed-currency purchase balances remain separate and missing recognition remains unknown",()=>{
 const p2={...purchase(),id:"purchase-002",supplierId:"supplier-B",currency:"USD",totalCostMinor:750};
 const rows=[
  event("recognition",10000,0),
  {...event("recognition",750,3),id:"entry-3",submissionKey:"submission-3",
   purchaseId:p2.id,supplierId:p2.supplierId,currency:"USD"}
 ];
 const result=reconcileSupplierPayables([purchase(),p2],rows);
 assert.equal(result.complete,true);
 assert.deepEqual(result.outstandingByCurrency,[
  {currency:"GHS",amountMinor:10000},{currency:"USD",amountMinor:750}
 ]);
 const missing=reconcileSupplierPayables([purchase(),p2],rows.slice(0,1));
 assert.equal(missing.unknownPurchases,1);
 assert.equal(missing.complete,false);
});
