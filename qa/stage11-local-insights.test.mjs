import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalInsights} from '../client/src/features/insights/localInsights.mjs';
const base=()=>({inventory:[],debts:[],sales:[],range:{label:'Last 7 days'}});
test('rejects invalid source',()=>assert.throws(()=>createLocalInsights({}),TypeError));
test('no sales observation is evidence-limited',()=>assert.match(createLocalInsights(base())[0].title,/No completed sales/));
test('stock and debt findings show exact local evidence',()=>{const snapshot=base(); snapshot.inventory=[{productName:'Soap',stockQuantity:2,lowStockThreshold:3,isLowStock:true}];snapshot.debts=[{outstandingMinor:250}];snapshot.sales=[{id:'s1'}];const findings=createLocalInsights(snapshot);assert.deepEqual(findings.map(f=>f.id),['stock','debt','sales']);assert.match(findings[0].evidence,/Soap: 2/);assert.match(findings[1].evidence,/250/)});
test('non-low stock and settled debts do not trigger attention',()=>{const snapshot=base(); snapshot.inventory=[{productName:'Soap',stockQuantity:20,lowStockThreshold:3,isLowStock:false}];snapshot.debts=[{outstandingMinor:0}];assert.deepEqual(createLocalInsights(snapshot).map(f=>f.id),['sales'])});
