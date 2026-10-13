import assert from 'node:assert/strict';
import { test } from 'node:test';
import {previewFifoCost} from '../client/src/features/inventory/historicalCosting.ts';
const layer = (id, remainingUnits, unitCostMinor, receivedAt='2026-01-01T00:00:00.000Z') => ({id,remainingUnits,unitCostMinor,receivedAt,productId:'p',companyId:'c'});
const req = {companyId:'c',productId:'p',quantity:3};
test('allocates in chronological order without mutating caller data',()=>{
  const src=[layer('new',2,70,'2026-02-01T00:00:00Z'),layer('old',2,50)];
  const result=previewFifoCost(req,src);
  assert.deepEqual(result.allocations.map(x=>[x.layerId,x.units,x.amountMinor]),[['old',2,100],['new',1,70]]);
  assert.equal(result.totalCostMinor,170); assert.equal(result.complete,true); assert.equal(src[0].remainingUnits,2);
});
test('incomplete layers never imply zero missing cost',()=>{const x=previewFifoCost(req,[layer('one',1,50)]); assert.equal(x.complete,false); assert.equal(x.unallocatedUnits,2)});
test('rejects cross-company and wrong-product layers',()=>{for(const patch of [{companyId:'other'},{productId:'other'}]) assert.throws(()=>previewFifoCost(req,[{...layer('a',3,10),...patch}]))});
test('rejects duplicated cost layers',()=>assert.throws(()=>previewFifoCost(req,[layer('a',2,10),layer('a',2,10)])));
test('rejects negative, fractional and invalid monetary costs',()=>{for(const cost of [-1,1.5,Infinity,Number.MAX_SAFE_INTEGER+1]) assert.throws(()=>previewFifoCost(req,[layer('a',3,cost)]))});
test('rejects multiplication overflow',()=>assert.throws(()=>previewFifoCost(req,[layer('a',3,Number.MAX_SAFE_INTEGER)])));
test('rejects invalid requests and malformed dates',()=>{assert.throws(()=>previewFifoCost({...req,quantity:1.5},[])); assert.throws(()=>previewFifoCost(req,[layer('a',3,30,'broken')]))});

test('historical cutoff excludes receipts occurring after the sale',()=>{
  const result=previewFifoCost({...req,asOf:'2026-01-15T12:00:00Z'},[
    layer('later',3,1,'2026-02-01T00:00:00Z'),layer('earlier',1,25,'2026-01-01T00:00:00Z')]);
  assert.deepEqual(result.allocations.map(x=>x.layerId),['earlier']);
  assert.equal(result.unallocatedUnits,2); assert.equal(result.complete,false);
});
test('historical cutoff rejects invalid timestamps',()=>{
  assert.throws(()=>previewFifoCost({...req,asOf:'bad'},[]));
});
test('FIFO compares actual timestamps rather than timezone string order',()=>{
  const result=previewFifoCost({...req,quantity:2},[
    layer('later',1,40,'2026-01-01T10:00:00+01:00'),
    layer('earlier',1,20,'2026-01-01T08:30:00Z')]);
  assert.deepEqual(result.allocations.map(x=>x.layerId),['earlier','later']);
});
