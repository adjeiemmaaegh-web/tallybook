import test from 'node:test';import assert from 'node:assert/strict';
import {reconcileInventory} from './inventoryReconciliation.ts';
import {auditStoreTransfers} from './multiStoreStockControl.ts';
import {assertCompanyIsolation,companyScopedRead} from './companyIsolationGuard.ts';
import {auditStaffAuthorization} from './staffAuthorizationAudit.ts';
const stock={companyId:'a',storeId:'s',productId:'p',opening:10,receipts:2,returns:0,sales:3,transfersIn:0,transfersOut:0,adjustments:0,closing:9};
test('stock conservation valid',()=>assert.deepEqual(reconcileInventory([stock]),[]));
test('stock mismatch and duplicate scope flagged',()=>assert.deepEqual(reconcileInventory([stock,{...stock,closing:8}]).map(x=>x.code),['DUPLICATE_SCOPE','STOCK_MISMATCH']));
test('stock overflow rejected',()=>assert.ok(reconcileInventory([{...stock,opening:Number.MAX_SAFE_INTEGER,receipts:9}]).some(x=>x.code==='OVERFLOW')));
const transfer={id:'t',companyId:'a',productId:'p',sourceStoreId:'1',destinationStoreId:'2',quantity:5,dispatched:5,received:5,status:'received'};
test('valid transfer',()=>assert.deepEqual(auditStoreTransfers([transfer]),[]));
test('over-receipt blocked',()=>assert.ok(auditStoreTransfers([{...transfer,received:6}]).some(x=>x.code==='OVER_TRANSFER')));
test('cross-company mismatch fails closed',()=>assert.throws(()=>assertCompanyIsolation({expectedCompanyId:'a',activeCompanyId:'b',recordCompanyId:'a'})));
test('async company switch rejected',async()=>{let company='a';await assert.rejects(companyScopedRead('a',()=>company,async()=>{company='b';return {businessProfileId:'a',value:1}}));});
const access={companyId:'a',recordCompanyId:'a',staffId:'s',activeStaffId:'s',role:'cashier',permission:'sell',grantedPermissions:['sell'],shiftOpen:true,sessionExpiresAt:200,now:100,disabled:false};
test('valid cashier permission',()=>assert.equal(auditStaffAuthorization(access).allowed,true));
test('cashier refund denied',()=>assert.equal(auditStaffAuthorization({...access,permission:'refund'}).allowed,false));
test('expired staff session denied',()=>assert.ok(auditStaffAuthorization({...access,now:200}).reasons.includes('SESSION')));

test('non-finite now is not an authorized session',()=>{
 const a={companyId:'co',recordCompanyId:'co',staffId:'staff',activeStaffId:'staff',role:'owner',permission:'sell',grantedPermissions:['sell'],shiftOpen:true,sessionExpiresAt:9999999999999,now:NaN,disabled:false};
 assert.equal(auditStaffAuthorization(a).allowed,false);
});
