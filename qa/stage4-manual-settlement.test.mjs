import test from "node:test";
import assert from "node:assert/strict";
import {parseManualTenderStatement,reconcileManualTenderStatement} from "../client/src/features/payments/manualSettlement.mjs";
test("CSV parser handles quoted cells and blocks unsafe rows",()=>{
 const rows=parseManualTenderStatement('method,reference,amountMinor,providerId\nmobile,TX-001,1250,mt-id\ncard,"PSP-XY",700,\n');
 assert.equal(rows.length,2);assert.equal(rows[1].reference,"PSP-XY");
 for(const bad of ["method,reference,amountMinor\ncard,R-001,-3","method,reference,amountMinor\ncard,R-001,0","method,reference,amountMinor\ncard,R-001,3.4","method,reference,amountMinor\ncard,R-001,10\ncard,R-001,20,extra"])
   assert.throws(()=>parseManualTenderStatement(bad));
});
test("manual ledger reconciliation detects unmatched, mismatch and duplicate references",()=>{
 const payments=[
 {id:"a",businessProfileId:"shop",method:"mobile",amountMinor:1250,mobileMoneyProviderId:"mt-id",mobileMoneyReference:"TX-001"},
 {id:"b",businessProfileId:"shop",method:"card",amountMinor:700,cardReference:"PSP-XY"}];
 const file=parseManualTenderStatement("method,reference,amountMinor,providerId\nmobile,TX-001,1250,mt-id\ncard,PSP-XY,701,\n");
 const out=reconcileManualTenderStatement(payments,file,"shop");
 assert.deepEqual([out.matched,out.amountMismatches,out.statementUnmatched,out.ledgerUnmatched],[1,1,0,0]);
 assert.equal(out.verifiedByGateway,false);
 assert.throws(()=>reconcileManualTenderStatement(payments,[...file,file[0]],"shop"),/Duplicate/);
 assert.throws(()=>reconcileManualTenderStatement([...payments,{...payments[0],id:"c"}],file,"shop"),/Duplicate/);
 assert.throws(()=>reconcileManualTenderStatement([...payments,{...payments[0],businessProfileId:"foreign"}],file,"shop"),/Cross-company/);
});
