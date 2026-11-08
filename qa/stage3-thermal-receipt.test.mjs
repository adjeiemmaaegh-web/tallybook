import test from "node:test";
import assert from "node:assert/strict";
import {renderThermalReceiptText,THERMAL_COLUMNS} from "../client/src/features/receipts/thermalReceipt.mjs";
test("58 and 80 mm layout wraps without deleting receipt amounts",()=>{
  const text="GHANA SHOP\nReceipt 124\nVAT 15%: GHS 12.50\n"+("EXTRA LONG PRODUCT NAME ".repeat(7))+"\nTOTAL: GHS 112.50";
  for(const size of [58,80]){
    const laid=renderThermalReceiptText(text,size);
    assert.ok(laid.split("\n").every(line=>Array.from(line).length<=THERMAL_COLUMNS[size]));
    assert.match(laid,/TOTAL: GHS 112.50/);
    assert.match(laid,/VAT 15%: GHS 12.50/);
  }
});
test("escapes control bytes rather than emitting printer command sequences",()=>{
 const result=renderThermalReceiptText("SAFE\x1B\x00SHOP\r\nTOTAL",58);
 assert.equal(result,"SAFESHOP\nTOTAL\n\n");
});
test("rejects unsupported widths and unbounded content",()=>{
 assert.throws(()=>renderThermalReceiptText("x",40),/58 mm/);
 assert.throws(()=>renderThermalReceiptText("x".repeat(20001),80),/too large/);
});
