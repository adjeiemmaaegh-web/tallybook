import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveSkuDemand} from './skuDemand.mjs';
const product={id:'p1',businessProfileId:'primary',name:'Rice',stockQuantity:3,itemKind:'stock'};
const sale={id:'s1',businessProfileId:'primary',createdAt:'2026-10-24T09:00:00Z'};
const line={id:'l1',businessProfileId:'primary',saleId:'s1',productId:'p1',quantity:10};
const args=(extra={})=>({company:'primary',products:[product],sales:[sale],lines:[line],payments:[],reversals:[],returns:[],
 startMs:Date.parse('2026-10-24'),endMs:Date.parse('2026-10-31'),asOfMs:Date.parse('2026-10-30T12:00:00Z'),windowDays:7,...extra});
test('uses integer net units and current saved stock in explicit coverage arithmetic',()=>{
 const [row]=deriveSkuDemand(args());
 assert.equal(row.netUnits,10);assert.equal(row.coverageUnits,20);assert.equal(row.reorderUnits,17);
 assert.deepEqual(row.sourceLineIds,['l1']);
 assert.equal(deriveSkuDemand(args({products:[{...product,stockQuantity:25}]}))[0].reorderUnits,0);
});
test('does not infer a planning duration from all-history or reorder a service',()=>{
 assert.equal(deriveSkuDemand(args({windowDays:null}))[0].reorderUnits,null);
 assert.equal(deriveSkuDemand(args({products:[{...product,itemKind:'service'}]}))[0].reorderUnits,null);
});
test('full reversal removes units only when recorded by the review time',()=>{
 const reverse={id:'r1',businessProfileId:'primary',originalSaleId:'s1',createdAt:'2026-10-25T09:00:00Z',lines:[{productId:'p1',quantity:10}]};
 assert.deepEqual(deriveSkuDemand(args({reversals:[reverse]})),[]);
 assert.equal(deriveSkuDemand(args({reversals:[{...reverse,createdAt:'2026-10-31T09:00:00Z'}]}))[0].netUnits,10);
 assert.throws(()=>deriveSkuDemand(args({reversals:[{...reverse,lines:[{productId:'p1',quantity:9}]}]})),/differ/);
});
test('rejects foreign, duplicate, missing-line and unsafe quantity evidence',()=>{
 for(const changes of [{products:[{...product,businessProfileId:'foreign'}]},
  {lines:[line,line]},{lines:[]},{lines:[{...line,quantity:0.5}]},
  {lines:[{...line,quantity:Number.MAX_SAFE_INTEGER}]},
  {products:[{...product,stockQuantity:-1}]},{horizonDays:0}])assert.throws(()=>deriveSkuDemand(args(changes)));
});
test('excludes future and outside-window sales without changing records',()=>{
 const input=args({sales:[{...sale,createdAt:'2026-10-30T18:00:00Z'}]});
 const before=JSON.stringify(input);assert.deepEqual(deriveSkuDemand(input),[]);assert.equal(JSON.stringify(input),before);
 assert.deepEqual(deriveSkuDemand(args({sales:[{...sale,createdAt:'2026-10-23T23:00:00Z'}]})),[]);
});
