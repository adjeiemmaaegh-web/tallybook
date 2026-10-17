/** Developer regression source: never assign a currency to historical invoices.
 * The native QA runner must execute this file on the exact corrected SHA
 * before anyone can mark the implementation verified.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {deriveRun17Evidence} from "../client/src/features/insights/run17Evidence.mjs";
const company="primary",ts="2026-10-17T10:00:00.000Z";
const base=()=>({
 companyId:company,currency:"GHS",period:"today",asOf:"2026-10-17T12:00:00.000Z",
 startMs:Date.parse("2026-10-17T00:00:00.000Z"),
 endMs:Date.parse("2026-10-18T00:00:00.000Z"),
 products:[],sales:[],saleLines:[],saleReversals:[],cashPartialReturns:[],
 commerceOrders:[],commerceHolds:[],storeTransferRequests:[],storeLocations:[]
});
const sale=(id,currency)=>({
 id,businessProfileId:company,createdAt:ts,status:"completed",
 totalMinor:1500,...(currency?{currency}:{})
});
test("historical missing currency is explicitly reported rather than crashing or guessed",()=>{
 const report=deriveRun17Evidence({...base(),sales:[sale("legacy1",undefined)]});
 assert.equal(report.summary.grossRecordedInvoiceMinor,0);
 assert.equal(report.summary.recordedSaleCount,0);
 assert.equal(report.summary.legacyCurrencyUnverifiedSaleCount,1);
 assert.ok(report.findings.some(x=>x.title==="Historical sales excluded: currency not recorded"));
 assert.equal(report.summary.financialReconciliation,false);
});
test("verified currency receipts are counted but the unverified legacy amount is excluded",()=>{
 const report=deriveRun17Evidence({...base(),sales:[sale("legacy1",undefined),sale("modern1","GHS")]});
 assert.equal(report.summary.grossRecordedInvoiceMinor,1500);
 assert.equal(report.summary.recordedSaleCount,1);
 assert.equal(report.summary.legacyCurrencyUnverifiedSaleCount,1);
});
test("explicit mismatch never converts or mixes saved currencies",()=>{
 assert.throws(()=>deriveRun17Evidence({...base(),sales:[sale("foreign","USD")]}),/different currency/i);
});
