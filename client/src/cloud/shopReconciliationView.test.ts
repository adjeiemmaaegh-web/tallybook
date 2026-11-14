import {describe,it,expect} from "vitest";
import {physicalCountPreview,summarizeExpenses,formatExactExpenseMinor,filterQuotations} from "./shopReconciliationView";
import type {Quotation} from "./quotations";

describe("stocktake count preview",()=>{
 it("shows only verified numeric deltas and keeps physical count independent of server stock writes",()=>{
  expect(physicalCountPreview(12,"7")).toEqual({expected:12,counted:7,variance:-5,direction:"short"});
  expect(physicalCountPreview(12,"20")).toEqual({expected:12,counted:20,variance:8,direction:"over"});
  expect(physicalCountPreview(12,"12")).toEqual({expected:12,counted:12,variance:0,direction:"matched"});
 });
 it("refuses overflow, decimals, scientific input and negative counts",()=>{
  for(const input of ["-1","2.5","1e3","2147483648","NaN",""])expect(physicalCountPreview(3,input)).toBeNull();
  expect(physicalCountPreview(Number.MAX_SAFE_INTEGER+1,"5")).toBeNull();
 });
});
describe("expense integrity",()=>{
 it("uses exact BigInt totals and excludes cancelled postings",()=>{
  expect(summarizeExpenses([
    {amountMinor:"9007199254740993",voided:false},
    {amountMinor:"12",voided:false},
    {amountMinor:"999999",voided:true}
  ])).toEqual({loaded:3,active:2,voided:1,totalMinor:"9007199254741005"});
  expect(formatExactExpenseMinor("9007199254741005","GHS")).toContain("9007199254741005 minor units");
 });
 it("fails closed for invalid amounts",()=>{
  expect(summarizeExpenses([{amountMinor:"garbled",voided:false}]).totalMinor).toBeNull();
  expect(formatExactExpenseMinor("-5","GHS")).toContain("Unavailable");
 });
});
describe("quotation filtering",()=>{
 const quote=(quoteNo:number,status:Quotation["status"],customerName:string)=>({quoteNo,status,customerName,quotationId:"q"+quoteNo} as Quotation);
 const data=[quote(1,"open","Ada"),quote(2,"accepted","Esi"),quote(3,"converted","Kofi"),quote(4,"expired","Alice")];
 it("differentiates open/accepted offers from closed and sold, without mutating records",()=>{
  expect(filterQuotations(data,"live","").map(q=>q.quoteNo)).toEqual([1,2]);
  expect(filterQuotations(data,"closed","").map(q=>q.quoteNo)).toEqual([3,4]);
  expect(filterQuotations(data,"all"," q4 ").map(q=>q.quoteNo)).toEqual([4]);
  expect(filterQuotations(data,"all","ESI").map(q=>q.quoteNo)).toEqual([2]);
 });
});
