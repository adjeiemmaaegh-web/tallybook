import test from "node:test";
import assert from "node:assert/strict";
import {managementProfitFromRecordedFigures as profit} from "../client/src/features/reports/managementProfit.mjs";
test("verified net operating result uses saved net-of-recorded-tax sales, FIFO COGS and period expenses once",()=>{
 assert.deepEqual(profit({revenueExTaxMinor:120000,cogsMinor:75000,expensesMinor:15000,costsUnavailable:0,taxUnknownSales:0}),{
  status:"available",grossProfitMinor:45000,operatingResultMinor:30000,
  reason:"Derived only from recorded tax, inventory FIFO cost and operating expenses. Unrecorded charges are not included.",
  taxUnknownSales:0});
});
test("missing receipt cost never becomes a manufactured zero-profit number",()=>{
 const r=profit({revenueExTaxMinor:10000,cogsMinor:undefined,expensesMinor:1000,costsUnavailable:1,taxUnknownSales:3});
 assert.equal(r.status,"unavailable");assert.equal(r.operatingResultMinor,null);
});
test("returns and negative margin remain visible; tax uncertainty is explicit",()=>{
 const r=profit({revenueExTaxMinor:-500,cogsMinor:-300,expensesMinor:250,costsUnavailable:0,taxUnknownSales:1});
 assert.equal(r.grossProfitMinor,-200);assert.equal(r.operatingResultMinor,-450);assert.match(r.reason,/tax configuration/);
});
test("overflow and invalid cost coverage fail closed",()=>{
 for(const values of [
  {revenueExTaxMinor:Number.MAX_SAFE_INTEGER,cogsMinor:-1,expensesMinor:1,costsUnavailable:0,taxUnknownSales:0},
  {revenueExTaxMinor:2,cogsMinor:0,expensesMinor:-1,costsUnavailable:0,taxUnknownSales:0},
  {revenueExTaxMinor:5,cogsMinor:0,expensesMinor:2,costsUnavailable:-1,taxUnknownSales:0}
 ])assert.throws(()=>profit(values),/invalid|precision/);
});
