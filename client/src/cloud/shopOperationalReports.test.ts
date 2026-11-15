import {describe,expect,it} from "vitest";
import {safeCsvText,exportLoadedSalesCsv,summarizeSuppliers,summarizeTransfers} from "./shopOperationalReports";
import type {ShopReceipt} from "./shopClient";

describe("real-data operational summaries",()=>{
 it("never counts in-transit units as received stock",()=>{
  expect(summarizeTransfers([
   {status:"requested",quantity:4},{status:"in_transit",quantity:9},
   {status:"received",quantity:2},{status:"cancelled",quantity:50}
  ])).toEqual({total:4,requested:1,inTransit:1,received:1,cancelled:1,unitsReceived:2});
 });
 it("uses BigInt for supplier minor-unit balances without rounding",()=>{
  expect(summarizeSuppliers([
   {supplierId:"a",name:"A",archived:false,receivedMinor:"0",settledMinor:"0",outstandingMinor:"9007199254740993"},
   {supplierId:"b",name:"B",archived:false,receivedMinor:"0",settledMinor:"0",outstandingMinor:"2"},
   {supplierId:"c",name:"C",archived:false,receivedMinor:"0",settledMinor:"0",outstandingMinor:"0"}
  ])).toEqual({suppliers:3,owing:2,outstandingMinor:"9007199254740995"});
 });
 it("fails closed on an invalid supplier amount instead of showing a fabricated total",()=>{
  expect(summarizeSuppliers([{supplierId:"x",name:"X",archived:false,receivedMinor:"0",settledMinor:"0",outstandingMinor:"unknown"}]).outstandingMinor).toBeNull();
 });
});
describe("authorized loaded-sales CSV",()=>{
 it("protects Excel formula text, tabs and quotes",()=>{
  expect(safeCsvText(' =HYPERLINK("http://bad")')).toBe('"\' =HYPERLINK(""http://bad"")"');
  expect(safeCsvText("@SUM(A1)")).toBe('"\'@SUM(A1)"');
  expect(safeCsvText("\t+cmd")).toBe('"\'\t+cmd"');
  expect(safeCsvText("Normal, shop")).toBe('"Normal, shop"');
 });
 it("exports only passed receipts, with integer minor-unit net totals",()=>{
  const sale={receiptNumber:27,recordedAt:"2026-11-14T10:00:00Z",storeName:"Accra",
   cashierId:"staff",saleId:"abc",currency:"GHS",totalMinor:5500,refundedMinor:500,
   payment:{method:"cash"},customer:{name:"=2+3"}} as ShopReceipt;
  const result=exportLoadedSalesCsv([sale]);
  expect(result).toContain('"5000"');
  expect(result).toContain('"\'=2+3"');
  expect(result).not.toContain("another-sale");
  expect(result.split("\r\n")).toHaveLength(3);
 });
});
